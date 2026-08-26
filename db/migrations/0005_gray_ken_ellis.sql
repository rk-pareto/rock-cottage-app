-- Categories used to be free text. Fold anything that isn't one of the new
-- fixed values (missing, mistyped, or an old freeform label like
-- "Condiments") into "other" so the NOT NULL + shorter varchar below never
-- fails against existing rows.
UPDATE "bringing_items"
SET "category" = 'other'
WHERE "category" IS NULL
   OR "category" NOT IN ('cooking', 'toys_games', 'drinks', 'recreation', 'household', 'other');--> statement-breakpoint
ALTER TABLE "bringing_items" ALTER COLUMN "category" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "bringing_items" ALTER COLUMN "category" SET NOT NULL;