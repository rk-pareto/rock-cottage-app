CREATE TABLE "bringing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"category" varchar(80),
	"notes" text,
	"responsible_member_id" uuid NOT NULL,
	"packed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_assignments" (
	"meal_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "meal_assignments_meal_id_member_id_pk" PRIMARY KEY("meal_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"display_description" text,
	"practical_notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"auth_user_id" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_key" text NOT NULL,
	"display_key" text,
	"thumbnail_key" text,
	"original_filename" text NOT NULL,
	"original_content_type" varchar(120) NOT NULL,
	"original_bytes" bigint NOT NULL,
	"original_width" integer,
	"original_height" integer,
	"uploaded_by_member_id" uuid NOT NULL,
	"processing_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"requested_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_up_at" timestamp with time zone,
	"picked_up_by_member_id" uuid
);
--> statement-breakpoint
ALTER TABLE "bringing_items" ADD CONSTRAINT "bringing_items_responsible_member_id_members_id_fk" FOREIGN KEY ("responsible_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_assignments" ADD CONSTRAINT "meal_assignments_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_assignments" ADD CONSTRAINT "meal_assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_events" ADD CONSTRAINT "pet_events_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_events" ADD CONSTRAINT "pet_events_recorded_by_member_id_members_id_fk" FOREIGN KEY ("recorded_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_member_id_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_requested_by_member_id_members_id_fk" FOREIGN KEY ("requested_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_picked_up_by_member_id_members_id_fk" FOREIGN KEY ("picked_up_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bringing_items_responsible_idx" ON "bringing_items" USING btree ("responsible_member_id");--> statement-breakpoint
CREATE INDEX "bringing_items_category_idx" ON "bringing_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "meal_assignments_member_idx" ON "meal_assignments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "meals_meal_date_idx" ON "meals" USING btree ("meal_date");--> statement-breakpoint
CREATE INDEX "meals_date_type_idx" ON "meals" USING btree ("meal_date","meal_type");--> statement-breakpoint
CREATE UNIQUE INDEX "meals_seed_key_unique" ON "meals" USING btree ("meal_date","meal_type","title");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_unique" ON "members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "members_auth_user_id_unique" ON "members" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "pet_events_pet_type_occurred_idx" ON "pet_events" USING btree ("pet_id","event_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pet_events_pet_occurred_idx" ON "pet_events" USING btree ("pet_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "photos_created_at_idx" ON "photos" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "photos_status_created_at_idx" ON "photos" USING btree ("processing_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shopping_items_picked_up_at_idx" ON "shopping_items" USING btree ("picked_up_at");--> statement-breakpoint
CREATE INDEX "shopping_items_created_at_idx" ON "shopping_items" USING btree ("created_at");