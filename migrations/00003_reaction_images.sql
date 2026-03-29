-- +goose Up
UPDATE "tasks"."Reactions"
SET picture = decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
WHERE id = 1;

UPDATE "tasks"."Reactions"
SET picture = decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgOMHwHwADXAHInah2ygAAAABJRU5ErkJggg==', 'base64')
WHERE id = 2;

UPDATE "tasks"."Reactions"
SET picture = decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgiPr/HwAEEAJZs1E1mQAAAABJRU5ErkJggg==', 'base64')
WHERE id = 3;

-- +goose Down
UPDATE "tasks"."Reactions" SET picture = convert_to('like', 'UTF8') WHERE id = 1;
UPDATE "tasks"."Reactions" SET picture = convert_to('dislike', 'UTF8') WHERE id = 2;
UPDATE "tasks"."Reactions" SET picture = convert_to('done', 'UTF8') WHERE id = 3;
