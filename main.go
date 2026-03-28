package main

import (
	"fmt"
	"log"
	"net/http"

	"crm_be/api/appeals"
	"crm_be/api/auth"
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
	default:
		fmt.Fprint(w, "unknown url path")
		w.WriteHeader(http.StatusNotFound)
	case utils.StartsWith(path, "/auth"):
		auth.HandleAPIRequest(w, r, path[len("/auth"):])
	case utils.StartsWith(path, "/appeals"):
		appeals.HandleAPIRequest(w, r, path[len("/appeals"):])
	}
}

type Router struct{}

func (*Router) RouterFunc(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case utils.StartsWith(path, "/api/v1"):
		HandleAPIRequest(w, r, path[len("/api/v1"):])
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
