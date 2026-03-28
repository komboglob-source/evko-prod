package appeals

import (
	"crm_be/api/utils"
	"crm_be/database"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	path_segment := utils.GetFirstPathSegment(path)

	if path_segment == "" {
		switch r.Method {
		case http.MethodGet:
			GetAppealsHandler(w, r)
		case http.MethodPost:
			PostAppealHandler(w, r)
		default:
			fmt.Fprintf(w, "Incorrect method on appeals")
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	} else if appeal_id := utils.IsInteger(path_segment); appeal_id >= 0 {
		SpecificAppealHandler(w, r, path[len(path_segment):], appeal_id)
	} else {
		fmt.Fprint(w, "Unknown url path")
		w.WriteHeader(http.StatusNotFound)
	}
}

func GetAppealsHandler(w http.ResponseWriter, r *http.Request) {
	// if !utils.CheckPermission(w, r, "") {
	// 	http.Error(w, "Forbidden", http.StatusForbidden)
	// 	return
	// }

	query := r.URL.Query()

	filters := make(map[string]interface{})
	args := []interface{}{}
	argPos := 1

	addFilter := func(column string, valueStr string, valueType string) {
		if valueStr == "" {
			return
		}
		switch valueType {
		case "int":
			if val, err := strconv.Atoi(valueStr); err == nil {
				filters[column] = val
				args = append(args, val)
			}
		case "int64":
			if val, err := strconv.ParseInt(valueStr, 10, 64); err == nil {
				filters[column] = val
				args = append(args, val)
			}
		case "timestamp":
			if val, err := time.Parse(time.RFC3339, valueStr); err == nil {
				filters[column] = val
				args = append(args, val)
			}
		}
	}

	if v := query.Get("type_id"); v != "" {
		addFilter("type_id", v, "int")
	}

	if v := query.Get("status_id"); v != "" {
		addFilter("status_id", v, "int")
	}

	if v := query.Get("criticality_id"); v != "" {
		addFilter("criticality_id", v, "int")
	}

	if v := query.Get("client_id"); v != "" {
		addFilter("client_id", v, "int64")
	}

	if v := query.Get("site_id"); v != "" {
		addFilter("site_id", v, "int64")
	}

	if v := query.Get("product_id"); v != "" {
		addFilter("product_id", v, "int")
	}

	if v := query.Get("created_from"); v != "" {
		addFilter("created_at >= ?", v, "timestamp")
	}

	if v := query.Get("created_to"); v != "" {
		addFilter("created_at <= ?", v, "timestamp")
	}

	if v := query.Get("updated_from"); v != "" {
		addFilter("updated_at >= ?", v, "timestamp")
	}

	if v := query.Get("updated_to"); v != "" {
		addFilter("updated_at <= ?", v, "timestamp")
	}

	if v := query.Get("responsible_id"); v != "" {
		addFilter("responsible_id", v, "int64")
	}

	sql := `SELECT id, title, type_id, status_id, criticality_id, client_id, site_id, product_id, 
		created_at, created_by, updated_at, updated_by, responsible_id
		FROM "tasks"."Tickets"
		WHERE 1=1`

	for column := range filters {

		if strings.Contains(column, ">=") || strings.Contains(column, "<=") {
			sql += fmt.Sprintf(" AND %s $%d", column, argPos)
			argPos++
			continue
		}

		sql += fmt.Sprintf(" AND %s = $%d", column, argPos)
		argPos++
	}

	rows, err := database.DB.Query(sql, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	shortTickets := []ShortTicket{}
	for rows.Next() {
		var t ShortTicket
		err := rows.Scan(
			&t.ID, &t.Title, &t.TypeID, &t.StatusID, &t.CriticalityID,
			&t.ClientID, &t.SiteID, &t.ProductID,
			&t.CreatedAt, &t.CreatedBy, &t.UpdatedAt, &t.UpdatedBy,
			&t.ResponsibleID,
		)
		if err != nil {
			http.Error(w, "database scan error", http.StatusInternalServerError)
			return
		}
		shortTickets = append(shortTickets, t)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	resp := TicketsResponse{ShortTickets: shortTickets}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, "json encoding error", http.StatusInternalServerError)
	}
}

func PostAppealHandler(w http.ResponseWriter, r *http.Request) {
}

func SpecificAppealHandler(w http.ResponseWriter, r *http.Request, path string, ticket_id int64) {
	var exists bool
	err := database.DB.QueryRow(`
    SELECT EXISTS (
        SELECT 1
        FROM "tasks"."Tickets"
        WHERE id = $1
    )
`, ticket_id).Scan(&exists)

	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if !exists {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}

	path_segment := utils.GetFirstPathSegment(path)

	switch path_segment {
	case "":
		switch r.Method {
		case http.MethodGet:
			GetSpecificAppealHandler(w, r)
		case http.MethodPatch:
			PatchSpecificAppealHandler(w, r)
		case http.MethodDelete:
			DeleteSpecificAppealHandler(w, r)
		default:
			fmt.Fprintf(w, "Incorrect method on appeals")
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	case "/comments":
		CommentHandler(w, r, path[len(path_segment):], ticket_id)
	case "/links":
		LinkHandler(w, r, path[len(path_segment):], ticket_id)
	default:
		fmt.Fprint(w, "Unknown url path")
		w.WriteHeader(http.StatusNotFound)
	}
}

func GetSpecificAppealHandler(w http.ResponseWriter, r *http.Request) {
}

func PatchSpecificAppealHandler(w http.ResponseWriter, r *http.Request) {
}

func DeleteSpecificAppealHandler(w http.ResponseWriter, r *http.Request) {
}

func CommentHandler(w http.ResponseWriter, r *http.Request, path string, ticket_id int64) {
}

func LinkHandler(w http.ResponseWriter, r *http.Request, path string, ticket_id int64) {
}

// Полная информация о тикете (для GET /appeals/{appeal_id} и POST /appeals)
type Ticket struct {
	ID            int64     `json:"id"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	TypeID        int       `json:"type_id"`
	StatusID      int       `json:"status_id"`
	CriticalityID int       `json:"criticality_id"`
	ClientID      int64     `json:"client_id"`
	SiteID        int64     `json:"site_id"`
	ProductID     *int      `json:"product_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	CreatedBy     int64     `json:"created_by"`
	UpdatedAt     time.Time `json:"updated_at"`
	UpdatedBy     int64     `json:"updated_by"`
	ResponsibleID *int64    `json:"responsible_id,omitempty"`
}

// Сокращённая версия для списка (GET /appeals)
type ShortTicket struct {
	ID            int64     `json:"id"`
	Title         string    `json:"title"`
	TypeID        int       `json:"type_id"`
	StatusID      int       `json:"status_id"`
	CriticalityID int       `json:"criticality_id"`
	ClientID      int64     `json:"client_id"`
	SiteID        int64     `json:"site_id"`
	ProductID     *int      `json:"product_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	CreatedBy     int64     `json:"created_by"`
	UpdatedAt     time.Time `json:"updated_at"`
	UpdatedBy     int64     `json:"updated_by"`
	ResponsibleID *int64    `json:"responsible_id,omitempty"`
}

// Комментарий к тикету
type Comment struct {
	ID              int64     `json:"id"`
	IsClosedComment bool      `json:"is_closed_comment"`
	CreatedBy       int64     `json:"created_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	Contents        string    `json:"contents"`
	ReactionIDs     []int64   `json:"reaction_ids"`
}

// Информация о связанном обращении
type LinkedAppealInfo struct {
	ID            int64  `json:"id"`
	Title         string `json:"title"`
	TypeID        int    `json:"type_id"`
	StatusID      int    `json:"status_id"`
	CriticalityID int    `json:"criticality_id"`
	RelationType  string `json:"relation_type"`
}

// Справочная информация о реакции
type Reaction struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Picture []byte `json:"picture"` // будет закодирован в base64
}

// Структуры запросов

type CreateTicketRequest struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	TypeID        int    `json:"type_id"`
	StatusID      int    `json:"status_id"`
	CriticalityID int    `json:"criticality_id"`
	ClientID      int64  `json:"client_id"`
	SiteID        *int64 `json:"site_id,omitempty"`
	ProductID     *int   `json:"product_id,omitempty"`
	CreatedBy     int64  `json:"created_by"`
	UpdatedBy     int64  `json:"updated_by"`
	ResponsibleID *int64 `json:"responsible_id,omitempty"`
}

type UpdateTicketRequest struct {
	Title         *string `json:"title,omitempty"`
	Description   *string `json:"description,omitempty"`
	TypeID        *int    `json:"type_id,omitempty"`
	StatusID      *int    `json:"status_id,omitempty"`
	CriticalityID *int    `json:"criticality_id,omitempty"`
	ClientID      *int64  `json:"client_id,omitempty"`
	SiteID        *int64  `json:"site_id,omitempty"`
	ProductID     *int    `json:"product_id,omitempty"`
	UpdatedBy     *int64  `json:"updated_by,omitempty"`
	ResponsibleID *int64  `json:"responsible_id,omitempty"`
}

type CreateCommentRequest struct {
	IsClosedComment bool   `json:"is_closed_comment,omitempty"`
	Contents        string `json:"contents"`
}

type UpdateCommentRequest struct {
	Contents        *string `json:"contents,omitempty"`
	IsClosedComment *bool   `json:"is_closed_comment,omitempty"`
}

type LinkAppealRequest struct {
	LinkedAppealID int64  `json:"linked_appeal_id"`
	RelationType   string `json:"relation_type"`
}

type AddReactionRequest struct {
	ReactionID int64 `json:"reaction_id"`
}

// Структуры ответов (обёртки, где это необходимо)

type TicketsResponse struct {
	ShortTickets []ShortTicket `json:"short_tickets"`
}

type CreateTicketResponse struct {
	Ticket            Ticket             `json:"ticket"`
	LinkedAppealsInfo []LinkedAppealInfo `json:"linked_appeals_info"`
	Comments          []Comment          `json:"comments"`
}

type CommentsResponse struct {
	Comments []Comment `json:"comments"`
}

type ReactionsResponse struct {
	Reactions []Reaction `json:"reactions"`
}
