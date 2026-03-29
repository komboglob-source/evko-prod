-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    existing_check_name text;
BEGIN
    SELECT con.conname
    INTO existing_check_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'tasks'
      AND rel.relname = 'ConnectedTickets'
      AND con.contype = 'c'
    LIMIT 1;

    IF existing_check_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE "tasks"."ConnectedTickets" DROP CONSTRAINT %I',
            existing_check_name
        );
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    -- No-op: older installations could have had different check definitions,
    -- so rollback must not guess and recreate an incorrect constraint.
END $$;
-- +goose StatementEnd
