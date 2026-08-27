-- Videos gain a server-made playback copy (capped-1080p H.264/AAC MP4) so a
-- clip recorded as HEVC plays for everyone. The original is untouched; these
-- columns only describe the extra object.
ALTER TABLE "media" ADD COLUMN "playback_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "playback_bytes" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "playback_status" varchar(20);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "playback_error" text;--> statement-breakpoint
CREATE INDEX "media_playback_status_created_at_idx" ON "media" USING btree ("playback_status","created_at");--> statement-breakpoint
-- Existing clips queue up for the backfill; the boot sweep works through them
-- oldest-first. Images keep a null status — they have no playback pass.
UPDATE "media" SET "playback_status" = 'pending' WHERE "kind" = 'video';
