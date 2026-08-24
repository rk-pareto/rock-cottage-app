CREATE TABLE "memory_favorites" (
	"member_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_favorites_member_id_memory_id_pk" PRIMARY KEY("member_id","memory_id")
);
--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "photo_path" text;--> statement-breakpoint
ALTER TABLE "memory_favorites" ADD CONSTRAINT "memory_favorites_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_favorites" ADD CONSTRAINT "memory_favorites_memory_id_media_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_favorites_member_idx" ON "memory_favorites" USING btree ("member_id","created_at" DESC NULLS LAST);