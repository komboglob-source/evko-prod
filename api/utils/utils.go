package utils

import "golang.org/x/crypto/bcrypt"

func StartsWith(s, prefix string) bool {
	return (len(s) >= len(prefix)) && (s[:len(prefix)] == prefix)
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
