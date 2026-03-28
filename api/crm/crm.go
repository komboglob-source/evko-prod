package crm

import (
	"net/http"
	"time"

	"crm_be/api/crm/clients"
	"crm_be/api/crm/employees"
	"crm_be/api/crm/profiles"
	reprezentatives "crm_be/api/crm/reprezentatives"
	"crm_be/api/crm/sites"
	"crm_be/api/utils"
	"crm_be/database"
)

type Product struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type TicketType struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type TicketStatus struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type TicketCriticality struct {
	ID       int           `json:"id"`
	Name     string        `json:"name"`
	Deadline time.Duration `json:"deadline"`
}

type Reaction struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type BootstrapResponse struct {
	Products            []Product           `json:"products"`
	EquipmentTypes      []EquipmentType     `json:"equipment_types"`
	TicketTypes         []TicketType        `json:"ticket_types"`
	TicketStatuses      []TicketStatus      `json:"ticket_statuses"`
	TicketCriticalities []TicketCriticality `json:"ticket_criticalities"`
	Reactions           []Reaction          `json:"reactions"`
}

type EquipmentType struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	switch {
	case utils.StartsWith(path, "/bootstrap"):
		BootstrapHandler(w, r)
	case utils.StartsWith(path, "/profiles"):
		profiles.HandleAPIRequest(w, r, path[len("/profiles"):])
	case utils.StartsWith(path, "/employees"):
		employees.HandleAPIRequest(w, r, path[len("/employees"):])
	case utils.StartsWith(path, "/clients"):
		clients.HandleAPIRequest(w, r, path[len("/clients"):])
	case utils.StartsWith(path, "/representatives"):
		reprezentatives.HandleAPIRequest(w, r, path[len("/representatives"):])
	case utils.StartsWith(path, "/sites"):
		sites.HandleAPIRequest(w, r, path[len("/sites"):])
	case utils.StartsWith(path, "/products"):
		ProductsHandler(w, r)
	case utils.StartsWith(path, "/ticket-types"):
		TicketTypesHandler(w, r)
	case utils.StartsWith(path, "/ticket-statuses"):
		TicketStatusesHandler(w, r)
	case utils.StartsWith(path, "/ticket-criticalities"):
		TicketCriticalitiesHandler(w, r)
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
	}
}

func BootstrapHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on bootstrap", http.StatusMethodNotAllowed)
		return
	}

	products, err := listProducts()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	equipmentTypes, err := listEquipmentTypes()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	ticketTypes, err := listTicketTypes()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	ticketStatuses, err := listTicketStatuses()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	ticketCriticalities, err := listTicketCriticalities()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	reactions, err := listReactions()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, BootstrapResponse{
		Products:            products,
		EquipmentTypes:      equipmentTypes,
		TicketTypes:         ticketTypes,
		TicketStatuses:      ticketStatuses,
		TicketCriticalities: ticketCriticalities,
		Reactions:           reactions,
	})
}

func ProductsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on products", http.StatusMethodNotAllowed)
		return
	}

	items, err := listProducts()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func TicketTypesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on ticket-types", http.StatusMethodNotAllowed)
		return
	}

	items, err := listTicketTypes()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func TicketStatusesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on ticket-statuses", http.StatusMethodNotAllowed)
		return
	}

	items, err := listTicketStatuses()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func TicketCriticalitiesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "incorrect method on ticket-criticalities", http.StatusMethodNotAllowed)
		return
	}

	items, err := listTicketCriticalities()
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func listProducts() ([]Product, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, description
		FROM "crm"."Products"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Product, 0)
	for rows.Next() {
		var item Product
		if err := rows.Scan(&item.ID, &item.Name, &item.Description); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func listEquipmentTypes() ([]EquipmentType, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, COALESCE(description, '')
		FROM "nri"."Equipment_Types"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]EquipmentType, 0)
	for rows.Next() {
		var item EquipmentType
		if err := rows.Scan(&item.ID, &item.Name, &item.Description); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func listTicketTypes() ([]TicketType, error) {
	rows, err := database.DB.Query(`
		SELECT id, name
		FROM "tasks"."Type"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TicketType, 0)
	for rows.Next() {
		var item TicketType
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func listTicketStatuses() ([]TicketStatus, error) {
	rows, err := database.DB.Query(`
		SELECT id, name
		FROM "tasks"."Status"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TicketStatus, 0)
	for rows.Next() {
		var item TicketStatus
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func listTicketCriticalities() ([]TicketCriticality, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, EXTRACT(EPOCH FROM deadline)::bigint
		FROM "tasks"."Criticality"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TicketCriticality, 0)
	for rows.Next() {
		var (
			item    TicketCriticality
			seconds int64
		)
		if err := rows.Scan(&item.ID, &item.Name, &seconds); err != nil {
			return nil, err
		}
		item.Deadline = time.Duration(seconds) * time.Second
		items = append(items, item)
	}

	return items, rows.Err()
}

func listReactions() ([]Reaction, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, picture
		FROM "tasks"."Reactions"
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Reaction, 0)
	for rows.Next() {
		var (
			item    Reaction
			picture []byte
		)
		if err := rows.Scan(&item.ID, &item.Name, &picture); err != nil {
			return nil, err
		}

		item.Picture = utils.EncodePicToBase64(picture)
		items = append(items, item)
	}

	return items, rows.Err()
}
