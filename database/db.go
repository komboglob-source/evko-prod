package database

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

var (
	DB *sql.DB
)

func OpenDB() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=user password=0000 dbname=ebko sslmode=disable"
	}

	var err error
	DB, err = sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("failed to open DB: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping DB: %w", err)
	}

	if err = runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}

func runMigrations() error {
	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(DB, "migrations")
}

func CloseDB() error {
	if err := DB.Close(); err != nil {
		return fmt.Errorf("failed to close DB: %w", err)
	}
	return nil
}
