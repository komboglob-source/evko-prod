package nri

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"crm_be/api/utils"
	"crm_be/database"
)

type equipmentTypeResponse struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type equipmentResponse struct {
	ID           int64   `json:"id"`
	TypeID       int     `json:"type_id"`
	SiteID       int64   `json:"site_id"`
	SerialNumber *string `json:"serial_number,omitempty"`
	Name         string  `json:"name"`
	Weight       *string `json:"weight,omitempty"`
	Description  string  `json:"description"`
}

type upsertEquipmentRequest struct {
	TypeID       *int    `json:"type_id"`
	SiteID       *int64  `json:"site_id"`
	SerialNumber *string `json:"serial_number"`
	Name         *string `json:"name"`
	Weight       *string `json:"weight"`
	Description  *string `json:"description"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	switch {
	case utils.StartsWith(path, "/equipment-types"):
		EquipmentTypesHandler(w, r)
	case utils.StartsWith(path, "/equipment"):
		EquipmentHandler(w, r, path[len("/equipment"):])
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
	}
}

func EquipmentTypesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on equipment-types", http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, name, COALESCE(description, '')
		FROM "nri"."Equipment_Types"
		ORDER BY id
	`)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]equipmentTypeResponse, 0)
	for rows.Next() {
		var item equipmentTypeResponse
		if err := rows.Scan(&item.ID, &item.Name, &item.Description); err != nil {
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

func EquipmentHandler(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListEquipmentHandler(w, r)
		case http.MethodPost:
			CreateEquipmentHandler(w, r)
		default:
			http.Error(w, "incorrect method on equipment", http.StatusMethodNotAllowed)
		}
		return
	}

	equipmentID := utils.IsInteger(pathSegment)
	if equipmentID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateEquipmentHandler(w, r, equipmentID)
	case http.MethodDelete:
		DeleteEquipmentHandler(w, r, equipmentID)
	default:
		http.Error(w, "incorrect method on equipment", http.StatusMethodNotAllowed)
	}
}

func ListEquipmentHandler(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT
			equipment.id,
			equipment.type_id,
			equipment.site_id,
			equipment.serial_number,
			equipment.name,
			equipment.weight,
			COALESCE(equipment.description, '')
		FROM "nri"."Equipment" equipment
		JOIN "crm"."Sites" sites ON sites.id = equipment.site_id
		JOIN "crm"."Representatives" representatives ON representatives.account_id = sites.responsible_id
		LEFT JOIN "crm"."Clients" clients ON clients.id = representatives.client_id
		LEFT JOIN "nri"."Equipment_Types" equipment_types ON equipment_types.id = equipment.type_id
	`

	args := make([]any, 0)
	clauses := make([]string, 0)
	if value := strings.TrimSpace(r.URL.Query().Get("id")); value != "" {
		parsedValue, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "equipment.id = $"+strconv.Itoa(len(args)+1))
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("site_id")); value != "" {
		parsedValue, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "equipment.site_id = $"+strconv.Itoa(len(args)+1))
		args = append(args, parsedValue)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("type_id")); value != "" {
		parsedValue, err := strconv.Atoi(value)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, "equipment.type_id = $"+strconv.Itoa(len(args)+1))
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
	if value := strings.TrimSpace(r.URL.Query().Get("product_id")); value != "" {
		parsedValue, err := strconv.Atoi(value)
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
		clauses = append(clauses, `EXISTS (
			SELECT 1
			FROM "crm"."SitesProducts" linked_products
			WHERE linked_products.site_id = equipment.site_id AND linked_products.product_id = $`+strconv.Itoa(len(args)+1)+`
		)`)
		args = append(args, parsedValue)
	}
	for _, item := range []struct {
		column string
		value  string
	}{
		{"equipment.serial_number", r.URL.Query().Get("serial_number")},
		{"equipment.name", r.URL.Query().Get("name")},
		{"equipment.description", r.URL.Query().Get("description")},
	} {
		if strings.TrimSpace(item.value) == "" {
			continue
		}
		clauses = append(clauses, item.column+" ILIKE $"+strconv.Itoa(len(args)+1))
		args = append(args, "%"+strings.TrimSpace(item.value)+"%")
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		clauses = append(clauses, `(
			COALESCE(equipment.serial_number, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR equipment.name ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(equipment.description, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(equipment_types.name, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR COALESCE(clients.name, '') ILIKE $`+strconv.Itoa(len(args)+1)+`
			OR EXISTS (
				SELECT 1
				FROM "crm"."Sites" linked_sites
				WHERE linked_sites.id = equipment.site_id
					AND (
						linked_sites.name ILIKE $`+strconv.Itoa(len(args)+1)+`
						OR linked_sites.address ILIKE $`+strconv.Itoa(len(args)+1)+`
					)
			)
			OR EXISTS (
				SELECT 1
				FROM "crm"."SitesProducts" linked_products
				JOIN "crm"."Products" products ON products.id = linked_products.product_id
				WHERE linked_products.site_id = equipment.site_id
					AND products.name ILIKE $`+strconv.Itoa(len(args)+1)+`
			)
		)`)
		args = append(args, "%"+value+"%")
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY equipment.name, equipment.id"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]equipmentResponse, 0)
	for rows.Next() {
		item, err := scanEquipment(rows)
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

func CreateEquipmentHandler(w http.ResponseWriter, r *http.Request) {
	var body upsertEquipmentRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if body.TypeID == nil || body.SiteID == nil || body.Name == nil {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	if !equipmentTypeExists(*body.TypeID) || !siteExists(*body.SiteID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	var equipmentID int64
	err := database.DB.QueryRow(`
		INSERT INTO "nri"."Equipment" (type_id, site_id, serial_number, name, weight, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, *body.TypeID, *body.SiteID, optionalTrimmedString(body.SerialNumber), strings.TrimSpace(*body.Name), optionalTrimmedString(body.Weight), optionalTrimmedString(body.Description)).Scan(&equipmentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getEquipmentByID(equipmentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateEquipmentHandler(w http.ResponseWriter, r *http.Request, equipmentID int64) {
	current, err := getEquipmentByID(equipmentID)
	if err == sql.ErrNoRows {
		http.Error(w, "equipment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	var body upsertEquipmentRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	nextTypeID := current.TypeID
	if body.TypeID != nil {
		nextTypeID = *body.TypeID
	}
	nextSiteID := current.SiteID
	if body.SiteID != nil {
		nextSiteID = *body.SiteID
	}
	if !equipmentTypeExists(nextTypeID) || !siteExists(nextSiteID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	setClauses := make([]string, 0)
	args := make([]any, 0)
	argPos := 1

	if body.TypeID != nil {
		setClauses = append(setClauses, "type_id = $"+strconv.Itoa(argPos))
		args = append(args, *body.TypeID)
		argPos++
	}
	if body.SiteID != nil {
		setClauses = append(setClauses, "site_id = $"+strconv.Itoa(argPos))
		args = append(args, *body.SiteID)
		argPos++
	}
	if body.SerialNumber != nil {
		setClauses = append(setClauses, "serial_number = $"+strconv.Itoa(argPos))
		args = append(args, optionalTrimmedString(body.SerialNumber))
		argPos++
	}
	if body.Name != nil {
		setClauses = append(setClauses, "name = $"+strconv.Itoa(argPos))
		args = append(args, strings.TrimSpace(*body.Name))
		argPos++
	}
	if body.Weight != nil {
		setClauses = append(setClauses, "weight = $"+strconv.Itoa(argPos))
		args = append(args, optionalTrimmedString(body.Weight))
		argPos++
	}
	if body.Description != nil {
		setClauses = append(setClauses, "description = $"+strconv.Itoa(argPos))
		args = append(args, optionalTrimmedString(body.Description))
		argPos++
	}

	if len(setClauses) == 0 {
		utils.WriteJSON(w, http.StatusOK, current)
		return
	}

	args = append(args, equipmentID)
	result, err := database.DB.Exec(`
		UPDATE "nri"."Equipment"
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
		http.Error(w, "equipment not found", http.StatusNotFound)
		return
	}

	item, err := getEquipmentByID(equipmentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteEquipmentHandler(w http.ResponseWriter, r *http.Request, equipmentID int64) {
	result, err := database.DB.Exec(`
		DELETE FROM "nri"."Equipment"
		WHERE id = $1
	`, equipmentID)
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
		http.Error(w, "equipment not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getEquipmentByID(equipmentID int64) (equipmentResponse, error) {
	return scanEquipment(database.DB.QueryRow(`
		SELECT id, type_id, site_id, serial_number, name, weight, COALESCE(description, '')
		FROM "nri"."Equipment"
		WHERE id = $1
	`, equipmentID))
}

type scanner interface {
	Scan(dest ...any) error
}

func scanEquipment(row scanner) (equipmentResponse, error) {
	var (
		item         equipmentResponse
		serialNumber sql.NullString
		weight       sql.NullString
	)

	err := row.Scan(&item.ID, &item.TypeID, &item.SiteID, &serialNumber, &item.Name, &weight, &item.Description)
	if err != nil {
		return equipmentResponse{}, err
	}
	if serialNumber.Valid {
		item.SerialNumber = &serialNumber.String
	}
	if weight.Valid {
		item.Weight = &weight.String
	}

	return item, nil
}

func equipmentTypeExists(typeID int) bool {
	var exists bool
	err := database.DB.QueryRow(`
		SELECT EXISTS (SELECT 1 FROM "nri"."Equipment_Types" WHERE id = $1)
	`, typeID).Scan(&exists)
	return err == nil && exists
}

func siteExists(siteID int64) bool {
	var exists bool
	err := database.DB.QueryRow(`
		SELECT EXISTS (SELECT 1 FROM "crm"."Sites" WHERE id = $1)
	`, siteID).Scan(&exists)
	return err == nil && exists
}

func optionalTrimmedString(value *string) any {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}
