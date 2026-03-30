package utils

import (
	"crm_be/database"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

var allowedImageContentTypes = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/gif":  {},
	"image/webp": {},
	"image/bmp":  {},
}

const maxImageBytes = 512 * 1024

func StartsWith(s, prefix string) bool {
	return (len(s) >= len(prefix)) && (s[:len(prefix)] == prefix)
}

func GetFirstPathSegment(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}

	path := u.Path
	if path == "" || path == "/" {
		return ""
	}

	parts := strings.SplitN(path, "/", 3)
	if len(parts) >= 2 && parts[1] != "" {
		return "/" + parts[1]
	}

	return ""
}

func IsInteger(s string) int64 {
	s = strings.TrimPrefix(s, "/")
	if s == "" {
		return -1
	}

	val, err := strconv.ParseInt(s, 10, 64)
	if err != nil || val < 0 {
		return -1
	}

	return val
}

func CheckToken(w http.ResponseWriter, r *http.Request) bool {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, "missing or invalid authorization header", http.StatusUnauthorized)
		return false
	}

	accessToken := strings.TrimPrefix(authHeader, "Bearer ")

	var expiresAt time.Time
	err := database.DB.QueryRow(`
		SELECT access_token_expires_at
		FROM "auth"."Sessions"
		WHERE access_token_hash = $1 AND revoked_at IS NULL
	`, HashSHA256(accessToken)).Scan(&expiresAt)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return false
	}

	if time.Now().After(expiresAt) {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return false
	}

	return true
}

func CheckPermission(w http.ResponseWriter, r *http.Request, requiredPermission string) bool {
	var permissionID int
	err := database.DB.QueryRow(`
		SELECT id
		FROM "auth"."Permissions"
		WHERE name = $1
	`, requiredPermission).Scan(&permissionID)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return false
	}

	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, "missing or invalid authorization header", http.StatusUnauthorized)
		return false
	}
	accessToken := strings.TrimPrefix(authHeader, "Bearer ")

	var accountID int64
	err = database.DB.QueryRow(`
		SELECT account_id
		FROM "auth"."Sessions"
		WHERE access_token_hash = $1
	`, HashSHA256(accessToken)).Scan(&accountID)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return false
	}

	var roleID int
	err = database.DB.QueryRow(`
		SELECT role_id
		FROM "auth"."Accounts"
		WHERE id = $1
	`, accountID).Scan(&roleID)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return false
	}

	var exists bool
	err = database.DB.QueryRow(`
		SELECT EXISTS (
			SELECT 1
			FROM "auth"."RolePermissions"
			WHERE role_id = $1 AND permission_id = $2
		)
	`, roleID, permissionID).Scan(&exists)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return false
	}

	if !exists {
		http.Error(w, "insufficient permissions", http.StatusForbidden)
		return false
	}

	return true
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func HashSHA256(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}

func EncodePicToBase64(pic []byte) string {
	if len(pic) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(pic)
}

func normalizeImageContentType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if index := strings.Index(value, ";"); index >= 0 {
		value = value[:index]
	}

	switch value {
	case "image/jpg":
		return "image/jpeg"
	default:
		return value
	}
}

func isAllowedImageContentType(value string) bool {
	_, exists := allowedImageContentTypes[normalizeImageContentType(value)]
	return exists
}

func DecodeImageBase64(value *string) ([]byte, error) {
	if value == nil {
		return nil, nil
	}

	rawValue := strings.TrimSpace(*value)
	if rawValue == "" {
		return nil, nil
	}

	if !strings.HasPrefix(strings.ToLower(rawValue), "data:") {
		return nil, errors.New("image must be uploaded as base64 image data")
	}

	commaIndex := strings.Index(rawValue, ",")
	if commaIndex < 0 {
		return nil, errors.New("image must be uploaded as base64 image data")
	}

	meta := rawValue[:commaIndex]
	payload := strings.TrimSpace(rawValue[commaIndex+1:])
	if !strings.HasSuffix(strings.ToLower(meta), ";base64") {
		return nil, errors.New("image must be uploaded as base64 image data")
	}

	contentType := normalizeImageContentType(strings.TrimPrefix(strings.SplitN(meta, ";", 2)[0], "data:"))
	if !isAllowedImageContentType(contentType) {
		return nil, errors.New("unsupported image type")
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, errors.New("invalid base64 image data")
	}
	if len(decoded) > maxImageBytes {
		return nil, errors.New("image is too large")
	}

	detectedContentType := normalizeImageContentType(http.DetectContentType(decoded))
	if !isAllowedImageContentType(detectedContentType) {
		return nil, errors.New("unsupported image type")
	}

	if detectedContentType != contentType {
		return nil, errors.New("image contents do not match image type")
	}

	return decoded, nil
}

func EncodeImage(pic []byte) string {
	if len(pic) == 0 {
		return ""
	}

	if utf8.Valid(pic) {
		value := string(pic)
		if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") || strings.HasPrefix(value, "data:image/") {
			return value
		}
	}

	contentType := normalizeImageContentType(http.DetectContentType(pic))
	if !isAllowedImageContentType(contentType) {
		return ""
	}

	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(pic)
}

func ParseOptionalDate(value *string) (*time.Time, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}

	parsedDate, err := time.Parse("2006-01-02", strings.TrimSpace(*value))
	if err != nil {
		return nil, err
	}

	return &parsedDate, nil
}

func ParseOptionalBirthDate(value *string) (*time.Time, error) {
	parsedDate, err := ParseOptionalDate(value)
	if err != nil || parsedDate == nil {
		return parsedDate, err
	}

	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	normalizedBirthDate := time.Date(
		parsedDate.Year(),
		parsedDate.Month(),
		parsedDate.Day(),
		0,
		0,
		0,
		0,
		time.UTC,
	)
	if normalizedBirthDate.After(today) {
		return nil, errors.New("birth date cannot be in the future")
	}

	return parsedDate, nil
}

func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func DecodeJSONBody(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}

func GetBearerToken(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", errors.New("missing or invalid authorization header")
	}
	return strings.TrimPrefix(authHeader, "Bearer "), nil
}

func GetCurrentAccountID(r *http.Request) (int64, error) {
	accessToken, err := GetBearerToken(r)
	if err != nil {
		return 0, err
	}

	var accountID int64
	err = database.DB.QueryRow(`
		SELECT account_id
		FROM "auth"."Sessions"
		WHERE access_token_hash = $1
		  AND revoked_at IS NULL
		  AND access_token_expires_at > now()
	`, HashSHA256(accessToken)).Scan(&accountID)
	if err != nil {
		return 0, err
	}

	return accountID, nil
}

func GetCurrentRoleName(r *http.Request) (string, error) {
	accountID, err := GetCurrentAccountID(r)
	if err != nil {
		return "", err
	}

	var roleName string
	err = database.DB.QueryRow(`
		SELECT roles.name
		FROM "auth"."Accounts" accounts
		JOIN "auth"."Roles" roles ON roles.id = accounts.role_id
		WHERE accounts.id = $1
	`, accountID).Scan(&roleName)
	if err != nil {
		return "", err
	}

	return roleName, nil
}
