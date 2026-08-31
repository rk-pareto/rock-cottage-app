import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Meal types allowed by the app (spec §9.2). */
export const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Dog event types allowed by the app (spec §10.4). */
export const PET_EVENT_TYPES = ["outside", "poop", "fed"] as const;
export type PetEventType = (typeof PET_EVENT_TYPES)[number];

/** Categories for the Public Goods list (what everyone's bringing to share).
 *  Fixed on purpose — see `lib/bringingCategories.ts` for labels and the
 *  descriptions shown while picking one. */
export const BRINGING_CATEGORIES = [
  "cooking",
  "toys_games",
  "drinks",
  "recreation",
  "household",
  "other",
] as const;
export type BringingCategory = (typeof BRINGING_CATEGORIES)[number];

/** Memory processing states (spec §14.8). */
export const PROCESSING_STATES = ["pending", "processing", "ready", "failed"] as const;
export type ProcessingState = (typeof PROCESSING_STATES)[number];

/** What a memory actually is. Stills and clips share one table because the
 *  gallery, the home feed and the delete rules treat them identically. */
export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Application allowlist. An authenticated Neon Auth user only gets in if there
 * is an active row here matching their lowercased email (spec §6.2).
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    authUserId: text("auth_user_id"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * When this member finished (or skipped) the intro tour. Null means they
     * still get it on their next page load — which is why it lives here and
     * not in the browser: the tour belongs to the person, not the phone.
     */
    introSeenAt: timestamp("intro_seen_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("members_email_unique").on(t.email),
    uniqueIndex("members_auth_user_id_unique").on(t.authUserId),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealDate: date("meal_date").notNull(),
    mealType: varchar("meal_type", { length: 20 }).notNull().$type<MealType>(),
    title: varchar("title", { length: 200 }).notNull(),
    displayDescription: text("display_description"),
    practicalNotes: text("practical_notes"),
    /** Relative path under public/, e.g. "meals/chili.jpg" (spec: meal photos). */
    photoPath: text("photo_path"),
    /**
     * Set when the responsible member answers the confirmation prompt — either
     * by confirming the meal as-is or by renaming it (spec §9.5). Null means
     * the prompt is still outstanding; it is never cleared once answered.
     */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByMemberId: uuid("confirmed_by_member_id").references(() => members.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("meals_meal_date_idx").on(t.mealDate),
    index("meals_date_type_idx").on(t.mealDate, t.mealType),
    // Stable natural key for idempotent seeding (spec §26). Deliberately not
    // including the title: a cook can rename their meal, and a seed key that
    // moves with the name would re-insert the original rather than update it.
    // One meal per slot per day is the schedule the house actually runs on.
    uniqueIndex("meals_seed_key_unique").on(t.mealDate, t.mealType),
  ],
);

export const mealAssignments = pgTable(
  "meal_assignments",
  {
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.mealId, t.memberId] }),
    index("meal_assignments_member_idx").on(t.memberId),
  ],
);

export const pets = pgTable("pets", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 60 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt,
});

export const petEvents = pgTable(
  "pet_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 20 }).notNull().$type<PetEventType>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    recordedByMemberId: uuid("recorded_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("pet_events_pet_type_occurred_idx").on(t.petId, t.eventType, t.occurredAt.desc()),
    index("pet_events_pet_occurred_idx").on(t.petId, t.occurredAt.desc()),
  ],
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    requestedByMemberId: uuid("requested_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    /**
     * An optional photo of the thing being asked for — "this jar, not that
     * one". Only ever the compressed WebP: the upload it was made from is
     * deleted the moment it has been re-encoded, and no `media` row is
     * created, so a picture of a pickle jar never turns up in Memories.
     */
    photoKey: text("photo_key"),
    createdAt,
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    pickedUpByMemberId: uuid("picked_up_by_member_id").references(() => members.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    index("shopping_items_picked_up_at_idx").on(t.pickedUpAt),
    index("shopping_items_created_at_idx").on(t.createdAt),
  ],
);

export const bringingItems = pgTable(
  "bringing_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 20 }).notNull().$type<BringingCategory>(),
    notes: text("notes"),
    responsibleMemberId: uuid("responsible_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    packedAt: timestamp("packed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("bringing_items_responsible_idx").on(t.responsibleMemberId),
    index("bringing_items_category_idx").on(t.category),
  ],
);

/**
 * Memories: the photos and videos everyone uploads. Still called `media` in
 * the database because "memory" is the word on screen, not a storage concept.
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 10 }).notNull().default("image").$type<MediaKind>(),
    originalKey: text("original_key").notNull(),
    /** Images: the optimized WebP. Videos: the WebP made from the poster. */
    displayKey: text("display_key"),
    thumbnailKey: text("thumbnail_key"),
    /** Videos only: the frame the browser grabbed at upload time, as sent. */
    posterKey: text("poster_key"),
    originalFilename: text("original_filename").notNull(),
    originalContentType: varchar("original_content_type", { length: 120 }).notNull(),
    originalBytes: bigint("original_bytes", { mode: "number" }).notNull(),
    originalWidth: integer("original_width"),
    originalHeight: integer("original_height"),
    /** Videos only, rounded to whole seconds — just for the duration badge. */
    durationSeconds: integer("duration_seconds"),
    uploadedByMemberId: uuid("uploaded_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    processingStatus: varchar("processing_status", { length: 20 })
      .notNull()
      .default("pending")
      .$type<ProcessingState>(),
    processingError: text("processing_error"),
    /**
     * Videos only: the capped-1080p H.264/AAC MP4 built so a clip recorded as
     * HEVC plays for everyone, not just the phone that shot it. Null on an
     * image, and null on a video whose original was already a fine playback
     * copy — see `playbackStatus`.
     */
    playbackKey: text("playback_key"),
    /** Size of whatever `/view` actually serves, so `shareable` can be
     *  computed from the bytes that would really be shared. */
    playbackBytes: bigint("playback_bytes", { mode: "number" }),
    /**
     * The transcode pass, tracked separately from `processingStatus`: a clip
     * is visible and playable-where-it-can-be the moment its poster is
     * handled, and this enhancement lands later. Null on images.
     */
    playbackStatus: varchar("playback_status", { length: 20 }).$type<ProcessingState>(),
    playbackError: text("playback_error"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("media_created_at_idx").on(t.createdAt.desc()),
    index("media_status_created_at_idx").on(t.processingStatus, t.createdAt.desc()),
    // The boot sweep asks for exactly this: unfinished playback passes,
    // oldest first.
    index("media_playback_status_created_at_idx").on(t.playbackStatus, t.createdAt),
  ],
);

/**
 * A member's private favorites among the memories. Never joined against other
 * members — every query is scoped to one member_id, so who favorited what
 * stays visible only to that member.
 */
export const memoryFavorites = pgTable(
  "memory_favorites",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.memoryId] }),
    index("memory_favorites_member_idx").on(t.memberId, t.createdAt.desc()),
  ],
);

/**
 * A message any member can pin to the top of the home feed — text, a photo
 * or video, or both. `mediaId` points at an ordinary `media` row uploaded
 * through the same pipeline as `/memories`, so an attachment is a real
 * memory from the moment it's posted, not a separate copy.
 */
export const feedPosts = pgTable(
  "feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorMemberId: uuid("author_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    /** Nullable — a post can be media-only. */
    body: text("body"),
    /**
     * Null when there's no attachment, or once the underlying memory has
     * been deleted from the gallery — the message still stands on its own.
     */
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [index("feed_posts_created_at_idx").on(t.createdAt.desc())],
);

/**
 * Per-member dismissals of a feed post. Never joined across members — a
 * dismissal only ever hides the post from the one person who swiped it away,
 * same privacy shape as {@link memoryFavorites}.
 */
export const feedPostDismissals = pgTable(
  "feed_post_dismissals",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.memberId, t.postId] })],
);

export type Member = typeof members.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Pet = typeof pets.$inferSelect;
export type PetEvent = typeof petEvents.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type BringingItem = typeof bringingItems.$inferSelect;
export type Media = typeof media.$inferSelect;
export type MemoryFavorite = typeof memoryFavorites.$inferSelect;
export type FeedPost = typeof feedPosts.$inferSelect;
export type FeedPostDismissal = typeof feedPostDismissals.$inferSelect;

