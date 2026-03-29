package clients

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

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

type clientListFilters struct {
	ID                      *int64
	Name                    string
	Address                 string
	CEOID                   *int64
	RepresentativeAccountID *int64
	RepresentativeLogin     string
	RepresentativeFullName  string
	RepresentativePhone     string
	RepresentativeEmail     string
	RepresentativePosition  string
	RepresentativeBirthFrom *time.Time
	RepresentativeBirthTo   *time.Time
	Query                   string
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
	filters, err := readClientListFilters(r)
	if err != nil {
		http.Error(w, "invalid query parameters", http.StatusBadRequest)
		return
	}

	items, err := listClients(filters)
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

func listClients(filters clientListFilters) ([]clientResponse, error) {
	rows, err := database.DB.Query(`
		SELECT DISTINCT
			clients.id,
			clients.name,
			clients.address,
			clients.ceo_id
		FROM "crm"."Clients" clients
		LEFT JOIN "crm"."Representatives" representatives ON representatives.client_id = clients.id
		LEFT JOIN "auth"."Accounts" accounts ON accounts.id = representatives.account_id
		LEFT JOIN "profiles"."Profiles" profiles ON profiles.account_id = representatives.account_id
		WHERE 1 = 1
	`+buildClientFilterSQL(filters), buildClientFilterArgs(filters)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]clientResponse, 0)
	clientIDs := make([]int64, 0)
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
		items = append(items, item)
		clientIDs = append(clientIDs, item.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	representativesByClient, err := listRepresentativesByClientID(clientIDs)
	if err != nil {
		return nil, err
	}
	for index := range items {
		items[index].Representatives = representativesByClient[items[index].ID]
		if items[index].Representatives == nil {
			items[index].Representatives = make([]representativeResponse, 0)
		}
	}

	return items, nil
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

	representativesByClient, err := listRepresentativesByClientID([]int64{item.ID})
	if err != nil {
		return clientResponse{}, err
	}
	item.Representatives = representativesByClient[item.ID]
	if item.Representatives == nil {
		item.Representatives = make([]representativeResponse, 0)
	}

	return item, nil
}

func listRepresentativesByClientID(clientIDs []int64) (map[int64][]representativeResponse, error) {
	items := make(map[int64][]representativeResponse)
	if len(clientIDs) == 0 {
		return items, nil
	}

	args := make([]any, 0, len(clientIDs))
	placeholders := make([]string, 0, len(clientIDs))
	for index, clientID := range clientIDs {
		args = append(args, clientID)
		placeholders = append(placeholders, "$"+strconv.Itoa(index+1))
	}

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
		WHERE representatives.client_id IN (`+strings.Join(placeholders, ", ")+`)
		ORDER BY representatives.client_id, profiles.full_name, accounts.id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

func readClientListFilters(r *http.Request) (clientListFilters, error) {
	var filters clientListFilters

	parseInt64 := func(raw string) (*int64, error) {
		if strings.TrimSpace(raw) == "" {
			return nil, nil
		}
		value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil {
			return nil, err
		}
		return &value, nil
	}
	parseDate := func(raw string) (*time.Time, error) {
		if strings.TrimSpace(raw) == "" {
			return nil, nil
		}
		value, err := time.Parse("2006-01-02", strings.TrimSpace(raw))
		if err != nil {
			return nil, err
		}
		return &value, nil
	}

	var err error
	if filters.ID, err = parseInt64(r.URL.Query().Get("id")); err != nil {
		return clientListFilters{}, err
	}
	if filters.CEOID, err = parseInt64(r.URL.Query().Get("ceo_id")); err != nil {
		return clientListFilters{}, err
	}
	if filters.RepresentativeAccountID, err = parseInt64(r.URL.Query().Get("representative_account_id")); err != nil {
		return clientListFilters{}, err
	}
	if filters.RepresentativeBirthFrom, err = parseDate(r.URL.Query().Get("representative_birth_date_from")); err != nil {
		return clientListFilters{}, err
	}
	if filters.RepresentativeBirthTo, err = parseDate(r.URL.Query().Get("representative_birth_date_to")); err != nil {
		return clientListFilters{}, err
	}

	filters.Name = strings.TrimSpace(r.URL.Query().Get("name"))
	filters.Address = strings.TrimSpace(r.URL.Query().Get("address"))
	filters.RepresentativeLogin = strings.TrimSpace(r.URL.Query().Get("representative_login"))
	filters.RepresentativeFullName = strings.TrimSpace(r.URL.Query().Get("representative_full_name"))
	filters.RepresentativePhone = strings.TrimSpace(r.URL.Query().Get("representative_phone_number"))
	filters.RepresentativeEmail = strings.TrimSpace(r.URL.Query().Get("representative_email"))
	filters.RepresentativePosition = strings.TrimSpace(r.URL.Query().Get("representative_position"))
	filters.Query = strings.TrimSpace(r.URL.Query().Get("q"))

	return filters, nil
}

func buildClientFilterSQL(filters clientListFilters) string {
	clauses := make([]string, 0)
	nextPlaceholder := 1
	addClause := func(sql string) {
		clauses = append(clauses, sql)
		nextPlaceholder++
	}

	if filters.ID != nil {
		addClause(`clients.id = $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.Name != "" {
		addClause(`clients.name ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.Address != "" {
		addClause(`clients.address ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.CEOID != nil {
		addClause(`clients.ceo_id = $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeAccountID != nil {
		addClause(`representatives.account_id = $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeLogin != "" {
		addClause(`accounts.login ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeFullName != "" {
		addClause(`profiles.full_name ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativePhone != "" {
		addClause(`profiles.phone_number ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeEmail != "" {
		addClause(`profiles.email ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativePosition != "" {
		addClause(`COALESCE(profiles.position, '') ILIKE $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeBirthFrom != nil {
		addClause(`profiles.birth_date >= $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.RepresentativeBirthTo != nil {
		addClause(`profiles.birth_date <= $` + strconv.Itoa(nextPlaceholder))
	}
	if filters.Query != "" {
		addClause(`(
			clients.name ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR clients.address ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR COALESCE(accounts.login, '') ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR COALESCE(profiles.full_name, '') ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR COALESCE(profiles.phone_number, '') ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR COALESCE(profiles.email, '') ILIKE $` + strconv.Itoa(nextPlaceholder) + `
			OR COALESCE(profiles.position, '') ILIKE $` + strconv.Itoa(nextPlaceholder) + `
		)`)
	}

	if len(clauses) == 0 {
		return ` ORDER BY clients.name, clients.id`
	}

	return ` AND ` + strings.Join(clauses, ` AND `) + ` ORDER BY clients.name, clients.id`
}

func buildClientFilterArgs(filters clientListFilters) []any {
	args := make([]any, 0)
	if filters.ID != nil {
		args = append(args, *filters.ID)
	}
	if filters.Name != "" {
		args = append(args, "%"+filters.Name+"%")
	}
	if filters.Address != "" {
		args = append(args, "%"+filters.Address+"%")
	}
	if filters.CEOID != nil {
		args = append(args, *filters.CEOID)
	}
	if filters.RepresentativeAccountID != nil {
		args = append(args, *filters.RepresentativeAccountID)
	}
	if filters.RepresentativeLogin != "" {
		args = append(args, "%"+filters.RepresentativeLogin+"%")
	}
	if filters.RepresentativeFullName != "" {
		args = append(args, "%"+filters.RepresentativeFullName+"%")
	}
	if filters.RepresentativePhone != "" {
		args = append(args, "%"+filters.RepresentativePhone+"%")
	}
	if filters.RepresentativeEmail != "" {
		args = append(args, "%"+filters.RepresentativeEmail+"%")
	}
	if filters.RepresentativePosition != "" {
		args = append(args, "%"+filters.RepresentativePosition+"%")
	}
	if filters.RepresentativeBirthFrom != nil {
		args = append(args, *filters.RepresentativeBirthFrom)
	}
	if filters.RepresentativeBirthTo != nil {
		args = append(args, *filters.RepresentativeBirthTo)
	}
	if filters.Query != "" {
		args = append(args, "%"+filters.Query+"%")
	}
	return args
}
