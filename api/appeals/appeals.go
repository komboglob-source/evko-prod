package appeals

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"crm_be/api/utils"
	"crm_be/database"
)

type appealResponse struct {
	ID            int64     `json:"id"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	TypeID        int       `json:"type_id"`
	StatusID      int       `json:"status_id"`
	CriticalityID int       `json:"criticality_id"`
	ClientID      int64     `json:"client_id"`
	SiteID        *int64    `json:"site_id,omitempty"`
	ProductID     *int      `json:"product_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	CreatedBy     int64     `json:"created_by"`
	UpdatedAt     time.Time `json:"updated_at"`
	UpdatedBy     int64     `json:"updated_by"`
	ResponsibleID *int64    `json:"responsible_id,omitempty"`
}

type createAppealRequest struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	TypeID        int    `json:"type_id"`
	StatusID      *int   `json:"status_id"`
	CriticalityID int    `json:"criticality_id"`
	ClientID      int64  `json:"client_id"`
	SiteID        *int64 `json:"site_id"`
	ProductID     *int   `json:"product_id"`
	ResponsibleID *int64 `json:"responsible_id"`
}

type updateAppealRequest struct {
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	TypeID        *int    `json:"type_id"`
	StatusID      *int    `json:"status_id"`
	CriticalityID *int    `json:"criticality_id"`
	ClientID      *int64  `json:"client_id"`
	SiteID        *int64  `json:"site_id"`
	ProductID     *int    `json:"product_id"`
	ResponsibleID *int64  `json:"responsible_id"`
}

type commentResponse struct {
	ID              int64     `json:"id"`
	TicketID        int64     `json:"ticket_id"`
	IsClosedComment bool      `json:"is_closed_comment"`
	CreatedBy       int64     `json:"created_by"`
	AuthorName      string    `json:"author_name"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	Contents        string    `json:"contents"`
	ReactionIDs     []int64   `json:"reaction_ids"`
}

type createCommentRequest struct {
	Contents        string `json:"contents"`
	IsClosedComment *bool  `json:"is_closed_comment"`
}

type updateCommentRequest struct {
	Contents        *string `json:"contents"`
	IsClosedComment *bool   `json:"is_closed_comment"`
}

type linkedAppealSummary struct {
	ID            int64  `json:"id"`
	Title         string `json:"title"`
	TypeID        int    `json:"type_id"`
	StatusID      int    `json:"status_id"`
	CriticalityID int    `json:"criticality_id"`
}

type appealLinkResponse struct {
	AppealID       int64               `json:"appeal_id"`
	LinkedAppealID int64               `json:"linked_appeal_id"`
	RelationType   string              `json:"relation_type"`
	LinkedAppeal   linkedAppealSummary `json:"linked_appeal"`
}

type linkAppealRequest struct {
	LinkedAppealID int64  `json:"linked_appeal_id"`
	RelationType   string `json:"relation_type"`
}

type addReactionRequest struct {
	ReactionID int64 `json:"reaction_id"`
}

type scanner interface {
	Scan(dest ...any) error
}

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListAppealsHandler(w, r)
		case http.MethodPost:
			CreateAppealHandler(w, r)
		default:
			http.Error(w, "incorrect method on appeals", http.StatusMethodNotAllowed)
		}
		return
	}

	appealID := utils.IsInteger(pathSegment)
	if appealID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	restPath := path[len(pathSegment):]
	switch {
	case restPath == "" || restPath == "/":
		switch r.Method {
		case http.MethodGet:
			GetAppealHandler(w, r, appealID)
		case http.MethodPatch:
			UpdateAppealHandler(w, r, appealID)
		case http.MethodDelete:
			DeleteAppealHandler(w, r, appealID)
		default:
			http.Error(w, "incorrect method on appeals", http.StatusMethodNotAllowed)
		}
	case utils.StartsWith(restPath, "/comments"):
		CommentsHandler(w, r, restPath[len("/comments"):], appealID)
	case utils.StartsWith(restPath, "/links"):
		LinksHandler(w, r, restPath[len("/links"):], appealID)
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
	}
}

func ListAppealsHandler(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT
			id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
			created_at, created_by, updated_at, updated_by, responsible_id
		FROM "tasks"."Tickets"
		WHERE 1 = 1
	`

	args := make([]any, 0)
	addIntFilter := func(column, raw string) error {
		value, err := strconv.Atoi(strings.TrimSpace(raw))
		if err != nil {
			return err
		}
		args = append(args, value)
		query += " AND " + column + " = $" + strconv.Itoa(len(args))
		return nil
	}
	addInt64Filter := func(column, raw string) error {
		value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil {
			return err
		}
		args = append(args, value)
		query += " AND " + column + " = $" + strconv.Itoa(len(args))
		return nil
	}
	addTimeFilter := func(column, raw string, op string) error {
		value, err := time.Parse(time.RFC3339, strings.TrimSpace(raw))
		if err != nil {
			return err
		}
		args = append(args, value)
		query += " AND " + column + " " + op + " $" + strconv.Itoa(len(args))
		return nil
	}

	for _, item := range []struct {
		column string
		value  string
		kind   string
		op     string
	}{
		{"type_id", r.URL.Query().Get("type_id"), "int", "="},
		{"status_id", r.URL.Query().Get("status_id"), "int", "="},
		{"criticality_id", r.URL.Query().Get("criticality_id"), "int", "="},
		{"client_id", r.URL.Query().Get("client_id"), "int64", "="},
		{"site_id", r.URL.Query().Get("site_id"), "int64", "="},
		{"product_id", r.URL.Query().Get("product_id"), "int", "="},
		{"responsible_id", r.URL.Query().Get("responsible_id"), "int64", "="},
		{"created_at", r.URL.Query().Get("created_from"), "time", ">="},
		{"created_at", r.URL.Query().Get("created_to"), "time", "<="},
		{"updated_at", r.URL.Query().Get("updated_from"), "time", ">="},
		{"updated_at", r.URL.Query().Get("updated_to"), "time", "<="},
	} {
		if strings.TrimSpace(item.value) == "" {
			continue
		}
		var err error
		switch item.kind {
		case "int":
			err = addIntFilter(item.column, item.value)
		case "int64":
			err = addInt64Filter(item.column, item.value)
		case "time":
			err = addTimeFilter(item.column, item.value, item.op)
		}
		if err != nil {
			http.Error(w, "invalid query parameters", http.StatusBadRequest)
			return
		}
	}

	query += " ORDER BY updated_at DESC, id DESC"
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]appealResponse, 0)
	for rows.Next() {
		item, err := scanAppeal(rows)
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

func CreateAppealHandler(w http.ResponseWriter, r *http.Request) {
	var body createAppealRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(body.Title) == "" || strings.TrimSpace(body.Description) == "" || body.TypeID == 0 || body.CriticalityID == 0 || body.ClientID == 0 {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	currentAccountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	statusID := 0
	if body.StatusID != nil {
		statusID = *body.StatusID
	} else {
		statusID, err = statusIDByName("Created")
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
	}

	if !typeExists(body.TypeID) || !statusExists(statusID) || !criticalityExists(body.CriticalityID) || !clientExists(body.ClientID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}
	if !validateAppealConsistency(body.ClientID, body.SiteID, body.ProductID, body.ResponsibleID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	var appealID int64
	err = database.DB.QueryRow(`
		INSERT INTO "tasks"."Tickets" (
			title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
			created_by, updated_by, responsible_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
		RETURNING id
	`, strings.TrimSpace(body.Title), strings.TrimSpace(body.Description), body.TypeID, statusID, body.CriticalityID, body.ClientID, body.SiteID, body.ProductID, currentAccountID, body.ResponsibleID).Scan(&appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getAppealByID(appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func GetAppealHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	item, err := getAppealByID(appealID)
	if err == sql.ErrNoRows {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func UpdateAppealHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	current, err := getAppealByID(appealID)
	if err == sql.ErrNoRows {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	var body updateAppealRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	nextTypeID := current.TypeID
	if body.TypeID != nil {
		nextTypeID = *body.TypeID
	}
	nextStatusID := current.StatusID
	if body.StatusID != nil {
		nextStatusID = *body.StatusID
	}
	nextCriticalityID := current.CriticalityID
	if body.CriticalityID != nil {
		nextCriticalityID = *body.CriticalityID
	}
	nextClientID := current.ClientID
	if body.ClientID != nil {
		nextClientID = *body.ClientID
	}
	nextSiteID := current.SiteID
	if body.SiteID != nil {
		nextSiteID = body.SiteID
	}
	nextProductID := current.ProductID
	if body.ProductID != nil {
		nextProductID = body.ProductID
	}
	nextResponsibleID := current.ResponsibleID
	if body.ResponsibleID != nil {
		nextResponsibleID = body.ResponsibleID
	}

	if !typeExists(nextTypeID) || !statusExists(nextStatusID) || !criticalityExists(nextCriticalityID) || !clientExists(nextClientID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}
	if !validateAppealConsistency(nextClientID, nextSiteID, nextProductID, nextResponsibleID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	currentAccountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	setClauses := make([]string, 0)
	args := make([]any, 0)
	addSet := func(clause string, value any) {
		args = append(args, value)
		setClauses = append(setClauses, clause+" = $"+strconv.Itoa(len(args)))
	}

	if body.Title != nil {
		addSet("title", strings.TrimSpace(*body.Title))
	}
	if body.Description != nil {
		addSet("description", strings.TrimSpace(*body.Description))
	}
	if body.TypeID != nil {
		addSet("type_id", *body.TypeID)
	}
	if body.StatusID != nil {
		addSet("status_id", *body.StatusID)
	}
	if body.CriticalityID != nil {
		addSet("criticality_id", *body.CriticalityID)
	}
	if body.ClientID != nil {
		addSet("client_id", *body.ClientID)
	}
	if body.SiteID != nil {
		addSet("site_id", *body.SiteID)
	}
	if body.ProductID != nil {
		addSet("product_id", *body.ProductID)
	}
	if body.ResponsibleID != nil {
		addSet("responsible_id", *body.ResponsibleID)
	}
	addSet("updated_at", time.Now().UTC())
	addSet("updated_by", currentAccountID)

	args = append(args, appealID)
	result, err := database.DB.Exec(`
		UPDATE "tasks"."Tickets"
		SET `+strings.Join(setClauses, ", ")+`
		WHERE id = $`+strconv.Itoa(len(args)), args...)
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
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}

	item, err := getAppealByID(appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteAppealHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	var statusName string
	err := database.DB.QueryRow(`
		SELECT status.name
		FROM "tasks"."Tickets" tickets
		JOIN "tasks"."Status" status ON status.id = tickets.status_id
		WHERE tickets.id = $1
	`, appealID).Scan(&statusName)
	if err == sql.ErrNoRows {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if statusName != "Created" && statusName != "Opened" {
		http.Error(w, "appeal cannot be deleted in current status", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`DELETE FROM "tasks"."Tickets" WHERE id = $1`, appealID)
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
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func CommentsHandler(w http.ResponseWriter, r *http.Request, path string, appealID int64) {
	if !appealExists(appealID) {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}

	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListCommentsHandler(w, r, appealID)
		case http.MethodPost:
			CreateCommentHandler(w, r, appealID)
		default:
			http.Error(w, "incorrect method on comments", http.StatusMethodNotAllowed)
		}
		return
	}

	commentID := utils.IsInteger(pathSegment)
	if commentID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	restPath := path[len(pathSegment):]
	if utils.StartsWith(restPath, "/reactions") {
		ReactionsHandler(w, r, restPath[len("/reactions"):], appealID, commentID)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		UpdateCommentHandler(w, r, appealID, commentID)
	case http.MethodDelete:
		DeleteCommentHandler(w, r, appealID, commentID)
	default:
		http.Error(w, "incorrect method on comments", http.StatusMethodNotAllowed)
	}
}

func ListCommentsHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	items, err := listCommentsByAppealID(appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func CreateCommentHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	var body createCommentRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Contents) == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	currentAccountID, err := utils.GetCurrentAccountID(r)
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}

	isClosedComment := false
	if body.IsClosedComment != nil {
		isClosedComment = *body.IsClosedComment
	}

	var commentID int64
	err = database.DB.QueryRow(`
		INSERT INTO "tasks"."Comments" (ticket_id, is_closed_comment, created_by, contents)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, appealID, isClosedComment, currentAccountID, strings.TrimSpace(body.Contents)).Scan(&commentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getCommentByID(appealID, commentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func UpdateCommentHandler(w http.ResponseWriter, r *http.Request, appealID, commentID int64) {
	if !commentBelongsToAppeal(appealID, commentID) {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}

	var body updateCommentRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	setClauses := make([]string, 0)
	args := make([]any, 0)
	if body.Contents != nil {
		args = append(args, strings.TrimSpace(*body.Contents))
		setClauses = append(setClauses, "contents = $"+strconv.Itoa(len(args)))
	}
	if body.IsClosedComment != nil {
		args = append(args, *body.IsClosedComment)
		setClauses = append(setClauses, "is_closed_comment = $"+strconv.Itoa(len(args)))
	}
	args = append(args, time.Now().UTC())
	setClauses = append(setClauses, "updated_at = $"+strconv.Itoa(len(args)))
	args = append(args, commentID, appealID)

	_, err := database.DB.Exec(`
		UPDATE "tasks"."Comments"
		SET `+strings.Join(setClauses, ", ")+`
		WHERE id = $`+strconv.Itoa(len(args)-1)+` AND ticket_id = $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	item, err := getCommentByID(appealID, commentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, item)
}

func DeleteCommentHandler(w http.ResponseWriter, r *http.Request, appealID, commentID int64) {
	result, err := database.DB.Exec(`
		DELETE FROM "tasks"."Comments"
		WHERE id = $1 AND ticket_id = $2
	`, commentID, appealID)
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
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func LinksHandler(w http.ResponseWriter, r *http.Request, path string, appealID int64) {
	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		switch r.Method {
		case http.MethodGet:
			ListLinksHandler(w, r, appealID)
		case http.MethodPost:
			CreateLinkHandler(w, r, appealID)
		default:
			http.Error(w, "incorrect method on links", http.StatusMethodNotAllowed)
		}
		return
	}

	linkedAppealID := utils.IsInteger(pathSegment)
	if linkedAppealID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	if r.Method != http.MethodDelete {
		http.Error(w, "incorrect method on links", http.StatusMethodNotAllowed)
		return
	}
	DeleteLinkHandler(w, r, appealID, linkedAppealID)
}

func ListLinksHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	items, err := listLinksByAppealID(appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, items)
}

func CreateLinkHandler(w http.ResponseWriter, r *http.Request, appealID int64) {
	var body linkAppealRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if body.LinkedAppealID == 0 || appealID == body.LinkedAppealID || !appealExists(body.LinkedAppealID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	firstID, secondID := normalizeAppealPair(appealID, body.LinkedAppealID)
	relationType := strings.TrimSpace(body.RelationType)
	if relationType == "" {
		relationType = "related"
	}

	result, err := database.DB.Exec(`
		INSERT INTO "tasks"."ConnectedTickets" (first_task_id, second_task_id, relation_type)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, firstID, secondID, relationType)
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
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	items, err := listLinksByAppealID(appealID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	for _, item := range items {
		if item.LinkedAppealID == body.LinkedAppealID {
			utils.WriteJSON(w, http.StatusCreated, item)
			return
		}
	}

	http.Error(w, "database error", http.StatusInternalServerError)
}

func DeleteLinkHandler(w http.ResponseWriter, r *http.Request, appealID, linkedAppealID int64) {
	firstID, secondID := normalizeAppealPair(appealID, linkedAppealID)
	result, err := database.DB.Exec(`
		DELETE FROM "tasks"."ConnectedTickets"
		WHERE first_task_id = $1 AND second_task_id = $2
	`, firstID, secondID)
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
		http.Error(w, "link not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func ReactionsHandler(w http.ResponseWriter, r *http.Request, path string, appealID, commentID int64) {
	if !commentBelongsToAppeal(appealID, commentID) {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}

	pathSegment := utils.GetFirstPathSegment(path)
	if pathSegment == "" {
		if r.Method != http.MethodPost {
			http.Error(w, "incorrect method on reactions", http.StatusMethodNotAllowed)
			return
		}
		AddReactionHandler(w, r, appealID, commentID)
		return
	}

	reactionID := utils.IsInteger(pathSegment)
	if reactionID < 0 {
		http.Error(w, "unknown url path", http.StatusNotFound)
		return
	}

	if r.Method != http.MethodDelete {
		http.Error(w, "incorrect method on reactions", http.StatusMethodNotAllowed)
		return
	}
	DeleteReactionHandler(w, r, appealID, commentID, reactionID)
}

func AddReactionHandler(w http.ResponseWriter, r *http.Request, appealID, commentID int64) {
	var body addReactionRequest
	if err := utils.DecodeJSONBody(r, &body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if body.ReactionID == 0 || !reactionExists(body.ReactionID) {
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO "tasks"."CommentsReactions" (comment_id, reaction_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, commentID, body.ReactionID)
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
		http.Error(w, "all fields are inconsistent", http.StatusBadRequest)
		return
	}

	item, err := getCommentByID(appealID, commentID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, item)
}

func DeleteReactionHandler(w http.ResponseWriter, r *http.Request, appealID, commentID, reactionID int64) {
	_ = appealID

	result, err := database.DB.Exec(`
		DELETE FROM "tasks"."CommentsReactions"
		WHERE comment_id = $1 AND reaction_id = $2
	`, commentID, reactionID)
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
		http.Error(w, "reaction link not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getAppealByID(appealID int64) (appealResponse, error) {
	return scanAppeal(database.DB.QueryRow(`
		SELECT
			id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
			created_at, created_by, updated_at, updated_by, responsible_id
		FROM "tasks"."Tickets"
		WHERE id = $1
	`, appealID))
}

func scanAppeal(row scanner) (appealResponse, error) {
	var (
		item          appealResponse
		siteID        sql.NullInt64
		productID     sql.NullInt64
		responsibleID sql.NullInt64
	)

	err := row.Scan(
		&item.ID,
		&item.Title,
		&item.Description,
		&item.TypeID,
		&item.StatusID,
		&item.CriticalityID,
		&item.ClientID,
		&siteID,
		&productID,
		&item.CreatedAt,
		&item.CreatedBy,
		&item.UpdatedAt,
		&item.UpdatedBy,
		&responsibleID,
	)
	if err != nil {
		return appealResponse{}, err
	}

	if siteID.Valid {
		value := siteID.Int64
		item.SiteID = &value
	}
	if productID.Valid {
		value := int(productID.Int64)
		item.ProductID = &value
	}
	if responsibleID.Valid {
		value := responsibleID.Int64
		item.ResponsibleID = &value
	}

	return item, nil
}

func listCommentsByAppealID(appealID int64) ([]commentResponse, error) {
	rows, err := database.DB.Query(`
		SELECT
			comments.id,
			comments.ticket_id,
			comments.is_closed_comment,
			comments.created_by,
			profiles.full_name,
			comments.created_at,
			comments.updated_at,
			comments.contents
		FROM "tasks"."Comments" comments
		JOIN "profiles"."Profiles" profiles ON profiles.account_id = comments.created_by
		WHERE comments.ticket_id = $1
		ORDER BY comments.created_at, comments.id
	`, appealID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]commentResponse, 0)
	commentIDs := make([]int64, 0)
	for rows.Next() {
		var item commentResponse
		if err := rows.Scan(&item.ID, &item.TicketID, &item.IsClosedComment, &item.CreatedBy, &item.AuthorName, &item.CreatedAt, &item.UpdatedAt, &item.Contents); err != nil {
			return nil, err
		}
		items = append(items, item)
		commentIDs = append(commentIDs, item.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	reactionIDsByComment, err := listReactionIDsByCommentIDs(commentIDs)
	if err != nil {
		return nil, err
	}
	for index := range items {
		items[index].ReactionIDs = reactionIDsByComment[items[index].ID]
		if items[index].ReactionIDs == nil {
			items[index].ReactionIDs = make([]int64, 0)
		}
	}

	return items, nil
}

func getCommentByID(appealID, commentID int64) (commentResponse, error) {
	items, err := listCommentsByAppealID(appealID)
	if err != nil {
		return commentResponse{}, err
	}
	for _, item := range items {
		if item.ID == commentID {
			return item, nil
		}
	}
	return commentResponse{}, sql.ErrNoRows
}

func listReactionIDsByCommentIDs(commentIDs []int64) (map[int64][]int64, error) {
	result := make(map[int64][]int64)
	if len(commentIDs) == 0 {
		return result, nil
	}

	args := make([]any, 0, len(commentIDs))
	placeholders := make([]string, 0, len(commentIDs))
	for index, commentID := range commentIDs {
		args = append(args, commentID)
		placeholders = append(placeholders, "$"+strconv.Itoa(index+1))
	}

	rows, err := database.DB.Query(`
		SELECT comment_id, reaction_id
		FROM "tasks"."CommentsReactions"
		WHERE comment_id IN (`+strings.Join(placeholders, ", ")+`)
		ORDER BY comment_id, reaction_id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var commentID int64
		var reactionID int64
		if err := rows.Scan(&commentID, &reactionID); err != nil {
			return nil, err
		}
		result[commentID] = append(result[commentID], reactionID)
	}

	return result, rows.Err()
}

func listLinksByAppealID(appealID int64) ([]appealLinkResponse, error) {
	rows, err := database.DB.Query(`
		SELECT
			CASE WHEN connected.first_task_id = $1 THEN connected.first_task_id ELSE connected.second_task_id END AS appeal_id,
			CASE WHEN connected.first_task_id = $1 THEN connected.second_task_id ELSE connected.first_task_id END AS linked_appeal_id,
			connected.relation_type,
			tickets.id,
			tickets.title,
			tickets.type_id,
			tickets.status_id,
			tickets.criticality_id
		FROM "tasks"."ConnectedTickets" connected
		JOIN "tasks"."Tickets" tickets
			ON tickets.id = CASE WHEN connected.first_task_id = $1 THEN connected.second_task_id ELSE connected.first_task_id END
		WHERE connected.first_task_id = $1 OR connected.second_task_id = $1
		ORDER BY linked_appeal_id
	`, appealID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]appealLinkResponse, 0)
	for rows.Next() {
		var item appealLinkResponse
		if err := rows.Scan(
			&item.AppealID,
			&item.LinkedAppealID,
			&item.RelationType,
			&item.LinkedAppeal.ID,
			&item.LinkedAppeal.Title,
			&item.LinkedAppeal.TypeID,
			&item.LinkedAppeal.StatusID,
			&item.LinkedAppeal.CriticalityID,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func typeExists(typeID int) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "tasks"."Type" WHERE id = $1)`, typeID)
}

func statusExists(statusID int) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "tasks"."Status" WHERE id = $1)`, statusID)
}

func criticalityExists(criticalityID int) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "tasks"."Criticality" WHERE id = $1)`, criticalityID)
}

func clientExists(clientID int64) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "crm"."Clients" WHERE id = $1)`, clientID)
}

func productExists(productID int) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "crm"."Products" WHERE id = $1)`, productID)
}

func siteExists(siteID int64) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "crm"."Sites" WHERE id = $1)`, siteID)
}

func employeeExists(accountID int64) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "hrm"."Employees" WHERE account_id = $1)`, accountID)
}

func reactionExists(reactionID int64) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "tasks"."Reactions" WHERE id = $1)`, reactionID)
}

func appealExists(appealID int64) bool {
	return existsByQuery(`SELECT EXISTS (SELECT 1 FROM "tasks"."Tickets" WHERE id = $1)`, appealID)
}

func existsByQuery(query string, arg any) bool {
	var exists bool
	err := database.DB.QueryRow(query, arg).Scan(&exists)
	return err == nil && exists
}

func commentBelongsToAppeal(appealID, commentID int64) bool {
	var exists bool
	err := database.DB.QueryRow(`
		SELECT EXISTS (
			SELECT 1
			FROM "tasks"."Comments"
			WHERE id = $1 AND ticket_id = $2
		)
	`, commentID, appealID).Scan(&exists)
	return err == nil && exists
}

func statusIDByName(name string) (int, error) {
	var statusID int
	err := database.DB.QueryRow(`
		SELECT id
		FROM "tasks"."Status"
		WHERE name = $1
	`, name).Scan(&statusID)
	return statusID, err
}

func validateAppealConsistency(clientID int64, siteID *int64, productID *int, responsibleID *int64) bool {
	if siteID != nil {
		if !siteExists(*siteID) {
			return false
		}

		var derivedClientID int64
		err := database.DB.QueryRow(`
			SELECT representatives.client_id
			FROM "crm"."Sites" sites
			JOIN "crm"."Representatives" representatives ON representatives.account_id = sites.responsible_id
			WHERE sites.id = $1
		`, *siteID).Scan(&derivedClientID)
		if err != nil || derivedClientID != clientID {
			return false
		}

		if productID != nil {
			var exists bool
			err = database.DB.QueryRow(`
				SELECT EXISTS (
					SELECT 1
					FROM "crm"."SitesProducts"
					WHERE site_id = $1 AND product_id = $2
				)
			`, *siteID, *productID).Scan(&exists)
			if err != nil || !exists {
				return false
			}
		}
	} else if productID != nil && !productExists(*productID) {
		return false
	}

	if responsibleID != nil && !employeeExists(*responsibleID) {
		return false
	}

	return true
}

func normalizeAppealPair(left, right int64) (int64, int64) {
	if left < right {
		return left, right
	}
	return right, left
}
