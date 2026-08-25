ALTER TABLE "meals" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "confirmed_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_confirmed_by_member_id_members_id_fk" FOREIGN KEY ("confirmed_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;