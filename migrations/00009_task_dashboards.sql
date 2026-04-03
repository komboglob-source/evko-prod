-- +goose Up
CREATE TABLE "profiles"."TaskDashboards" (
  "account_id" bigint PRIMARY KEY,
  "payload" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "profiles"."TaskDashboards"
  ADD FOREIGN KEY ("account_id")
  REFERENCES "profiles"."Profiles" ("account_id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION
  DEFERRABLE INITIALLY IMMEDIATE;

COMMENT ON TABLE "profiles"."TaskDashboards" IS 'Пользовательские настройки дашбордов задач';
COMMENT ON COLUMN "profiles"."TaskDashboards"."payload" IS 'Сохраненная конфигурация пользовательских дашбордов';

-- +goose Down
DROP TABLE IF EXISTS "profiles"."TaskDashboards";
