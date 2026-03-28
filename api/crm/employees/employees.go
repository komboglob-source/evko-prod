package employees

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"crm_be/api/utils"
	"crm_be/database"
)

type employeeResponse struct {
	AccountID   int64   `json:"account_id"`
	Login       string  `json:"login"`
	Role        string  `json:"role"`
	FullName    string  `json:"full_name"`
	PhoneNumber string  `json:"phone_number"`
	Email       string  `json:"email"`
	Image       string  `json:"image"`
	BirthDate   *string `json:"birth_date,omitempty"`
	Position    string  `json:"position"`
	HireDate    *string `json:"hire_date,omitempty"`
}

type upsertEmployeeRequest struct {
	Login       *string `json:"login"`
	Password    *string `json:"password"`
	Role        *string `json:"role"`
	FullName    *string `json:"full_name"`
	PhoneNumber *string `json:"phone_number"`
	Email       *string `json:"email"`
	Image       *string `json:"image"`
	BirthDate   *string `json:"birth_date"`
	Position    *string `json:"position"`
	HireDate    *string `json:"hire_date"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListEmployeesHandler(w, r)
		case http.MethodPost:
			CreateEmployeeHandler(w, r)
		default:
			http.Error(w, "incorrect method on employees", http.StatusMethodNotAllowed)
		}
		return
	}

	accountID := utils.IsInteger(pathSegment)
	if accountID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateEmployeeHandler(w, r, accountID)
	case http.MethodDelete:
		DeleteEmployeeHandler(w, r, accountID)
	default:
		http.Error(w, "incorrect method on employees", http.StatusMethodNotAllowed)
	}
}

func ListEmployeesHandler(w http.ResponseWriter, r *http.Request) {
	roleFilter := strings.TrimSpace(r.URL.Query().Get("role"))

	sqlText := `
		SELECT
			accounts.id,
			accounts.login,
			roles.name,
			profiles.full_name,
			profiles.phone_number,
			profiles.email,
			COALESCE(profiles.image, ''::bytea),
			profiles.birth_date,
			COALESCE(profiles.position, ''),
			employees.hire_date
		FROM "hrm"."Employees" employees
		JOIN "auth"."Accounts" accounts ON accounts.id = employees.account_id
		JOIN "auth"."Roles" roles ON roles.id = accounts.role_id
		JOIN "profiles"."Profiles" profiles ON profiles.account_id = employees.account_id
	`

	args := make([]any, 0)
	if roleFilter != "" {
		sqlText += ` WHERE roles.name = $1`
		args = append(args, roleFilter)
	}
	sqlText += ` ORDER BY profiles.full_name, accounts.id`

	rows, err := database.DB.Query(sqlText, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]employeeResponse, 0)
	for rows.Next() {
		item, err := scanEmployee(rows)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func CreateEmployeeHandler(w http.ResponseWriter, r *http.Request) {
	var body upsertEmployeeRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if body.Login == nil || body.Password == nil || body.Role == nil || body.FullName == nil || body.PhoneNumber == nil || body.Email == nil {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	roleID, err := roleIDByName(*body.Role)
	if err != nil {
		http.Error(w, "invalid role", http.StatusBadRequest)
		return
	}

	passwordHash, err := utils.HashPassword(*body.Password)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	birthDate, err := parseOptionalDate(body.BirthDate)
	if err != nil {
		http.Error(w, "invalid birth_date", http.StatusBadRequest)
		return
	}
	hireDate, err := parseOptionalDate(body.HireDate)
	if err != nil {
		http.Error(w, "invalid hire_date", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var accountID int64
	err = tx.QueryRow(`
		INSERT INTO "auth"."Accounts" (login, password_hash, role_id)
		VALUES ($1, $2, $3)
		RETURNING id
	`, strings.TrimSpace(*body.Login), passwordHash, roleID).Scan(&accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(`
		INSERT INTO "profiles"."Profiles" (
			account_id, full_name, phone_number, email, image, birth_date, position
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, accountID, strings.TrimSpace(*body.FullName), strings.TrimSpace(*body.PhoneNumber), strings.TrimSpace(*body.Email), imageBytes(body.Image), birthDate, optionalTrimmedString(body.Position))
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(`
		INSERT INTO "hrm"."Employees" (account_id, hire_date)
		VALUES ($1, $2)
	`, accountID, hireDate)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getEmployeeByAccountID(accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateEmployeeHandler(w http.ResponseWriter, r *http.Request, accountID int64) {
	var body upsertEmployeeRequest
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
	if body.Role != nil {
		roleID, err := roleIDByName(*body.Role)
		if err != nil {
			http.Error(w, "invalid role", http.StatusBadRequest)
			return
		}
		accountSet = append(accountSet, "role_id = $"+strconv.Itoa(accountPos))
		accountArgs = append(accountArgs, roleID)
		accountPos++
	}
	if len(accountSet) > 0 {
		accountArgs = append(accountArgs, accountID)
		_, err = tx.Exec(`
			UPDATE "auth"."Accounts"
			SET `+strings.Join(accountSet, ", ")+`
			WHERE id = $`+strconv.Itoa(accountPos), accountArgs...)
		if err != nil {
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
		_, err = tx.Exec(`
			UPDATE "profiles"."Profiles"
			SET `+strings.Join(profileSet, ", ")+`
			WHERE account_id = $`+strconv.Itoa(profilePos), profileArgs...)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if body.HireDate != nil {
		var hireDate any
		if strings.TrimSpace(*body.HireDate) == "" {
			hireDate = nil
		} else {
			parsedDate, err := parseOptionalDate(body.HireDate)
			if err != nil {
				http.Error(w, "invalid hire_date", http.StatusBadRequest)
				return
			}
			hireDate = parsedDate
		}

		_, err = tx.Exec(`
			UPDATE "hrm"."Employees"
			SET hire_date = $1
			WHERE account_id = $2
		`, hireDate, accountID)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getEmployeeByAccountID(accountID)
	if err == sql.ErrNoRows {
		http.Error(w, "employee not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteEmployeeHandler(w http.ResponseWriter, r *http.Request, accountID int64) {
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
		http.Error(w, "employee not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getEmployeeByAccountID(accountID int64) (employeeResponse, error) {
	row := database.DB.QueryRow(`
		SELECT
			accounts.id,
			accounts.login,
			roles.name,
			profiles.full_name,
			profiles.phone_number,
			profiles.email,
			COALESCE(profiles.image, ''::bytea),
			profiles.birth_date,
			COALESCE(profiles.position, ''),
			employees.hire_date
		FROM "hrm"."Employees" employees
		JOIN "auth"."Accounts" accounts ON accounts.id = employees.account_id
		JOIN "auth"."Roles" roles ON roles.id = accounts.role_id
		JOIN "profiles"."Profiles" profiles ON profiles.account_id = employees.account_id
		WHERE employees.account_id = $1
	`, accountID)

	return scanEmployee(row)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanEmployee(row scanner) (employeeResponse, error) {
	var (
		item      employeeResponse
		image     []byte
		birthDate sql.NullTime
		hireDate  sql.NullTime
	)

	err := row.Scan(
		&item.AccountID,
		&item.Login,
		&item.Role,
		&item.FullName,
		&item.PhoneNumber,
		&item.Email,
		&image,
		&birthDate,
		&item.Position,
		&hireDate,
	)
	if err != nil {
		return employeeResponse{}, err
	}

	item.Image = utils.EncodeImage(image)
	if birthDate.Valid {
		value := birthDate.Time.Format("2006-01-02")
		item.BirthDate = &value
	}
	if hireDate.Valid {
		value := hireDate.Time.Format("2006-01-02")
		item.HireDate = &value
	}

	return item, nil
}

func roleIDByName(role string) (int, error) {
	normalized := strings.TrimSpace(role)
	switch normalized {
	case "admin", "ktp", "wfm", "ebko":
	default:
		return 0, errors.New("invalid role")
	}

	var roleID int
	err := database.DB.QueryRow(`
		SELECT id
		FROM "auth"."Roles"
		WHERE name = $1
	`, normalized).Scan(&roleID)
	return roleID, err
}

func parseOptionalDate(value *string) (any, error) {
	if value == nil {
		return nil, nil
	}
	if strings.TrimSpace(*value) == "" {
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
