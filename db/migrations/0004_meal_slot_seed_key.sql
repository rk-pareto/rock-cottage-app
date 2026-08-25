DROP INDEX "meals_seed_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "meals_seed_key_unique" ON "meals" USING btree ("meal_date","meal_type");