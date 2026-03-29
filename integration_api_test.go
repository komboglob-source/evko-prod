package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestAuthBootstrapProfileAndAuthLifecycle(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		tokens := login(t, serverURL, "admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/bootstrap", tokens.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		if strings.Contains(string(body), `"users"`) {
			t.Fatalf("bootstrap should not include users: %s", string(body))
		}

		var bootstrap bootstrapResponse
		decodeJSON(t, body, &bootstrap)
		if len(bootstrap.Products) == 0 || len(bootstrap.EquipmentTypes) == 0 || len(bootstrap.TicketTypes) == 0 || len(bootstrap.TicketStatuses) == 0 || len(bootstrap.TicketCriticalities) == 0 || len(bootstrap.Reactions) == 0 {
			t.Fatalf("bootstrap is missing dictionaries: %+v", bootstrap)
		}
		if !strings.HasPrefix(bootstrap.Reactions[0].Picture, "data:image/") {
			t.Fatalf("reaction picture should be returned as data image, got %q", bootstrap.Reactions[0].Picture)
		}

		for _, endpoint := range []string{
			"/api/v1/products",
			"/api/v1/equipment-types",
			"/api/v1/ticket-types",
			"/api/v1/ticket-statuses",
			"/api/v1/ticket-criticalities",
		} {
			status, body := authorizedJSONRequest(t, http.MethodGet, serverURL+endpoint, tokens.AccessToken, nil)
			requireStatus(t, status, http.StatusOK, body)
			if strings.TrimSpace(string(body)) == "[]" {
				t.Fatalf("%s returned an empty array", endpoint)
			}
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/profiles/me", tokens.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var me profileMeResponse
		decodeJSON(t, body, &me)
		if me.Role != "admin" {
			t.Fatalf("role = %q, want admin", me.Role)
		}
		if !strings.EqualFold(me.Login, "Admin") {
			t.Fatalf("login = %q, want Admin", me.Login)
		}

		patchPayload := map[string]any{
			"phone_number": "+7 999 000 00 01",
			"email":        "autotest-admin@example.com",
			"position":     "System Owner",
			"image":        samplePNGDataURL,
		}
		status, body = authorizedJSONRequest(t, http.MethodPatch, serverURL+"/api/v1/profiles/me", tokens.AccessToken, patchPayload)
		requireStatus(t, status, http.StatusOK, body)

		var updatedMe profileMeResponse
		decodeJSON(t, body, &updatedMe)
		if updatedMe.PhoneNumber != patchPayload["phone_number"] {
			t.Fatalf("phone_number = %q, want %q", updatedMe.PhoneNumber, patchPayload["phone_number"])
		}
		if updatedMe.Email != patchPayload["email"] {
			t.Fatalf("email = %q, want %q", updatedMe.Email, patchPayload["email"])
		}
		if updatedMe.Position != patchPayload["position"] {
			t.Fatalf("position = %q, want %q", updatedMe.Position, patchPayload["position"])
		}
		if updatedMe.Image != patchPayload["image"] {
			t.Fatalf("image = %q, want %q", updatedMe.Image, patchPayload["image"])
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, serverURL+"/api/v1/profiles/me", tokens.AccessToken, map[string]any{
			"image": "https://example.com/not-allowed.png",
		})
		requireStatus(t, status, http.StatusBadRequest, body)

		refreshBody, err := json.Marshal(map[string]string{"refresh_token": tokens.RefreshToken})
		if err != nil {
			t.Fatalf("failed to marshal refresh payload: %v", err)
		}

		refreshReq, err := http.NewRequest(http.MethodPost, serverURL+"/api/v1/auth/refresh", bytes.NewReader(refreshBody))
		if err != nil {
			t.Fatalf("failed to create refresh request: %v", err)
		}
		refreshReq.Header.Set("Content-Type", "application/json")

		status, body = doRequest(t, http.DefaultClient, refreshReq)
		requireStatus(t, status, http.StatusOK, body)

		var refreshed authTokens
		decodeJSON(t, body, &refreshed)
		if refreshed.AccessToken == tokens.AccessToken {
			t.Fatal("refresh should rotate access token")
		}
		if refreshed.RefreshToken == tokens.RefreshToken {
			t.Fatal("refresh should rotate refresh token")
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/bootstrap", tokens.AccessToken, nil)
		requireStatus(t, status, http.StatusUnauthorized, body)
		requireTrimmedBody(t, body, "invalid or expired access token")

		logoutReq, err := http.NewRequest(http.MethodPost, serverURL+"/api/v1/auth/logout", nil)
		if err != nil {
			t.Fatalf("failed to create logout request: %v", err)
		}
		logoutReq.Header.Set("Authorization", "Bearer "+refreshed.AccessToken)

		status, body = doRequest(t, http.DefaultClient, logoutReq)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/bootstrap", refreshed.AccessToken, nil)
		requireStatus(t, status, http.StatusUnauthorized, body)
		requireTrimmedBody(t, body, "invalid or expired access token")
	})
}

func TestEmployeesCRUDAndFilters(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		admin := login(t, serverURL, "Admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var initial []employeeResponse
		decodeJSON(t, body, &initial)
		if len(initial) < 4 {
			t.Fatalf("expected seeded employees, got %d", len(initial))
		}

		createPayload := map[string]any{
			"login":        "AutoEmployee",
			"password":     "secret123",
			"role":         "ebko",
			"full_name":    "Autotest Employee",
			"phone_number": "+7 900 000 11 22",
			"email":        "autotest-employee@example.com",
			"image":        samplePNGDataURL,
			"birth_date":   "1994-07-05",
			"position":     "Autotest Engineer",
			"hire_date":    "2025-01-10",
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/employees", admin.AccessToken, createPayload)
		requireStatus(t, status, http.StatusCreated, body)

		var created employeeResponse
		decodeJSON(t, body, &created)
		if created.Role != "ebko" {
			t.Fatalf("created role = %q, want ebko", created.Role)
		}
		if created.Login != "AutoEmployee" {
			t.Fatalf("created login = %q, want AutoEmployee", created.Login)
		}
		if created.Image != samplePNGDataURL {
			t.Fatalf("created image = %q, want %q", created.Image, samplePNGDataURL)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/employees", admin.AccessToken, map[string]any{
			"login":        "FutureEmployee",
			"password":     "secret123",
			"role":         "ktp",
			"full_name":    "Future Employee",
			"phone_number": "+7 900 000 11 23",
			"email":        "future-employee@example.com",
			"birth_date":   "2099-01-01",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "invalid birth_date")

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/employees", admin.AccessToken, map[string]any{
			"login":        "DuplicatePhoneEmployee",
			"password":     "secret123",
			"role":         "ktp",
			"full_name":    "Duplicate Phone Employee",
			"phone_number": createPayload["phone_number"],
			"email":        "duplicate-phone-employee@example.com",
		})
		requireStatus(t, status, http.StatusConflict, body)
		requireTrimmedBody(t, body, "login, phone number or email already exists")

		employeeTokens := login(t, serverURL, "autoemployee", "secret123")
		if employeeTokens.AccessToken == "" {
			t.Fatal("new employee should be able to login")
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees?role=ebko", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var ebkoEmployees []employeeResponse
		decodeJSON(t, body, &ebkoEmployees)
		if findEmployeeByLogin(ebkoEmployees, "AutoEmployee") == nil {
			t.Fatalf("created employee was not returned by role filter: %+v", ebkoEmployees)
		}

		updatePayload := map[string]any{
			"role":         "wfm",
			"full_name":    "Autotest Employee Updated",
			"phone_number": "+7 900 000 33 44",
			"email":        "autotest-employee-updated@example.com",
			"position":     "Updated Position",
		}
		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/employees/%d", serverURL, created.AccountID), admin.AccessToken, updatePayload)
		requireStatus(t, status, http.StatusOK, body)

		var updated employeeResponse
		decodeJSON(t, body, &updated)
		if updated.Role != "wfm" {
			t.Fatalf("updated role = %q, want wfm", updated.Role)
		}
		if updated.FullName != "Autotest Employee Updated" {
			t.Fatalf("updated full_name = %q", updated.FullName)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees?role=wfm", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var wfmEmployees []employeeResponse
		decodeJSON(t, body, &wfmEmployees)
		if findEmployeeByLogin(wfmEmployees, "AutoEmployee") == nil {
			t.Fatalf("updated employee was not returned by role filter: %+v", wfmEmployees)
		}

		status, body = authorizedJSONRequest(
			t,
			http.MethodGet,
			fmt.Sprintf(
				"%s/api/v1/employees?account_id=%d&login=Auto&full_name=Updated&email=updated@example.com&position=Updated&birth_date_from=1994-07-01&birth_date_to=1994-07-31&hire_date_from=2025-01-01&hire_date_to=2025-12-31&q=Autotest",
				serverURL,
				created.AccountID,
			),
			admin.AccessToken,
			nil,
		)
		requireStatus(t, status, http.StatusOK, body)

		var deeplyFilteredEmployees []employeeResponse
		decodeJSON(t, body, &deeplyFilteredEmployees)
		if match := findEmployeeByLogin(deeplyFilteredEmployees, "AutoEmployee"); match == nil || match.AccountID != created.AccountID {
			t.Fatalf("employee was not returned by extended filters: %+v", deeplyFilteredEmployees)
		}

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/employees/%d", serverURL, created.AccountID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var afterDelete []employeeResponse
		decodeJSON(t, body, &afterDelete)
		if findEmployeeByLogin(afterDelete, "AutoEmployee") != nil {
			t.Fatal("employee should be deleted")
		}
	})
}

func TestClientsRepresentativesAndSites(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		admin := login(t, serverURL, "Admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/clients", admin.AccessToken, map[string]any{
			"name":    "Autotest Client",
			"address": "Moscow, Test 1",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var createdClient clientResponse
		decodeJSON(t, body, &createdClient)
		if createdClient.Name != "Autotest Client" {
			t.Fatalf("created client name = %q", createdClient.Name)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/clients", admin.AccessToken, map[string]any{
			"name":    "Autotest Client",
			"address": "Moscow, Test 1",
		})
		requireStatus(t, status, http.StatusConflict, body)
		requireTrimmedBody(t, body, "client with same data already exists")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/clients/%d", serverURL, createdClient.ID), admin.AccessToken, map[string]any{
			"name":    "Autotest Client Updated",
			"address": "Moscow, Test 2",
		})
		requireStatus(t, status, http.StatusOK, body)

		var updatedClient clientResponse
		decodeJSON(t, body, &updatedClient)
		if updatedClient.Name != "Autotest Client Updated" {
			t.Fatalf("updated client name = %q", updatedClient.Name)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/clients/%d/representatives", serverURL, createdClient.ID), admin.AccessToken, map[string]any{
			"login":        "AutoRepresentative",
			"password":     "secret123",
			"full_name":    "Autotest Representative",
			"phone_number": "+7 900 111 22 33",
			"email":        "representative@example.com",
			"image":        samplePNGDataURL,
			"birth_date":   "1992-03-14",
			"position":     "Coordinator",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var createdRepresentative representativeResponse
		decodeJSON(t, body, &createdRepresentative)
		if createdRepresentative.Role != "client" {
			t.Fatalf("representative role = %q, want client", createdRepresentative.Role)
		}
		if createdRepresentative.Image != samplePNGDataURL {
			t.Fatalf("representative image = %q, want %q", createdRepresentative.Image, samplePNGDataURL)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/clients/%d/representatives", serverURL, createdClient.ID), admin.AccessToken, map[string]any{
			"login":        "FutureRepresentative",
			"password":     "secret123",
			"full_name":    "Future Representative",
			"phone_number": "+7 900 111 22 34",
			"email":        "future-representative@example.com",
			"birth_date":   "2099-03-14",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "invalid birth_date")

		repTokens := login(t, serverURL, "autorepresentative", "secret123")
		if repTokens.AccessToken == "" {
			t.Fatal("representative should be able to login")
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/clients", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var clients []clientResponse
		decodeJSON(t, body, &clients)
		foundClient := findClientByName(clients, "Autotest Client Updated")
		if foundClient == nil {
			t.Fatalf("updated client not found in list: %+v", clients)
		}
		if len(foundClient.Representatives) != 1 || foundClient.Representatives[0].Login != "AutoRepresentative" {
			t.Fatalf("representative not nested into client response: %+v", foundClient.Representatives)
		}

		status, body = authorizedJSONRequest(
			t,
			http.MethodGet,
			serverURL+"/api/v1/clients?name=Autotest&address=Test&representative_login=AutoRepresentative&representative_full_name=Autotest&representative_email=representative@example.com&representative_position=Coordinator&representative_birth_date_from=1992-03-01&representative_birth_date_to=1992-03-31&q=Client",
			admin.AccessToken,
			nil,
		)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &clients)
		if filteredClient := findClientByName(clients, "Autotest Client Updated"); filteredClient == nil {
			t.Fatalf("client was not returned by extended filters: %+v", clients)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/representatives/%d", serverURL, createdRepresentative.AccountID), admin.AccessToken, map[string]any{
			"full_name": "Autotest Representative Updated",
			"client_id": 1,
		})
		requireStatus(t, status, http.StatusOK, body)

		var movedRepresentative representativeResponse
		decodeJSON(t, body, &movedRepresentative)
		if movedRepresentative.ClientID != 1 {
			t.Fatalf("representative client_id = %d, want 1", movedRepresentative.ClientID)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/clients", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &clients)

		for _, client := range clients {
			if client.ID == createdClient.ID && len(client.Representatives) != 0 {
				t.Fatalf("representative should have been moved away from original client: %+v", client.Representatives)
			}
			if client.ID == 1 {
				found := false
				for _, representative := range client.Representatives {
					if representative.AccountID == createdRepresentative.AccountID {
						found = true
					}
				}
				if !found {
					t.Fatal("representative should be attached to client 1 after move")
				}
			}
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/clients", admin.AccessToken, map[string]any{
			"name":    "Autotest Derived Client",
			"address": "Kazan, Test 3",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var derivedClient clientResponse
		decodeJSON(t, body, &derivedClient)

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/clients/%d/representatives", serverURL, derivedClient.ID), admin.AccessToken, map[string]any{
			"login":        "SiteRepresentative",
			"password":     "secret123",
			"full_name":    "Site Representative",
			"phone_number": "+7 900 222 33 44",
			"email":        "site-representative@example.com",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var siteRepresentative representativeResponse
		decodeJSON(t, body, &siteRepresentative)

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/sites", admin.AccessToken, map[string]any{
			"responsible_id": siteRepresentative.AccountID,
			"name":           "Autotest Site",
			"address":        "Kazan, Site 10",
			"product_ids":    []int{1, 2},
		})
		requireStatus(t, status, http.StatusCreated, body)

		var createdSite siteResponse
		decodeJSON(t, body, &createdSite)
		if createdSite.ClientID != derivedClient.ID {
			t.Fatalf("site client_id = %d, want %d", createdSite.ClientID, derivedClient.ID)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/sites", admin.AccessToken, map[string]any{
			"responsible_id": siteRepresentative.AccountID,
			"name":           "Autotest Site",
			"address":        "Kazan, Site 10",
			"product_ids":    []int{1, 2},
		})
		requireStatus(t, status, http.StatusConflict, body)
		requireTrimmedBody(t, body, "site with same data already exists")

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/sites?responsible_id=%d", serverURL, siteRepresentative.AccountID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var sites []siteResponse
		decodeJSON(t, body, &sites)
		filteredSite := findSiteByID(sites, createdSite.ID)
		if filteredSite == nil || filteredSite.ClientID != derivedClient.ID {
			t.Fatalf("site filter did not return expected client derivation: %+v", sites)
		}

		status, body = authorizedJSONRequest(
			t,
			http.MethodGet,
			fmt.Sprintf("%s/api/v1/sites?id=%d&client_id=%d&responsible_id=%d&product_id=1&name=Autotest&address=Kazan&q=Site", serverURL, createdSite.ID, derivedClient.ID, siteRepresentative.AccountID),
			admin.AccessToken,
			nil,
		)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &sites)
		filteredSite = findSiteByID(sites, createdSite.ID)
		if filteredSite == nil {
			t.Fatalf("site was not returned by extended filters: %+v", sites)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/representatives/%d", serverURL, siteRepresentative.AccountID), admin.AccessToken, map[string]any{
			"client_id": 1,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/sites?responsible_id=%d", serverURL, siteRepresentative.AccountID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &sites)

		filteredSite = findSiteByID(sites, createdSite.ID)
		if filteredSite == nil || filteredSite.ClientID != 1 {
			t.Fatalf("site client should be re-derived from representative client change: %+v", sites)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/sites", admin.AccessToken, map[string]any{
			"responsible_id": siteRepresentative.AccountID,
			"name":           "Broken Site",
			"address":        "Nowhere",
			"product_ids":    []int{9999},
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/sites/%d", serverURL, createdSite.ID), admin.AccessToken, map[string]any{
			"name":        "Autotest Site Updated",
			"product_ids": []int{2, 3},
		})
		requireStatus(t, status, http.StatusOK, body)

		var updatedSite siteResponse
		decodeJSON(t, body, &updatedSite)
		if updatedSite.Name != "Autotest Site Updated" {
			t.Fatalf("updated site name = %q", updatedSite.Name)
		}
		if len(updatedSite.ProductIDs) != 2 || updatedSite.ProductIDs[0] != 2 || updatedSite.ProductIDs[1] != 3 {
			t.Fatalf("updated site product_ids = %+v", updatedSite.ProductIDs)
		}

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/sites/%d", serverURL, createdSite.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)
		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/representatives/%d", serverURL, siteRepresentative.AccountID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)
		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/clients/%d", serverURL, derivedClient.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/representatives/%d", serverURL, createdRepresentative.AccountID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)
		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/clients/%d", serverURL, createdClient.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)
	})
}

func TestEquipmentCRUDAndFilters(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		admin := login(t, serverURL, "Admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/equipment", admin.AccessToken, map[string]any{
			"type_id": 1,
			"site_id": 9999,
			"name":    "Broken Equipment",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/equipment", admin.AccessToken, map[string]any{
			"type_id":       1,
			"name":          "Autotest Equipment",
			"serial_number": "SER-001",
			"weight":        "10.5",
			"description":   "Created by integration test",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var created equipmentResponse
		decodeJSON(t, body, &created)
		if created.SiteID != nil || created.TypeID != 1 {
			t.Fatalf("created equipment mismatch: %+v", created)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/equipment", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var unassigned []equipmentResponse
		decodeJSON(t, body, &unassigned)
		if findEquipmentByID(unassigned, created.ID) == nil {
			t.Fatalf("created unassigned equipment not found in list: %+v", unassigned)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/equipment/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"site_id": 1,
		})
		requireStatus(t, status, http.StatusOK, body)

		decodeJSON(t, body, &created)
		if created.SiteID == nil || *created.SiteID != 1 {
			t.Fatalf("equipment should be assigned to site 1: %+v", created)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/equipment?site_id=1", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var bySite []equipmentResponse
		decodeJSON(t, body, &bySite)
		if findEquipmentByID(bySite, created.ID) == nil {
			t.Fatalf("created equipment not found by site filter: %+v", bySite)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/equipment/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"type_id":     2,
			"site_id":     2,
			"name":        "Autotest Equipment Updated",
			"description": "Updated by integration test",
		})
		requireStatus(t, status, http.StatusOK, body)

		var updated equipmentResponse
		decodeJSON(t, body, &updated)
		if updated.TypeID != 2 || updated.SiteID == nil || *updated.SiteID != 2 {
			t.Fatalf("updated equipment mismatch: %+v", updated)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/equipment?site_id=2&type_id=2", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var filtered []equipmentResponse
		decodeJSON(t, body, &filtered)
		if findEquipmentByID(filtered, created.ID) == nil {
			t.Fatalf("updated equipment not found by combined filters: %+v", filtered)
		}

		status, body = authorizedJSONRequest(
			t,
			http.MethodGet,
			fmt.Sprintf("%s/api/v1/equipment?id=%d&site_id=2&type_id=2&client_id=1&product_id=3&serial_number=SER&name=Updated&description=Updated&q=Equipment", serverURL, created.ID),
			admin.AccessToken,
			nil,
		)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &filtered)
		if findEquipmentByID(filtered, created.ID) == nil {
			t.Fatalf("updated equipment not found by extended filters: %+v", filtered)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/equipment/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"site_id": nil,
		})
		requireStatus(t, status, http.StatusOK, body)

		var detached equipmentResponse
		decodeJSON(t, body, &detached)
		if detached.SiteID != nil {
			t.Fatalf("equipment should allow clearing site_id: %+v", detached)
		}

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/equipment/%d", serverURL, created.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/equipment?site_id=2", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &filtered)
		if findEquipmentByID(filtered, created.ID) != nil {
			t.Fatal("equipment should be removed after delete")
		}
	})
}

func TestAppealsLifecycleValidationAndDeletionRules(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		admin := login(t, serverURL, "Admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/bootstrap", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var bootstrap bootstrapResponse
		decodeJSON(t, body, &bootstrap)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/profiles/me", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var me profileMeResponse
		decodeJSON(t, body, &me)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var employees []employeeResponse
		decodeJSON(t, body, &employees)
		if len(employees) == 0 {
			t.Fatal("expected seeded employees")
		}
		responsibleID := employees[0].AccountID

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/appeals", admin.AccessToken, map[string]any{
			"title":          "Broken appeal",
			"description":    "Broken appeal",
			"type_id":        bootstrap.TicketTypes[0].ID,
			"criticality_id": bootstrap.TicketCriticalities[0].ID,
			"client_id":      2,
			"site_id":        1,
			"product_id":     1,
			"responsible_id": responsibleID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		createdStatusID := statusIDByName(bootstrap.TicketStatuses, "Created")
		openedStatusID := statusIDByName(bootstrap.TicketStatuses, "Opened")
		doneStatusID := statusIDByName(bootstrap.TicketStatuses, "Done")
		verifiedStatusID := statusIDByName(bootstrap.TicketStatuses, "Verified")
		if createdStatusID == 0 || openedStatusID == 0 || doneStatusID == 0 || verifiedStatusID == 0 {
			t.Fatalf("required statuses are missing: %+v", bootstrap.TicketStatuses)
		}

		createPayload := map[string]any{
			"title":          "Autotest appeal",
			"description":    "Appeal lifecycle test",
			"type_id":        bootstrap.TicketTypes[0].ID,
			"criticality_id": bootstrap.TicketCriticalities[0].ID,
			"client_id":      1,
			"site_id":        1,
			"product_id":     1,
		}
		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/appeals", admin.AccessToken, createPayload)
		requireStatus(t, status, http.StatusCreated, body)

		var created appealResponse
		decodeJSON(t, body, &created)
		if created.StatusID != createdStatusID {
			t.Fatalf("created appeal status = %d, want %d", created.StatusID, createdStatusID)
		}
		if created.CreatedBy != me.AccountID || created.UpdatedBy != me.AccountID {
			t.Fatalf("created_by/updated_by should come from session: %+v", created)
		}
		if created.ResponsibleID != nil {
			t.Fatalf("created appeal should stay unassigned: %+v", created)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/appeals?client_id=1", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var appeals []appealResponse
		decodeJSON(t, body, &appeals)
		if findAppealByID(appeals, created.ID) == nil {
			t.Fatalf("appeal not found in filtered list: %+v", appeals)
		}

		status, body = authorizedJSONRequest(
			t,
			http.MethodGet,
			fmt.Sprintf("%s/api/v1/appeals?id=%d&title=Autotest&description=lifecycle&client_id=1&site_id=1&product_id=1&created_by=%d&updated_by=%d&q=Appeal", serverURL, created.ID, me.AccountID, me.AccountID),
			admin.AccessToken,
			nil,
		)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &appeals)
		if match := findAppealByID(appeals, created.ID); match == nil || match.CreatedBy != me.AccountID {
			t.Fatalf("appeal was not returned by extended filters: %+v", appeals)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"title": "Autotest appeal opened",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "title and type cannot be changed")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"type_id": bootstrap.TicketTypes[len(bootstrap.TicketTypes)-1].ID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "title and type cannot be changed")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, created.ID), admin.AccessToken, map[string]any{
			"responsible_id": responsibleID,
		})
		requireStatus(t, status, http.StatusOK, body)

		var opened appealResponse
		decodeJSON(t, body, &opened)
		if opened.StatusID != openedStatusID {
			t.Fatalf("updated appeal status = %d, want %d", opened.StatusID, openedStatusID)
		}
		if opened.ResponsibleID == nil || *opened.ResponsibleID != responsibleID {
			t.Fatalf("responsible_id should be assigned from patch: %+v", opened)
		}

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, created.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, created.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNotFound, body)
		requireTrimmedBody(t, body, "ticket not found")

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/appeals", admin.AccessToken, createPayload)
		requireStatus(t, status, http.StatusCreated, body)

		var doneCandidate appealResponse
		decodeJSON(t, body, &doneCandidate)

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, doneCandidate.ID), admin.AccessToken, map[string]any{
			"status_id": doneStatusID,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, doneCandidate.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal cannot be deleted in current status")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, doneCandidate.ID), admin.AccessToken, map[string]any{
			"status_id": verifiedStatusID,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, doneCandidate.ID), admin.AccessToken, map[string]any{
			"status_id": openedStatusID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal is verified and cannot be changed")
	})
}

func TestAppealCommentsLinksAndReactions(t *testing.T) {
	withFreshServer(t, func(t *testing.T, serverURL string) {
		admin := login(t, serverURL, "Admin", "admin")

		status, body := authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/bootstrap", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var bootstrap bootstrapResponse
		decodeJSON(t, body, &bootstrap)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/profiles/me", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var me profileMeResponse
		decodeJSON(t, body, &me)

		status, body = authorizedJSONRequest(t, http.MethodGet, serverURL+"/api/v1/employees", admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var employees []employeeResponse
		decodeJSON(t, body, &employees)
		if len(employees) == 0 {
			t.Fatal("expected seeded employees")
		}

		doneStatusID := statusIDByName(bootstrap.TicketStatuses, "Done")
		verifiedStatusID := statusIDByName(bootstrap.TicketStatuses, "Verified")
		if doneStatusID == 0 || verifiedStatusID == 0 {
			t.Fatalf("required statuses are missing: %+v", bootstrap.TicketStatuses)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/appeals", admin.AccessToken, map[string]any{
			"title":          "Autotest parent appeal",
			"description":    "Comments and links test",
			"type_id":        bootstrap.TicketTypes[0].ID,
			"criticality_id": bootstrap.TicketCriticalities[0].ID,
			"client_id":      1,
			"site_id":        1,
			"product_id":     1,
			"responsible_id": employees[0].AccountID,
		})
		requireStatus(t, status, http.StatusCreated, body)

		var parentAppeal appealResponse
		decodeJSON(t, body, &parentAppeal)

		status, body = authorizedJSONRequest(t, http.MethodPost, serverURL+"/api/v1/appeals", admin.AccessToken, map[string]any{
			"title":          "Autotest child appeal",
			"description":    "Child appeal for subtask validation",
			"type_id":        bootstrap.TicketTypes[0].ID,
			"criticality_id": bootstrap.TicketCriticalities[0].ID,
			"client_id":      1,
			"site_id":        1,
			"product_id":     1,
			"responsible_id": employees[0].AccountID,
		})
		requireStatus(t, status, http.StatusCreated, body)

		var childAppeal appealResponse
		decodeJSON(t, body, &childAppeal)

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/comments", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"contents": "Autotest comment",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var createdComment commentResponse
		decodeJSON(t, body, &createdComment)
		if createdComment.AuthorName != me.FullName {
			t.Fatalf("author_name = %q, want %q", createdComment.AuthorName, me.FullName)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/appeals/%d/comments", serverURL, parentAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var comments []commentResponse
		decodeJSON(t, body, &comments)
		if len(comments) != 1 {
			t.Fatalf("expected one comment, got %d", len(comments))
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d/comments/%d", serverURL, parentAppeal.ID, createdComment.ID), admin.AccessToken, map[string]any{
			"contents":          "Autotest comment updated",
			"is_closed_comment": true,
		})
		requireStatus(t, status, http.StatusOK, body)

		var updatedComment commentResponse
		decodeJSON(t, body, &updatedComment)
		if !updatedComment.IsClosedComment || updatedComment.Contents != "Autotest comment updated" {
			t.Fatalf("updated comment mismatch: %+v", updatedComment)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/comments/%d/reactions", serverURL, parentAppeal.ID, createdComment.ID), admin.AccessToken, map[string]any{
			"reaction_id": bootstrap.Reactions[0].ID,
		})
		requireStatus(t, status, http.StatusCreated, body)

		var reactedComment commentResponse
		decodeJSON(t, body, &reactedComment)
		if len(reactedComment.ReactionIDs) != 1 || reactedComment.ReactionIDs[0] != bootstrap.Reactions[0].ID {
			t.Fatalf("reaction_ids mismatch: %+v", reactedComment.ReactionIDs)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/comments/%d/reactions", serverURL, parentAppeal.ID, createdComment.ID), admin.AccessToken, map[string]any{
			"reaction_id": bootstrap.Reactions[0].ID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"linked_appeal_id": 1,
			"relation_type":    "blocks",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"linked_appeal_id": childAppeal.ID,
			"relation_type":    "subtask",
		})
		requireStatus(t, status, http.StatusCreated, body)

		var createdLink appealLinkResponse
		decodeJSON(t, body, &createdLink)
		if createdLink.LinkedAppealID != childAppeal.ID || createdLink.RelationType != "parent_for" {
			t.Fatalf("link mismatch: %+v", createdLink)
		}

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"linked_appeal_id": parentAppeal.ID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "all fields are inconsistent")

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, parentAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)

		var links []appealLinkResponse
		decodeJSON(t, body, &links)
		if len(links) != 1 || links[0].LinkedAppealID != childAppeal.ID || links[0].RelationType != "parent_for" {
			t.Fatalf("links mismatch: %+v", links)
		}

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, childAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &links)
		reverseLink := findAppealLinkByLinkedAppealID(links, parentAppeal.ID)
		if reverseLink == nil || reverseLink.RelationType != "subtask_for" {
			t.Fatalf("reverse link mismatch: %+v", links)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"status_id": doneStatusID,
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "parent appeal cannot be completed before all subtasks are done")

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, childAppeal.ID), admin.AccessToken, map[string]any{
			"status_id": doneStatusID,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"status_id": doneStatusID,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d/links/%d", serverURL, parentAppeal.ID, childAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusNoContent, body)

		status, body = authorizedJSONRequest(t, http.MethodGet, fmt.Sprintf("%s/api/v1/appeals/%d/links", serverURL, childAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusOK, body)
		decodeJSON(t, body, &links)
		if findAppealLinkByLinkedAppealID(links, parentAppeal.ID) != nil {
			t.Fatalf("link should be removed from both directions: %+v", links)
		}

		status, body = authorizedJSONRequest(t, http.MethodPatch, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"status_id": verifiedStatusID,
		})
		requireStatus(t, status, http.StatusOK, body)

		status, body = authorizedJSONRequest(t, http.MethodPost, fmt.Sprintf("%s/api/v1/appeals/%d/comments", serverURL, parentAppeal.ID), admin.AccessToken, map[string]any{
			"contents": "Blocked comment",
		})
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal is verified and cannot be changed")

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d/comments/%d/reactions/%d", serverURL, parentAppeal.ID, createdComment.ID, bootstrap.Reactions[0].ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal is verified and cannot be changed")

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d/comments/%d", serverURL, parentAppeal.ID, createdComment.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal is verified and cannot be changed")

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, childAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal cannot be deleted in current status")

		status, body = authorizedJSONRequest(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/appeals/%d", serverURL, parentAppeal.ID), admin.AccessToken, nil)
		requireStatus(t, status, http.StatusBadRequest, body)
		requireTrimmedBody(t, body, "appeal cannot be deleted in current status")
	})
}
