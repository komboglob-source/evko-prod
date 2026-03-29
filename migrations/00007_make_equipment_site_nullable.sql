-- +goose Up
ALTER TABLE "nri"."Equipment"
  ALTER COLUMN "site_id" DROP NOT NULL;

-- +goose Down
ALTER TABLE "nri"."Equipment"
  ALTER COLUMN "site_id" SET NOT NULL;
