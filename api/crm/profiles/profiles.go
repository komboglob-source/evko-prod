package profiles

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"crm_be/api/utils"
	"crm_be/database"
)

type profileMeResponse struct {
	AccountID        int64   `json:"account_id"`
	ID               int64   `json:"id"`
	Login            string  `json:"login"`
	Role             string  `json:"role"`
	FullName         string  `json:"full_name"`
	PhoneNumber      string  `json:"phone_number"`
	Email            string  `json:"email"`
	Image            string  `json:"image"`
	BirthDate        *string `json:"birth_date,omitempty"`
	Position         string  `json:"position"`
	HireDate         *string `json:"hire_date,omitempty"`
	ClientID         *int64  `json:"client_id,omitempty"`
	RepresentativeID *int64  `json:"representative_id,omitempty"`
}

type patchProfileMeRequest struct {
	FullName    *string `json:"full_name"`
	PhoneNumber *string `json:"phone_number"`
	Email       *string `json:"email"`
	Image       *string `json:"image"`
	BirthDate   *string `json:"birth_date"`
	Position    *string `json:"position"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	if path != "/me" && path != "/me/" {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		GetProfileMeHandler(w, r)
	case http.MethodPatch:
		PatchProfileMeHandler(w, r)
	default:
		http.Error(w, "incorrect method on profiles", http.StatusMethodNotAllowed)
	}
}

func GetProfileMeHandler(w http.ResponseWriter, r *http.Request) {
	accountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	profile, err := getProfileByAccountID(accountID)
	if err == sql.ErrNoRows {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, profile)
}

func PatchProfileMeHandler(w http.ResponseWriter, r *http.Request) {
	accountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	var body patchProfileMeRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	setClauses := make([]string, 0)
	args := make([]any, 0)
	argPos := 1

	if body.FullName != nil {
		setClauses = append(setClauses, "full_name = $"+itoa(argPos))
		args = append(args, strings.TrimSpace(*body.FullName))
		argPos++
	}
	if body.PhoneNumber != nil {
		setClauses = append(setClauses, "phone_number = $"+itoa(argPos))
		args = append(args, strings.TrimSpace(*body.PhoneNumber))
		argPos++
	}
	if body.Email != nil {
		setClauses = append(setClauses, "email = $"+itoa(argPos))
		args = append(args, strings.TrimSpace(*body.Email))
		argPos++
	}
	if body.Image != nil {
		setClauses = append(setClauses, "image = $"+itoa(argPos))
		args = append(args, []byte(strings.TrimSpace(*body.Image)))
		argPos++
	}
	if body.BirthDate != nil {
		if strings.TrimSpace(*body.BirthDate) == "" {
			setClauses = append(setClauses, "birth_date = NULL")
		} else {
			parsedDate, err := time.Parse("2006-01-02", strings.TrimSpace(*body.BirthDate))
			if err != nil {
				http.Error(w, "invalid birth_date", http.StatusBadRequest)
				return
			}
			setClauses = append(setClauses, "birth_date = $"+itoa(argPos))
			args = append(args, parsedDate)
			argPos++
		}
	}
	if body.Position != nil {
		setClauses = append(setClauses, "position = $"+itoa(argPos))
		args = append(args, strings.TrimSpace(*body.Position))
		argPos++
	}

	if len(setClauses) > 0 {
		args = append(args, accountID)
		_, err = database.DB.Exec(`
			UPDATE "profiles"."Profiles"
			SET `+strings.Join(setClauses, ", ")+`
			WHERE account_id = $`+itoa(argPos), args...)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	profile, err := getProfileByAccountID(accountID)
	if err == sql.ErrNoRows {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, profile)
}

func getProfileByAccountID(accountID int64) (profileMeResponse, error) {
	var (
		profile              profileMeResponse
		image                []byte
		birthDate            sql.NullTime
		hireDate             sql.NullTime
		clientID             sql.NullInt64
		representativeExists sql.NullInt64
	)

	err := database.DB.QueryRow(`
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
			employees.hire_date,
			representatives.client_id,
			representatives.account_id
		FROM "auth"."Accounts" accounts
		JOIN "auth"."Roles" roles ON roles.id = accounts.role_id
		JOIN "profiles"."Profiles" profiles ON profiles.account_id = accounts.id
		LEFT JOIN "hrm"."Employees" employees ON employees.account_id = accounts.id
		LEFT JOIN "crm"."Representatives" representatives ON representatives.account_id = accounts.id
		WHERE accounts.id = $1
	`, accountID).Scan(
		&profile.AccountID,
		&profile.Login,
		&profile.Role,
		&profile.FullName,
		&profile.PhoneNumber,
		&profile.Email,
		&image,
		&birthDate,
		&profile.Position,
		&hireDate,
		&clientID,
		&representativeExists,
	)
	if err != nil {
		return profileMeResponse{}, err
	}

	profile.ID = profile.AccountID
	profile.Image = utils.EncodeImage(image)

	if birthDate.Valid {
		value := birthDate.Time.Format("2006-01-02")
		profile.BirthDate = &value
	}
	if hireDate.Valid {
		value := hireDate.Time.Format("2006-01-02")
		profile.HireDate = &value
	}
	if clientID.Valid {
		value := clientID.Int64
		profile.ClientID = &value
	}
	if representativeExists.Valid {
		value := representativeExists.Int64
		profile.RepresentativeID = &value
	}

	return profile, nil
}

func itoa(v int) string {
	return strconv.Itoa(v)
}
