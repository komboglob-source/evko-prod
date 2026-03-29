package sites

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"crm_be/api/utils"
	"crm_be/database"
)

type siteResponse struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	ResponsibleID int64  `json:"responsible_id"`
	ClientID      int64  `json:"client_id"`
	ProductIDs    []int  `json:"product_ids"`
}

type upsertSiteRequest struct {
	ResponsibleID *int64  `json:"responsible_id"`
	Name          *string `json:"name"`
	Address       *string `json:"address"`
	ProductIDs    *[]int  `json:"product_ids"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListSitesHandler(w, r)
		case http.MethodPost:
			CreateSiteHandler(w, r)
		default:
			http.Error(w, "incorrect method on sites", http.StatusMethodNotAllowed)
		}
		return
	}

	siteID := utils.IsInteger(pathSegment)
	if siteID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateSiteHandler(w, r, siteID)
	case http.MethodDelete:
		DeleteSiteHandler(w, r, siteID)
	default:
		http.Error(w, "incorrect method on sites", http.StatusMethodNotAllowed)
	}
}

func ListSitesHandler(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT
			sites.id,
			sites.name,
			sites.address,
			sites.responsible_id,
			representatives.client_id
		FROM "crm"."Sites" sites
		JOIN "crm"."Representatives" representatives ON representatives.account_id = sites.responsible_id
		LEFT JOIN "profiles"."Profiles" responsible_profiles ON responsible_profiles.account_id = sites.responsible_id
		LEFT JOIN "crm"."Clients" clients ON clients.id = representatives.client_id
	`

	args := make([]any, 0)
	clauses := make([]string, 0)

	if value := strings.TrimSpace(r.URL.Query().Get("id")); value != "" {
		parsedValue, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "sites.id = $"+strconv.Itoa(len(args)+1))
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("client_id")); value != "" {
		parsedValue, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "representatives.client_id = $"+strconv.Itoa(len(args)+1))
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("responsible_id")); value != "" {
		parsedValue, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "sites.responsible_id = $"+strconv.Itoa(len(args)+1))
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("product_id")); value != "" {
		parsedValue, err := strconv.Atoi(value)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, `EXISTS (
			SELECT 1
			FROM "crm"."SitesProducts" products_filter
			WHERE products_filter.site_id = sites.id AND products_filter.product_id = $`+strconv.Itoa(len(args)+1)+`
		)`)
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("name")); value != "" {
		clauses = append(clauses, "sites.name ILIKE $"+strconv.Itoa(len(args)+1))
		args = append(args, "%"+value+"%")
	}
	if value := strings.TrimSpace(r.URL.Query().Get("address")); value != "" {
		clauses = append(clauses, "sites.address ILIKE $"+strconv.Itoa(len(args)+1))
		args = append(args, "%"+value+"%")
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		clauses = append(clauses, `(
			sites.name ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR sites.address ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(clients.name, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(clients.address, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(responsible_profiles.full_name, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR EXISTS (
				SELECT 1
				FROM "crm"."SitesProducts" linked_products
				JOIN "crm"."Products" products ON products.id = linked_products.product_id
				WHERE linked_products.site_id = sites.id
					AND products.name ILIKE $`+strconv.Itoa(len(args)+1)+`
			)
		)`)
		args = append(args, "%"+value+"%")
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY sites.name, sites.id"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	productIDsBySite, err := listProductIDsBySite()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	items := make([]siteResponse, 0)
	for rows.Next() {
		var item siteResponse
		if err := rows.Scan(&item.ID, &item.Name, &item.Address, &item.ResponsibleID, &item.ClientID); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		item.ProductIDs = productIDsBySite[item.ID]
		if item.ProductIDs == nil {
			item.ProductIDs = make([]int, 0)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func CreateSiteHandler(w http.ResponseWriter, r *http.Request) {
	var body upsertSiteRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if body.ResponsibleID == nil || body.Name == nil || body.Address == nil || body.ProductIDs == nil {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	clientID, err := clientIDByResponsible(*body.ResponsibleID)
	if err != nil || !allProductsExist(*body.ProductIDs) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}
	_ = clientID

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var siteID int64
	err = tx.QueryRow(`
		INSERT INTO "crm"."Sites" (responsible_id, name, address)
		VALUES ($1, $2, $3)
		RETURNING id
	`, *body.ResponsibleID, strings.TrimSpace(*body.Name), strings.TrimSpace(*body.Address)).Scan(&siteID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if err := replaceSiteProductsTx(tx, siteID, *body.ProductIDs); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getSiteByID(siteID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateSiteHandler(w http.ResponseWriter, r *http.Request, siteID int64) {
	currentSite, err := getSiteByID(siteID)
	if err == sql.ErrNoRows {
		http.Error(w, "site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	var body upsertSiteRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	nextResponsibleID := currentSite.ResponsibleID
	if body.ResponsibleID != nil {
		nextResponsibleID = *body.ResponsibleID
	}
	nextProductIDs := currentSite.ProductIDs
	if body.ProductIDs != nil {
		nextProductIDs = *body.ProductIDs
	}

	if _, err := clientIDByResponsible(nextResponsibleID); err != nil || !allProductsExist(nextProductIDs) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	setClauses := make([]string, 0)
	args := make([]any, 0)
	argPos := 1

	if body.ResponsibleID != nil {
		setClauses = append(setClauses, "responsible_id = $"+strconv.Itoa(argPos))
		args = append(args, *body.ResponsibleID)
		argPos++
	}
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
	if len(setClauses) > 0 {
		args = append(args, siteID)
		if _, err := tx.Exec(`
			UPDATE "crm"."Sites"
			SET `+strings.Join(setClauses, ", ")+`
			WHERE id = $`+strconv.Itoa(argPos), args...); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if body.ProductIDs != nil {
		if err := replaceSiteProductsTx(tx, siteID, *body.ProductIDs); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getSiteByID(siteID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteSiteHandler(w http.ResponseWriter, r *http.Request, siteID int64) {
	result, err := database.DB.Exec(`
		DELETE FROM "crm"."Sites"
		WHERE id = $1
	`, siteID)
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
		http.Error(w, "site not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getSiteByID(siteID int64) (siteResponse, error) {
	var item siteResponse
	err := database.DB.QueryRow(`
		SELECT
			sites.id,
			sites.name,
			sites.address,
			sites.responsible_id,
			representatives.client_id
		FROM "crm"."Sites" sites
		JOIN "crm"."Representatives" representatives ON representatives.account_id = sites.responsible_id
		WHERE sites.id = $1
	`, siteID).Scan(&item.ID, &item.Name, &item.Address, &item.ResponsibleID, &item.ClientID)
	if err != nil {
		return siteResponse{}, err
	}

	productIDsBySite, err := listProductIDsBySite()
	if err != nil {
		return siteResponse{}, err
	}
	item.ProductIDs = productIDsBySite[item.ID]
	if item.ProductIDs == nil {
		item.ProductIDs = make([]int, 0)
	}

	return item, nil
}

func listProductIDsBySite() (map[int64][]int, error) {
	rows, err := database.DB.Query(`
		SELECT site_id, product_id
		FROM "crm"."SitesProducts"
		ORDER BY site_id, product_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64][]int)
	for rows.Next() {
		var siteID int64
		var productID int
		if err := rows.Scan(&siteID, &productID); err != nil {
			return nil, err
		}
		result[siteID] = append(result[siteID], productID)
	}

	return result, rows.Err()
}

func clientIDByResponsible(responsibleID int64) (int64, error) {
	var clientID int64
	err := database.DB.QueryRow(`
		SELECT client_id
		FROM "crm"."Representatives"
		WHERE account_id = $1
	`, responsibleID).Scan(&clientID)
	return clientID, err
}

func allProductsExist(productIDs []int) bool {
	if len(productIDs) == 0 {
		return true
	}

	args := make([]any, 0, len(productIDs))
	placeholders := make([]string, 0, len(productIDs))
	for index, productID := range productIDs {
		args = append(args, productID)
		placeholders = append(placeholders, "$"+strconv.Itoa(index+1))
	}

	var count int
	err := database.DB.QueryRow(`
		SELECT COUNT(*)
		FROM "crm"."Products"
		WHERE id IN (`+strings.Join(placeholders, ", ")+`)
	`, args...).Scan(&count)
	return err == nil && count == len(productIDs)
}

func replaceSiteProductsTx(tx *sql.Tx, siteID int64, productIDs []int) error {
	if _, err := tx.Exec(`DELETE FROM "crm"."SitesProducts" WHERE site_id = $1`, siteID); err != nil {
		return err
	}

	for _, productID := range productIDs {
		if _, err := tx.Exec(`
			INSERT INTO "crm"."SitesProducts" (site_id, product_id)
			VALUES ($1, $2)
		`, siteID, productID); err != nil {
			return err
		}
	}

	return nil
}
