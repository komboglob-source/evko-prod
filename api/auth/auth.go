package auth

import (
	"crm_be/api/utils"
	"crm_be/database"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashSHA256(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}

func sendTokensJSON(w http.ResponseWriter, accessToken, refreshToken string) error {
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	switch {
	default:
		fmt.Fprint(w, "Unknown url path")
	case utils.StartsWith(path, "/login"):
		LoginHandler(w, r)
	case utils.StartsWith(path, "/refresh"):
		RefreshHandler(w, r)
	case utils.StartsWith(path, "/logout"):
		LogoutHandler(w, r)
	}
}

// curl -v -H "Authorization: Basic QWRtaW46YWRtaW4=" -X POST http://localhost:8080/api/v1/auth/login
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Basic ") {
		w.Header().Set("WWW-Authenticate", `Basic realm="Login"`)
		http.Error(w, "missing or invalid authorization header", http.StatusUnauthorized)
		return
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(authHeader, "Basic "))
	if err != nil {
		http.Error(w, "invalid basic auth format", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		http.Error(w, "invalid basic auth format", http.StatusBadRequest)
		return
	}
	login, password := parts[0], parts[1]

	var account_id int64
	var password_hash string
	err = database.DB.QueryRow(`
		SELECT id, password_hash FROM "auth"."Accounts" WHERE login = $1
	`, login).Scan(&account_id, &password_hash)
	if err != nil {
		http.Error(w, "invalid username or password", http.StatusUnauthorized)
		return
	}

	if !utils.CheckPassword(password, password_hash) {
		http.Error(w, "invalid username or password", http.StatusUnauthorized)
		return
	}

	accessToken, err := generateToken()
	if err != nil {
		log.Printf("failed to generate access token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	refreshToken, err := generateToken()
	if err != nil {
		log.Printf("failed to generate refresh token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	_, err = database.DB.Exec(`
		INSERT INTO "auth"."Sessions" (account_id, access_token_hash, refresh_token_hash)
		VALUES ($1, $2, $3)
	`, account_id, hashSHA256(accessToken), hashSHA256(refreshToken))
	if err != nil {
		log.Printf("failed to create session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err = sendTokensJSON(w, accessToken, refreshToken); err != nil {
		log.Printf("failed to send tokens: %v", err)
	}
}

// curl -v -H "Content-Type: application/json" -d '{"refresh_token": "..."}' -X POST http://localhost:8080/api/v1/auth/refresh
func RefreshHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		http.Error(w, "missing refresh_token in body", http.StatusBadRequest)
		return
	}

	var accountID int64
	var expiresAt time.Time
	err := database.DB.QueryRow(`
		SELECT account_id, refresh_token_expires_at
		FROM "auth"."Sessions"
		WHERE refresh_token_hash = $1 AND revoked_at IS NULL
	`, hashSHA256(body.RefreshToken)).Scan(&accountID, &expiresAt)
	if err != nil {
		http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	if time.Now().After(expiresAt) {
		http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	_, err = database.DB.Exec(`
		DELETE FROM "auth"."Sessions" WHERE refresh_token_hash = $1
	`, hashSHA256(body.RefreshToken))
	if err != nil {
		log.Printf("failed to delete old session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	newAccessToken, err := generateToken()
	if err != nil {
		log.Printf("failed to generate access token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	newRefreshToken, err := generateToken()
	if err != nil {
		log.Printf("failed to generate refresh token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	_, err = database.DB.Exec(`
		INSERT INTO "auth"."Sessions" (account_id, access_token_hash, refresh_token_hash)
		VALUES ($1, $2, $3)
	`, accountID, hashSHA256(newAccessToken), hashSHA256(newRefreshToken))
	if err != nil {
		log.Printf("failed to create session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err = sendTokensJSON(w, newAccessToken, newRefreshToken); err != nil {
		log.Printf("failed to send tokens: %v", err)
	}
}

// curl -v -H "Authorization: Bearer <access_token>" -X POST http://localhost:8080/api/v1/auth/logout
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, "missing or invalid authorization header", http.StatusUnauthorized)
		return
	}

	accessToken := strings.TrimPrefix(authHeader, "Bearer ")

	_, err := database.DB.Exec(`
		DELETE FROM "auth"."Sessions" WHERE access_token_hash = $1
	`, hashSHA256(accessToken))
	if err != nil {
		log.Printf("failed to delete session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type Account struct {
	ID            int64     `json:"id"`
	Login         string    `json:"login"`
	Password_Hash string    `json:"password_hash"`
	Role_ID       int32     `json:"role_id"`
	Created_At    time.Time `json:"created_at"`
}

type Session struct {
	ID                       int64     `json:"id"`
	Account_ID               int64     `json:"account_id"`
	Access_Token_Hash        string    `json:"access_token_hash"`
	Access_Token_Expires_At  time.Time `json:"access_token_expires_at"`
	Refresh_Token_Hash       string    `json:"refresh_token_hash"`
	Refresh_Token_Expires_At time.Time `json:"refresh_token_expires_at"`
	Created_At               time.Time `json:"created_at"`
	Last_Used_At             time.Time `json:"last_used_at,omitempty"`
	Revoked_At               time.Time `json:"revoked_at,omitempty"`
}
