-- "Photos" became "Memories" on screen, and the table now holds videos too,
-- so `photos` is renamed rather than replaced — every existing row, key and
-- upload survives untouched.
ALTER TABLE "photos" RENAME TO "media";--> statement-breakpoint
ALTER TABLE "media" RENAME CONSTRAINT "photos_uploaded_by_member_id_members_id_fk" TO "media_uploaded_by_member_id_members_id_fk";--> statement-breakpoint
ALTER INDEX "photos_created_at_idx" RENAME TO "media_created_at_idx";--> statement-breakpoint
ALTER INDEX "photos_status_created_at_idx" RENAME TO "media_status_created_at_idx";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "kind" varchar(10) DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "poster_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_seconds" integer;
