package reprezentatives

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"crm_be/api/utils"
	"crm_be/database"
)

type representativeResponse struct {
	AccountID   int64   `json:"account_id"`
	ClientID    int64   `json:"client_id"`
	Login       string  `json:"login"`
	Role        string  `json:"role"`
	FullName    string  `json:"full_name"`
	PhoneNumber string  `json:"phone_number"`
	Email       string  `json:"email"`
	Image       string  `json:"image"`
	BirthDate   *string `json:"birth_date,omitempty"`
	Position    string  `json:"position"`
}

type createRepresentativeRequest struct {
	Login       string  `json:"login"`
	Password    string  `json:"password"`
	FullName    string  `json:"full_name"`
	PhoneNumber string  `json:"phone_number"`
	Email       string  `json:"email"`
	Image       *string `json:"image"`
	BirthDate   *string `json:"birth_date"`
	Position    *string `json:"position"`
}

type updateRepresentativeRequest struct {
	Login       *string `json:"login"`
	Password    *string `json:"password"`
	ClientID    *int64  `json:"client_id"`
	FullName    *string `json:"full_name"`
	PhoneNumber *string `json:"phone_number"`
	Email       *string `json:"email"`
	Image       *string `json:"image"`
	BirthDate   *string `json:"birth_date"`
	Position    *string `json:"position"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	accountID := utils.IsInteger(pathSegment)
	if accountID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateRepresentativeHandler(w, r, accountID)
	case http.MethodDelete:
		DeleteRepresentativeHandler(w, r, accountID)
	default:
		http.Error(w, "incorrect method on representatives", http.StatusMethodNotAllowed)
	}
}

func CreateRepresentativeHandler(w http.ResponseWriter, r *http.Request, clientID int64) {
	var body createRepresentativeRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(body.Login) == "" || strings.TrimSpace(body.Password) == "" || strings.TrimSpace(body.FullName) == "" || strings.TrimSpace(body.PhoneNumber) == "" || strings.TrimSpace(body.Email) == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	passwordHash, err := utils.HashPassword(body.Password)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	birthDate, err := parseOptionalDate(body.BirthDate)
	if err != nil {
		http.Error(w, "invalid birth_date", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var roleID int
	if err := tx.QueryRow(`SELECT id FROM "auth"."Roles" WHERE name = 'client'`).Scan(&roleID); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	var accountID int64
	err = tx.QueryRow(`
		INSERT INTO "auth"."Accounts" (login, password_hash, role_id)
		VALUES ($1, $2, $3)
		RETURNING id
	`, strings.TrimSpace(body.Login), passwordHash, roleID).Scan(&accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(`
		INSERT INTO "profiles"."Profiles" (
			account_id, full_name, phone_number, email, image, birth_date, position
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, accountID, strings.TrimSpace(body.FullName), strings.TrimSpace(body.PhoneNumber), strings.TrimSpace(body.Email), imageBytes(body.Image), birthDate, optionalTrimmedString(body.Position))
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(`
		INSERT INTO "crm"."Representatives" (account_id, client_id)
		VALUES ($1, $2)
	`, accountID, clientID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getRepresentativeByAccountID(accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateRepresentativeHandler(w http.ResponseWriter, r *http.Request, accountID int64) {
	var body updateRepresentativeRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	accountSet := make([]string, 0)
	accountArgs := make([]any, 0)
	accountPos := 1

	if body.Login != nil {
		accountSet = append(accountSet, "login = $"+strconv.Itoa(accountPos))
		accountArgs = append(accountArgs, strings.TrimSpace(*body.Login))
		accountPos++
	}
	if body.Password != nil {
		passwordHash, err := utils.HashPassword(*body.Password)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		accountSet = append(accountSet, "password_hash = $"+strconv.Itoa(accountPos))
		accountArgs = append(accountArgs, passwordHash)
		accountPos++
	}
	if len(accountSet) > 0 {
		accountArgs = append(accountArgs, accountID)
		if _, err := tx.Exec(`
			UPDATE "auth"."Accounts"
			SET `+strings.Join(accountSet, ", ")+`
			WHERE id = $`+strconv.Itoa(accountPos), accountArgs...); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	profileSet := make([]string, 0)
	profileArgs := make([]any, 0)
	profilePos := 1

	if body.FullName != nil {
		profileSet = append(profileSet, "full_name = $"+strconv.Itoa(profilePos))
		profileArgs = append(profileArgs, strings.TrimSpace(*body.FullName))
		profilePos++
	}
	if body.PhoneNumber != nil {
		profileSet = append(profileSet, "phone_number = $"+strconv.Itoa(profilePos))
		profileArgs = append(profileArgs, strings.TrimSpace(*body.PhoneNumber))
		profilePos++
	}
	if body.Email != nil {
		profileSet = append(profileSet, "email = $"+strconv.Itoa(profilePos))
		profileArgs = append(profileArgs, strings.TrimSpace(*body.Email))
		profilePos++
	}
	if body.Image != nil {
		profileSet = append(profileSet, "image = $"+strconv.Itoa(profilePos))
		profileArgs = append(profileArgs, imageBytes(body.Image))
		profilePos++
	}
	if body.BirthDate != nil {
		if strings.TrimSpace(*body.BirthDate) == "" {
			profileSet = append(profileSet, "birth_date = NULL")
		} else {
			birthDate, err := parseOptionalDate(body.BirthDate)
			if err != nil {
				http.Error(w, "invalid birth_date", http.StatusBadRequest)
				return
			}
			profileSet = append(profileSet, "birth_date = $"+strconv.Itoa(profilePos))
			profileArgs = append(profileArgs, birthDate)
			profilePos++
		}
	}
	if body.Position != nil {
		profileSet = append(profileSet, "position = $"+strconv.Itoa(profilePos))
		profileArgs = append(profileArgs, optionalTrimmedString(body.Position))
		profilePos++
	}
	if len(profileSet) > 0 {
		profileArgs = append(profileArgs, accountID)
		if _, err := tx.Exec(`
			UPDATE "profiles"."Profiles"
			SET `+strings.Join(profileSet, ", ")+`
			WHERE account_id = $`+strconv.Itoa(profilePos), profileArgs...); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if body.ClientID != nil {
		if _, err := tx.Exec(`
			UPDATE "crm"."Representatives"
			SET client_id = $1
			WHERE account_id = $2
		`, *body.ClientID, accountID); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getRepresentativeByAccountID(accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteRepresentativeHandler(w http.ResponseWriter, r *http.Request, accountID int64) {
	result, err := database.DB.Exec(`
		DELETE FROM "auth"."Accounts"
		WHERE id = $1
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	affected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if affected == 0 {
		http.Error(w, "representative not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getRepresentativeByAccountID(accountID int64) (representativeResponse, error) {
	var (
		item      representativeResponse
		image     []byte
		birthDate sqlNullTime
	)

	err := database.DB.QueryRow(`
		SELECT
			accounts.id,
			representatives.client_id,
			accounts.login,
			roles.name,
			profiles.full_name,
			profiles.phone_number,
			profiles.email,
			COALESCE(profiles.image, ''::bytea),
			profiles.birth_date,
			COALESCE(profiles.position, '')
		FROM "crm"."Representatives" representatives
		JOIN "auth"."Accounts" accounts ON accounts.id = representatives.account_id
		JOIN "auth"."Roles" roles ON roles.id = accounts.role_id
		JOIN "profiles"."Profiles" profiles ON profiles.account_id = representatives.account_id
		WHERE representatives.account_id = $1
	`, accountID).Scan(
		&item.AccountID,
		&item.ClientID,
		&item.Login,
		&item.Role,
		&item.FullName,
		&item.PhoneNumber,
		&item.Email,
		&image,
		&birthDate,
		&item.Position,
	)
	if err != nil {
		return representativeResponse{}, err
	}

	item.Image = utils.EncodeImage(image)
	if birthDate.Valid {
		value := birthDate.Time.Format("2006-01-02")
		item.BirthDate = &value
	}

	return item, nil
}

type sqlNullTime struct {
	Time  time.Time
	Valid bool
}

func (nt *sqlNullTime) Scan(value any) error {
	if value == nil {
		nt.Valid = false
		nt.Time = time.Time{}
		return nil
	}

	switch v := value.(type) {
	case time.Time:
		nt.Time = v
		nt.Valid = true
		return nil
	default:
		return nil
	}
}

func parseOptionalDate(value *string) (any, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}

	parsedDate, err := time.Parse("2006-01-02", strings.TrimSpace(*value))
	if err != nil {
		return nil, err
	}

	return parsedDate, nil
}

func optionalTrimmedString(value *string) any {
	if value == nil {
		return nil
	}
	return strings.TrimSpace(*value)
}

func imageBytes(value *string) []byte {
	if value == nil {
		return nil
	}
	return []byte(strings.TrimSpace(*value))
}
