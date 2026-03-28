package clients

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	reprezentatives "crm_be/api/crm/reprezentatives"
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

type clientResponse struct {
	ID              int64                    `json:"id"`
	Name            string                   `json:"name"`
	Address         string                   `json:"address"`
	CEOID           *int64                   `json:"ceo_id,omitempty"`
	Representatives []representativeResponse `json:"representatives"`
}

type upsertClientRequest struct {
	Name    *string `json:"name"`
	Address *string `json:"address"`
	CEOID   *int64  `json:"ceo_id"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListClientsHandler(w, r)
		case http.MethodPost:
			CreateClientHandler(w, r)
		default:
			http.Error(w, "incorrect method on clients", http.StatusMethodNotAllowed)
		}
		return
	}

	clientID := utils.IsInteger(pathSegment)
	if clientID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	restPath := path[len(pathSegment):]
	if utils.StartsWith(restPath, "/representatives") {
		if r.Method == http.MethodPost && (restPath == "/representatives" || restPath == "/representatives/") {
			reprezentatives.CreateRepresentativeHandler(w, r, clientID)
			return
		}
		http.Error(w, "incorrect method on representatives", http.StatusMethodNotAllowed)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateClientHandler(w, r, clientID)
	case http.MethodDelete:
		DeleteClientHandler(w, r, clientID)
	default:
		http.Error(w, "incorrect method on clients", http.StatusMethodNotAllowed)
	}
}

func ListClientsHandler(w http.ResponseWriter, r *http.Request) {
	items, err := listClients()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func CreateClientHandler(w http.ResponseWriter, r *http.Request) {
	var body upsertClientRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if body.Name == nil || body.Address == nil {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	var clientID int64
	err := database.DB.QueryRow(`
		INSERT INTO "crm"."Clients" (name, address, ceo_id)
		VALUES ($1, $2, $3)
		RETURNING id
	`, strings.TrimSpace(*body.Name), strings.TrimSpace(*body.Address), body.CEOID).Scan(&clientID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getClientByID(clientID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateClientHandler(w http.ResponseWriter, r *http.Request, clientID int64) {
	var body upsertClientRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	setClauses := make([]string, 0)
	args := make([]any, 0)
	argPos := 1

	if body.Name != nil {
		setClauses = append(setClauses, "name = $"+strconv.Itoa(argPos))
		args = append(args, strings.TrimSpace(*body.Name))
		argPos++
	}
	if body.Address != nil {
		setClauses = append(setClauses, "address = $"+strconv.Itoa(argPos))
		args = append(args, strings.TrimSpace(*body.Address))
		argPos++
	}
	if body.CEOID != nil {
		setClauses = append(setClauses, "ceo_id = $"+strconv.Itoa(argPos))
		args = append(args, body.CEOID)
		argPos++
	}

	if len(setClauses) == 0 {
		item, err := getClientByID(clientID)
		if err == sql.ErrNoRows {
			http.Error(w, "client not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		utils.WriteJSON(w, http.StatusOK, item)
		return
	}

	args = append(args, clientID)
	result, err := database.DB.Exec(`
		UPDATE "crm"."Clients"
		SET `+strings.Join(setClauses, ", ")+`
		WHERE id = $`+strconv.Itoa(argPos), args...)
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
		http.Error(w, "client not found", http.StatusNotFound)
		return
	}

	item, err := getClientByID(clientID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteClientHandler(w http.ResponseWriter, r *http.Request, clientID int64) {
	result, err := database.DB.Exec(`
		DELETE FROM "crm"."Clients"
		WHERE id = $1
	`, clientID)
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
		http.Error(w, "client not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func listClients() ([]clientResponse, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, address, ceo_id
		FROM "crm"."Clients"
		ORDER BY name, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	representativesByClient, err := listRepresentativesByClientID()
	if err != nil {
		return nil, err
	}

	items := make([]clientResponse, 0)
	for rows.Next() {
		var (
			item  clientResponse
			ceoID sql.NullInt64
		)
		if err := rows.Scan(&item.ID, &item.Name, &item.Address, &ceoID); err != nil {
			return nil, err
		}
		if ceoID.Valid {
			value := ceoID.Int64
			item.CEOID = &value
		}
		item.Representatives = representativesByClient[item.ID]
		if item.Representatives == nil {
			item.Representatives = make([]representativeResponse, 0)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func getClientByID(clientID int64) (clientResponse, error) {
	var (
		item  clientResponse
		ceoID sql.NullInt64
	)

	err := database.DB.QueryRow(`
		SELECT id, name, address, ceo_id
		FROM "crm"."Clients"
		WHERE id = $1
	`, clientID).Scan(&item.ID, &item.Name, &item.Address, &ceoID)
	if err != nil {
		return clientResponse{}, err
	}

	if ceoID.Valid {
		value := ceoID.Int64
		item.CEOID = &value
	}

	representativesByClient, err := listRepresentativesByClientID()
	if err != nil {
		return clientResponse{}, err
	}
	item.Representatives = representativesByClient[item.ID]
	if item.Representatives == nil {
		item.Representatives = make([]representativeResponse, 0)
	}

	return item, nil
}

func listRepresentativesByClientID() (map[int64][]representativeResponse, error) {
	rows, err := database.DB.Query(`
		SELECT
			representatives.client_id,
			accounts.id,
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
		ORDER BY representatives.client_id, profiles.full_name, accounts.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make(map[int64][]representativeResponse)
	for rows.Next() {
		var (
			clientID  int64
			item      representativeResponse
			image     []byte
			birthDate sql.NullTime
		)

		if err := rows.Scan(
			&clientID,
			&item.AccountID,
			&item.Login,
			&item.Role,
			&item.FullName,
			&item.PhoneNumber,
			&item.Email,
			&image,
			&birthDate,
			&item.Position,
		); err != nil {
			return nil, err
		}

		item.ClientID = clientID
		item.Image = utils.EncodeImage(image)
		if birthDate.Valid {
			value := birthDate.Time.Format("2006-01-02")
			item.BirthDate = &value
		}
		items[clientID] = append(items[clientID], item)
	}

	return items, rows.Err()
}
