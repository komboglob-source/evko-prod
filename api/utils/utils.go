package utils

import (
	"crm_be/database"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

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
