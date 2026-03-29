package main

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"crm_be/database"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type integrationEnv struct {
	ready      bool
	skipReason string
	name       string
	port       string
	adminDSN   string
}

var (
	testEnv  integrationEnv
	testDBID uint64
)

type authTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type productResponse struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type equipmentTypeResponse struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type ticketTypeResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ticketStatusResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ticketCriticalityResponse struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Deadline int64  `json:"deadline"`
}

type reactionResponse struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type bootstrapResponse struct {
	Products            []productResponse           `json:"products"`
	EquipmentTypes      []equipmentTypeResponse     `json:"equipment_types"`
	TicketTypes         []ticketTypeResponse        `json:"ticket_types"`
	TicketStatuses      []ticketStatusResponse      `json:"ticket_statuses"`
	TicketCriticalities []ticketCriticalityResponse `json:"ticket_criticalities"`
	Reactions           []reactionResponse          `json:"reactions"`
}

type profileMeResponse struct {
	AccountID        int64  `json:"account_id"`
	ID               int64  `json:"id"`
	Login            string `json:"login"`
	Role             string `json:"role"`
	FullName         string `json:"full_name"`
	PhoneNumber      string `json:"phone_number"`
	Email            string `json:"email"`
	Image            string `json:"image"`
	Position         string `json:"position"`
	ClientID         *int64 `json:"client_id,omitempty"`
	RepresentativeID *int64 `json:"representative_id,omitempty"`
}

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

type siteResponse struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	ResponsibleID int64  `json:"responsible_id"`
	ClientID      int64  `json:"client_id"`
	ProductIDs    []int  `json:"product_ids"`
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

func TestMain(m *testing.M) {
	testEnv = startIntegrationEnv()
	code := m.Run()
	stopIntegrationEnv(testEnv)
	os.Exit(code)
}

func startIntegrationEnv() integrationEnv {
	if adminDSN := strings.TrimSpace(os.Getenv("TEST_DATABASE_ADMIN_URL")); adminDSN != "" {
		env := integrationEnv{
			ready:    true,
			adminDSN: adminDSN,
		}
		if err := waitForPostgres(env.adminDSN, 30*time.Second); err != nil {
			return integrationEnv{skipReason: fmt.Sprintf("external postgres did not become ready: %v", err)}
		}
		return env
	}

	if _, err := exec.LookPath("docker"); err != nil {
		return integrationEnv{skipReason: "docker is not available"}
	}

	name := fmt.Sprintf("crm-be-tests-%d", time.Now().UnixNano())
	out, err := exec.Command(
		"docker", "run", "-d", "--rm",
		"--name", name,
		"-e", "POSTGRES_USER=user",
		"-e", "POSTGRES_PASSWORD=0000",
		"-e", "POSTGRES_DB=postgres",
		"-P",
		"postgres:16-alpine",
	).CombinedOutput()
	if err != nil {
		return integrationEnv{skipReason: fmt.Sprintf("failed to start postgres container: %v: %s", err, strings.TrimSpace(string(out)))}
	}

	port, err := dockerMappedPort(name)
	if err != nil {
		_ = exec.Command("docker", "rm", "-f", name).Run()
		return integrationEnv{skipReason: fmt.Sprintf("failed to detect postgres port: %v", err)}
	}

	env := integrationEnv{
		ready:    true,
		name:     name,
		port:     port,
		adminDSN: fmt.Sprintf("host=127.0.0.1 port=%s user=user password=0000 dbname=postgres sslmode=disable", port),
	}

	if err := waitForPostgres(env.adminDSN, 30*time.Second); err != nil {
		stopIntegrationEnv(env)
		return integrationEnv{skipReason: fmt.Sprintf("postgres did not become ready: %v", err)}
	}

	return env
}

func stopIntegrationEnv(env integrationEnv) {
	if env.name == "" {
		return
	}
	_ = exec.Command("docker", "rm", "-f", env.name).Run()
}

func dockerMappedPort(containerName string) (string, error) {
	portPattern := regexp.MustCompile(`(\d+)\s*$`)
	for range 30 {
		out, err := exec.Command("docker", "port", containerName, "5432/tcp").CombinedOutput()
		if err == nil {
			lines := strings.Split(strings.TrimSpace(string(out)), "\n")
			if len(lines) > 0 {
				match := portPattern.FindStringSubmatch(lines[0])
				if len(match) == 2 {
					return match[1], nil
				}
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return "", fmt.Errorf("docker port output did not contain host port")
}

func waitForPostgres(dsn string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error

	for time.Now().Before(deadline) {
		db, err := sql.Open("pgx", dsn)
		if err == nil {
			pingErr := db.Ping()
			_ = db.Close()
			if pingErr == nil {
				return nil
			}
			lastErr = pingErr
		} else {
			lastErr = err
		}
		time.Sleep(500 * time.Millisecond)
	}

	return lastErr
}

func withFreshServer(t *testing.T, fn func(t *testing.T, serverURL string)) {
	t.Helper()

	if !testEnv.ready {
		t.Skip(testEnv.skipReason)
	}

	dbName := fmt.Sprintf("crm_be_test_%d_%d", time.Now().UnixNano(), atomic.AddUint64(&testDBID, 1))
	adminDB, err := sql.Open("pgx", testEnv.adminDSN)
	if err != nil {
		t.Fatalf("failed to open admin db: %v", err)
	}
	t.Cleanup(func() {
		_ = adminDB.Close()
	})

	if _, err := adminDB.Exec(`CREATE DATABASE "` + dbName + `"`); err != nil {
		t.Fatalf("failed to create test db %s: %v", dbName, err)
	}

	dsn := fmt.Sprintf("host=127.0.0.1 port=%s user=user password=0000 dbname=%s sslmode=disable", testEnv.port, dbName)
	dsn = dsnWithDatabase(testEnv.adminDSN, dbName)
	previousDSN := os.Getenv("DATABASE_URL")
	if err := os.Setenv("DATABASE_URL", dsn); err != nil {
		t.Fatalf("failed to set DATABASE_URL: %v", err)
	}

	t.Cleanup(func() {
		if previousDSN == "" {
			_ = os.Unsetenv("DATABASE_URL")
		} else {
			_ = os.Setenv("DATABASE_URL", previousDSN)
		}
	})

	if err := database.OpenDB(); err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	server := httptest.NewServer(&Router{})
	t.Cleanup(server.Close)
	t.Cleanup(func() {
		_ = database.CloseDB()
		terminateConnections(t, adminDB, dbName)
		if _, err := adminDB.Exec(`DROP DATABASE IF EXISTS "` + dbName + `"`); err != nil {
			t.Fatalf("failed to drop test db %s: %v", dbName, err)
		}
	})

	fn(t, server.URL)
}

func terminateConnections(t *testing.T, adminDB *sql.DB, dbName string) {
	t.Helper()

	if _, err := adminDB.Exec(`
		SELECT pg_terminate_backend(pid)
		FROM pg_stat_activity
		WHERE datname = $1 AND pid <> pg_backend_pid()
	`, dbName); err != nil {
		t.Fatalf("failed to terminate connections for %s: %v", dbName, err)
	}
}

func login(t *testing.T, serverURL, login, password string) authTokens {
	t.Helper()

	req, err := http.NewRequest(http.MethodPost, serverURL+"/api/v1/auth/login", nil)
	if err != nil {
		t.Fatalf("failed to create login request: %v", err)
	}

	basic := base64.StdEncoding.EncodeToString([]byte(login + ":" + password))
	req.Header.Set("Authorization", "Basic "+basic)

	status, body := doRequest(t, http.DefaultClient, req)
	if status != http.StatusOK {
		t.Fatalf("login failed with status %d: %s", status, strings.TrimSpace(string(body)))
	}

	var tokens authTokens
	decodeJSON(t, body, &tokens)
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatalf("login returned empty tokens: %+v", tokens)
	}

	return tokens
}

func authorizedJSONRequest(t *testing.T, method, url, accessToken string, payload any) (int, []byte) {
	t.Helper()

	var requestBody io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("failed to marshal payload: %v", err)
		}
		requestBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, url, requestBody)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return doRequest(t, http.DefaultClient, req)
}

func doRequest(t *testing.T, client *http.Client, req *http.Request) (int, []byte) {
	t.Helper()

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request %s %s failed: %v", req.Method, req.URL.String(), err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}

	return resp.StatusCode, body
}

func decodeJSON(t *testing.T, body []byte, dst any) {
	t.Helper()

	if err := json.Unmarshal(body, dst); err != nil {
		t.Fatalf("failed to decode json %s: %v", string(body), err)
	}
}

func requireStatus(t *testing.T, got, want int, body []byte) {
	t.Helper()

	if got != want {
		t.Fatalf("unexpected status %d, want %d, body: %s", got, want, strings.TrimSpace(string(body)))
	}
}

func requireTrimmedBody(t *testing.T, body []byte, want string) {
	t.Helper()

	if got := strings.TrimSpace(string(body)); got != want {
		t.Fatalf("unexpected body %q, want %q", got, want)
	}
}

func dsnWithDatabase(dsn, dbName string) string {
	dbNamePattern := regexp.MustCompile(`dbname=\S+`)
	if dbNamePattern.MatchString(dsn) {
		return dbNamePattern.ReplaceAllString(dsn, "dbname="+dbName)
	}
	return strings.TrimSpace(dsn) + " dbname=" + dbName
}

func statusIDByName(statuses []ticketStatusResponse, name string) int {
	for _, status := range statuses {
		if status.Name == name {
			return status.ID
		}
	}
	return 0
}

func findEmployeeByLogin(employees []employeeResponse, login string) *employeeResponse {
	for i := range employees {
		if employees[i].Login == login {
			return &employees[i]
		}
	}
	return nil
}

func findClientByName(clients []clientResponse, name string) *clientResponse {
	for i := range clients {
		if clients[i].Name == name {
			return &clients[i]
		}
	}
	return nil
}

func findSiteByID(sites []siteResponse, siteID int64) *siteResponse {
	for i := range sites {
		if sites[i].ID == siteID {
			return &sites[i]
		}
	}
	return nil
}

func findEquipmentByID(items []equipmentResponse, equipmentID int64) *equipmentResponse {
	for i := range items {
		if items[i].ID == equipmentID {
			return &items[i]
		}
	}
	return nil
}

func findAppealByID(items []appealResponse, appealID int64) *appealResponse {
	for i := range items {
		if items[i].ID == appealID {
			return &items[i]
		}
	}
	return nil
}

func findAppealLinkByLinkedAppealID(items []appealLinkResponse, linkedAppealID int64) *appealLinkResponse {
	for i := range items {
		if items[i].LinkedAppealID == linkedAppealID {
			return &items[i]
		}
	}
	return nil
}
