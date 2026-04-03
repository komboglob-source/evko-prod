package profiles

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

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

type taskDashboardFiltersPayload struct {
	Status      string `json:"status"`
	Criticality string `json:"criticality"`
	Type        string `json:"type"`
	Search      string `json:"search"`
}

type taskDashboardSortPayload struct {
	Field     string `json:"field"`
	Direction string `json:"direction"`
}

type taskDashboardPayload struct {
	ID      string                      `json:"id"`
	Name    string                      `json:"name"`
	Filters taskDashboardFiltersPayload `json:"filters"`
	Sort    taskDashboardSortPayload    `json:"sort"`
}

func handleProfileUniqueViolation(w http.ResponseWriter, err error) bool {
	if !utils.IsUniqueViolation(err) {
		return false
	}

	http.Error(w, "phone number or email already exists", http.StatusConflict)
	return true
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	switch path {
	case "/me", "/me/":
		switch r.Method {
		case http.MethodGet:
			GetProfileMeHandler(w, r)
		case http.MethodPatch:
			PatchProfileMeHandler(w, r)
		default:
			http.Error(w, "incorrect method on profiles", http.StatusMethodNotAllowed)
		}
	case "/me/dashboards", "/me/dashboards/":
		switch r.Method {
		case http.MethodGet:
			GetProfileDashboardsHandler(w, r)
		case http.MethodPut:
			PutProfileDashboardsHandler(w, r)
		default:
			http.Error(w, "incorrect method on profile dashboards", http.StatusMethodNotAllowed)
		}
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
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

func GetProfileDashboardsHandler(w http.ResponseWriter, r *http.Request) {
	accountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	dashboards, err := getTaskDashboardsByAccountID(accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, dashboards)
}

func PutProfileDashboardsHandler(w http.ResponseWriter, r *http.Request) {
	accountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	var body []taskDashboardPayload
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	dashboards, err := sanitizeTaskDashboards(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	payload, err := json.Marshal(dashboards)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if _, err := database.DB.Exec(`
		INSERT INTO "profiles"."TaskDashboards" (account_id, payload)
		VALUES ($1, $2::jsonb)
		ON CONFLICT (account_id)
		DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
	`, accountID, string(payload)); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, dashboards)
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
		imageBytes, err := utils.DecodeImageBase64(body.Image)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		setClauses = append(setClauses, "image = $"+itoa(argPos))
		args = append(args, imageBytes)
		argPos++
	}
	if body.BirthDate != nil {
		if strings.TrimSpace(*body.BirthDate) == "" {
			setClauses = append(setClauses, "birth_date = NULL")
		} else {
			parsedDate, err := utils.ParseOptionalBirthDate(body.BirthDate)
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
			if handleProfileUniqueViolation(w, err) {
				return
			}
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

func getTaskDashboardsByAccountID(accountID int64) ([]taskDashboardPayload, error) {
	var payload []byte
	err := database.DB.QueryRow(`
		SELECT payload
		FROM "profiles"."TaskDashboards"
		WHERE account_id = $1
	`, accountID).Scan(&payload)
	if err == sql.ErrNoRows {
		return make([]taskDashboardPayload, 0), nil
	}
	if err != nil {
		return nil, err
	}

	var dashboards []taskDashboardPayload
	if err := json.Unmarshal(payload, &dashboards); err != nil {
		return nil, err
	}
	if dashboards == nil {
		return make([]taskDashboardPayload, 0), nil
	}

	return sanitizeTaskDashboards(dashboards)
}

func sanitizeTaskDashboards(items []taskDashboardPayload) ([]taskDashboardPayload, error) {
	if len(items) > 20 {
		return nil, errInvalidDashboardsPayload()
	}

	seenIDs := make(map[string]struct{}, len(items))
	result := make([]taskDashboardPayload, 0, len(items))

	for _, item := range items {
		item.ID = strings.TrimSpace(item.ID)
		item.Name = strings.TrimSpace(item.Name)
		item.Filters.Status = strings.TrimSpace(item.Filters.Status)
		item.Filters.Criticality = strings.TrimSpace(item.Filters.Criticality)
		item.Filters.Type = strings.TrimSpace(item.Filters.Type)
		item.Filters.Search = strings.TrimSpace(item.Filters.Search)
		item.Sort.Field = strings.TrimSpace(item.Sort.Field)
		item.Sort.Direction = strings.TrimSpace(item.Sort.Direction)

		if item.ID == "" || item.Name == "" {
			return nil, errInvalidDashboardsPayload()
		}
		if len(item.ID) > 128 || len(item.Name) > 128 || len(item.Filters.Search) > 255 {
			return nil, errInvalidDashboardsPayload()
		}
		if _, exists := seenIDs[item.ID]; exists {
			return nil, errInvalidDashboardsPayload()
		}
		seenIDs[item.ID] = struct{}{}

		if !containsString([]string{"all", "Created", "Opened", "Customer Pending", "Done", "Verified"}, item.Filters.Status) {
			return nil, errInvalidDashboardsPayload()
		}
		if !containsString([]string{"all", "Basic", "Important", "Critical"}, item.Filters.Criticality) {
			return nil, errInvalidDashboardsPayload()
		}
		if !containsString([]string{"all", "KTP", "WFM"}, item.Filters.Type) {
			return nil, errInvalidDashboardsPayload()
		}
		if !containsString([]string{"updatedAt", "createdAt", "criticality", "title"}, item.Sort.Field) {
			return nil, errInvalidDashboardsPayload()
		}
		if !containsString([]string{"asc", "desc"}, item.Sort.Direction) {
			return nil, errInvalidDashboardsPayload()
		}

		result = append(result, item)
	}

	return result, nil
}

func errInvalidDashboardsPayload() error {
	return &dashboardValidationError{message: "invalid dashboards payload"}
}

type dashboardValidationError struct {
	message string
}

func (err *dashboardValidationError) Error() string {
	return err.message
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
