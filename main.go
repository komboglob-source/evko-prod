package main

import (
	"log"
	"net/http"

	"crm_be/api/appeals"
	"crm_be/api/auth"
	"crm_be/api/crm"
	"crm_be/api/nri"
	"crm_be/api/utils"
	"crm_be/database"
)

func HandleAPIRequest(w http.ResponseWriter, r *http.Request, path string) {
	if utils.StartsWith(path, "/auth") {
		auth.HandleAPIRequest(w, r, path[len("/auth"):])
		return
	}

	if !utils.CheckToken(w, r) {
		return
	}

	switch {
	case utils.StartsWith(path, "/bootstrap"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/profiles"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/employees"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/clients"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/representatives"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/sites"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/products"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/ticket-types"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/ticket-statuses"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/ticket-criticalities"):
		crm.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/equipment-types"):
		nri.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/equipment"):
		nri.HandleAPIRequest(w, r, path)
	case utils.StartsWith(path, "/appeals"):
		appeals.HandleAPIRequest(w, r, path[len("/appeals"):])
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
	}
}

type Router struct{}

func (*Router) RouterFunc(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case utils.StartsWith(path, "/api/v1"):
		HandleAPIRequest(w, r, path[len("/api/v1"):])
	default:
		http.Error(w, "unknown url path", http.StatusNotFound)
	}
}

func (rt *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rt.RouterFunc(w, r)
}

func main() {
	if err := database.OpenDB(); err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	defer database.CloseDB()

	router := &Router{}
	log.Println("Server start...")
	log.Fatal(http.ListenAndServe(":8080", router))
}
