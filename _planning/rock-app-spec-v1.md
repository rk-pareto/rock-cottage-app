Cottage App — V1 Product & Implementation Specification

1. Objective

Build and deploy a small, mobile-first web application for a group of approximately 1–5 people sharing a cottage for several days.

The priority is:

working, delightful, simple, and deployed quickly.

This is not a commercial SaaS product. Do not introduce architecture intended for scale, multitenancy, generic extensibility, or enterprise administration unless specifically required below.

The application should work particularly well when opened from a phone and installed to the phone's home screen as a PWA.

---

2. Core Product

The application has seven primary functional areas:

1. Home
2. Meals
3. Alice / Dogs
4. Shopping
5. Photos
6. We're Bringing
7. Cottage Info

Authentication is required for all application content.

The primary fixed bottom navigation is:

Home · Meals · Alice · Photos · More

When the Juno feature flag is enabled:

Home · Meals · Dogs · Photos · More

"More" contains:

- Shopping
- We're Bringing
- Info
- Account / Sign out

Photos should also be prominently surfaced on Home.

---

3. Technical Stack

Use the latest stable releases available at implementation time.

Layer| Technology
Application framework| Next.js, App Router
Language| TypeScript
Styling| Tailwind CSS
Database| Neon Postgres
Database ORM| Drizzle ORM
Authentication| Neon Auth
Authentication method| Email magic link
Object storage| Railway S3-compatible private Bucket
Hosting| Railway
Image processing| Sharp or equivalent robust server-side library
Markdown rendering| "react-markdown" + "remark-gfm", or comparably simple solution
Deployment| Railway CLI
Database provisioning/config| Neon CLI / Neon API through authenticated CLI
Package manager| npm unless repository already standardizes on another
PWA| Web app manifest + standalone home-screen experience

Do not add:

- Redis
- a job queue
- a separate backend service
- a separate API server
- GraphQL
- Docker Compose
- a Railway Postgres database
- a CMS
- a dedicated authentication vendor
- runtime LLM dependencies
- WebSockets

The Next.js application is both the frontend and application server.

---

4. Infrastructure Architecture

Production consists of exactly:

Railway

One Next.js web service.

One private S3-compatible Railway Bucket for photos.

Neon

One Neon project containing:

- Postgres
- Neon Auth
- application tables
- authentication tables managed by Neon

The Railway application connects to Neon using "DATABASE_URL".

The Railway application connects to the Railway Bucket using S3-compatible credentials injected as environment variables.

Do not host any component of V1 on the NAS.

---

5. Application Time Zone

The cottage/application timezone is:

"America/Toronto"

Rules:

- Store timestamps in Postgres as "timestamptz".
- Treat stored timestamps as UTC instants.
- Render human-facing times in "America/Toronto".
- Meal dates are calendar dates and should use the SQL "date" type.
- Relative strings such as "47 minutes ago" should update appropriately on the client.

---

6. Authentication

6.1 Authentication method

Use Neon Auth with email magic-link authentication only.

No password login is needed for V1.

No OAuth is needed.

The login page contains:

- app name/logo
- email field
- "Email me a sign-in link" button

After submission:

- show a clear "Check your email" state
- magic-link click authenticates the user
- redirect authenticated user to "/"

Neon Auth manages session cookies.

Configure sessions so users remain authenticated for a long period appropriate to this application. Target approximately 90 days if Neon Auth's current configuration supports that cleanly.

The desired behaviour is:

«Log in once for the cottage trip and normally never see the login screen again.»

Do not weaken normal secure-cookie behaviour merely to extend session length.

6.2 Access allowlist

The application is private.

Create an application "members" table containing the allowed users.

An authenticated Neon Auth user must have an active matching member row by normalized lowercase email.

On first successful authentication:

1. Retrieve Neon Auth user ID and email.
2. Normalize email to lowercase.
3. Look up "members.email".
4. If found and active:
   - bind "members.auth_user_id" if not already populated.
   - allow application access.
5. If not found:
   - show an Unauthorized page.
   - provide Sign Out.
   - do not show any application data.

It is acceptable if Neon Auth technically creates an auth identity for a non-allowlisted email. Application authorization is controlled by the "members" table.

Never rely only on hiding navigation.

All mutation endpoints and server actions must validate authenticated membership server-side.

---

7. Member Model

Table: "members"

Column| Type| Requirements
id| uuid| PK, generated
email| varchar| unique, lowercase
display_name| varchar| required
auth_user_id| text| nullable, unique
is_admin| boolean| default false
is_active| boolean| default true
created_at| timestamptz| default now
updated_at| timestamptz| default now

For V1, "is_admin" does not need a full admin UI.

It may be used for exceptional moderation or setup operations.

---

8. Home Screen

Route:

"/"

The Home screen acts as the cottage dashboard/feed.

It should be useful at a glance.

8.1 Content order

Recommended order:

Header

Show:

- current day/date
- friendly cottage-app title

Do not overbuild a hero area.

Upcoming meals

Show the most relevant upcoming meals.

At minimum:

- remaining meals today
- tomorrow's meals

Each meal preview contains:

- meal type
- title
- responsible person/people
- optionally a shortened version of the restaurant-style description

Tapping navigates to Meals.

Dog status

For each enabled dog show:

- last outside
- last poop
- last fed

Example:

Alice

Outside — 8:42 PM · 47 min ago · Zak
Poop — 6:18 PM · 3 hr ago · Zuzanna
Fed — 5:32 PM · Zak

Tapping the card navigates to the dog screen.

When Juno is disabled, show only Alice.

Shopping

Show a compact summary of outstanding shopping items.

Example:

Need from town — 4 items

- Milk — Zuzanna
- Ice — Zak
- Apples — Dave

Provide a clear route to the full Shopping screen.

Recent photos

Show approximately the six most recently uploaded photos as an attractive mobile grid.

Use thumbnails/display variants, never full-resolution originals, for this feed.

Provide:

View all photos

8.2 Refresh behaviour

Do not build real-time subscriptions.

Implement a simple global refresh mechanism:

- refresh server-rendered data when the app regains focus / becomes visible
- while the app is visible, refresh approximately every 30 seconds
- after the current user performs a mutation, update immediately

This is sufficient for 1–5 users.

---

9. Meals

Route:

"/meals"

Meals are read-only in V1.

9.1 UI

Group meals chronologically by day.

Example:

Monday

Breakfast
Egg Bake

An unnecessarily sophisticated restaurant-style description.

Responsible: Zak

Lunch
Chicken Salad

...

Dinner
Chili

...

The restaurant descriptions are intentionally playful and should feel like an expensive restaurant describing ordinary cottage food.

9.2 Meal data

Table: "meals"

Column| Type| Requirements
id| uuid| PK
meal_date| date| required
meal_type| varchar| required
title| varchar| required
display_description| text| nullable
practical_notes| text| nullable
sort_order| integer| default 0
created_at| timestamptz| default now
updated_at| timestamptz| default now

Use a database constraint or application validation for known meal types such as:

- breakfast
- lunch
- dinner

Do not over-generalize this unless supplied meal data requires another type.

9.3 Responsibilities

Use a join table so a meal can have more than one responsible person.

Table: "meal_assignments"

Column| Type
meal_id| uuid FK
member_id| uuid FK

Composite PK:

"meal_id + member_id"

9.4 AI descriptions

There is no runtime AI call in V1.

The "display_description" field exists specifically to hold AI-generated restaurant prose.

During initial content preparation, generate these descriptions once and store them as seed data.

Example style:

Pulled Pork + Coleslaw

Slow-roasted pork, delicately pulled and lacquered in a smoky-sweet reduction, accompanied by crisp cabbage dressed in a sharp mustard emulsion.

Have fun with these. They should be elaborate enough that the joke is obvious.

Do not mix operational notes into "display_description".

Example:

- "display_description": restaurant prose
- "practical_notes": "Zak is bringing buns"

9.5 Future capability, not V1

Design the schema so it does not prevent future functionality where:

- users edit meals for which they are responsible
- responsible users receive a confirmation prompt one day before their meal
- they can confirm they are still handling it

Do not implement these features in V1.

---

10. Dogs

Route:

"/dogs"

Navigation label:

- "Alice" when only Alice is enabled
- "Dogs" when Juno is enabled

There is never a dog selector.

10.1 Interaction design

The screen is based around immediate actions.

For Alice show three large buttons:

LET ALICE OUT

ALICE POOPED

FED ALICE

Then a smaller:

EDIT

The main buttons record an event at the current time immediately.

Do not present a form before recording the event.

After tapping:

- write event
- update UI immediately
- show a small confirmation/toast
- display new timestamp and relative time

Example:

Last outside
8:42 PM
just now
Recorded by Zak

10.2 Juno

Juno exists in the data model from day one.

Juno is hidden behind:

"FEATURE_JUNO_ENABLED=false"

When false:

- Juno does not appear on Dogs page.
- Juno does not appear on Home.
- Juno cannot receive new events through ordinary application requests.
- bottom nav says Alice.

When true:

Render another complete section underneath Alice:

Juno

LET JUNO OUT

JUNO POOPED

FED JUNO

EDIT

Do not introduce tabs, dropdowns, switches, or selectors.

With both dogs enabled, the user simply has six large action buttons grouped under the appropriate dog headings.

Bottom navigation label becomes Dogs.

10.3 Edit behaviour

The Edit button is per dog.

It opens a mobile-friendly sheet/modal showing recent events for that dog.

At minimum show the most recent 20 events.

Each event displays:

- type
- occurred time
- person who recorded it

Allow an authenticated member to:

- correct the event time
- delete an erroneous event

It is not necessary to allow changing event type. A wrong event can be deleted and re-recorded.

All cottage members may correct dog events; this is communal operational data.

Require a confirmation before deletion.

10.4 Pet tables

Table: "pets"

Column| Type
id| uuid PK
slug| varchar unique
name| varchar
sort_order| integer
created_at| timestamptz

Seed:

- "alice", Alice, order 1
- "juno", Juno, order 2

Table: "pet_events"

Column| Type
id| uuid PK
pet_id| uuid FK
event_type| varchar
occurred_at| timestamptz
recorded_by_member_id| uuid FK
created_at| timestamptz
updated_at| timestamptz

Allowed event types:

- "outside"
- "poop"
- "fed"

Add indexes supporting:

- latest event by pet/type
- recent history by pet

---

11. Shopping

Route:

"/shopping"

Purpose:

A shared list of things people realize need to be bought while at the cottage.

11.1 Open items

Each item displays:

- item name
- requester
- time added if useful
- control to mark picked up

Example:

☐ Milk
Added by Zuzanna

☐ Ice
Added by Zak

11.2 Add item

Prominent input/button:

+ Add item

Minimum data:

- item name

"requested_by" is always derived from authenticated user.

Do not make users select themselves.

11.3 Pick up

Any authenticated member may mark any open item as picked up.

Record:

- who picked it up
- when

Move completed items to a collapsed or secondary:

Picked up

section rather than immediately deleting them.

Example:

✓ Milk
Picked up by Dave

Allow pickup status to be undone in case of accidental taps.

11.4 Delete

A member may delete an item only if they originally requested it.

An admin may delete any item if an admin capability is convenient to implement.

Normal users must not delete someone else's request.

11.5 Schema

Table: "shopping_items"

Column| Type
id| uuid PK
name| varchar
requested_by_member_id| uuid FK
created_at| timestamptz
picked_up_at| timestamptz nullable
picked_up_by_member_id| uuid FK nullable

Hard deletion is acceptable for user-requested removal.

No audit system is necessary.

---

12. We're Bringing

Route:

"/bringing"

Purpose:

Avoid duplicate communal food/cooking items by making ownership explicit before the cottage.

Examples:

Condiments

Ketchup — Zak
Mustard — Zuzanna
Mayonnaise — Dave

Cooking

Olive Oil — Zak
Aluminum Foil — Zuzanna

12.1 Behaviour

Authenticated users can add an item that they are bringing.

On creation:

"responsible_member_id = current user"

Users can:

- edit their own item
- delete their own item
- mark their own item packed
- unmark packed

Other users can view it but cannot alter it.

12.2 Schema

Table: "bringing_items"

Column| Type
id| uuid PK
name| varchar
category| varchar nullable
notes| text nullable
responsible_member_id| uuid FK
packed_at| timestamptz nullable
created_at| timestamptz
updated_at| timestamptz

Display can group by category when categories exist.

Do not require category.

---

13. Cottage Info

Routes:

"/info"

"/info/[slug]"

Cottage Info is not stored in the database.

Use Markdown files committed with the application.

Recommended structure:

"content/info/overview.md"

"content/info/getting-there.md"

"content/info/wifi-and-access.md"

"content/info/local-info.md"

The exact number of files is flexible.

One Markdown file corresponds to one page.

This is simpler than a CMS and easier to maintain than one enormous document.

13.1 Frontmatter

Each file supports frontmatter fields:

- "title"
- "order"

Optional:

- "description"

Filename is the slug.

Example conceptual metadata:

- title: Cottage
- order: 1

13.2 Content examples

Info may contain:

- cottage address
- arrival time
- departure time
- parking instructions
- Wi-Fi network
- Wi-Fi password
- door/access instructions
- garbage/recycling information
- dock information
- emergency information
- local grocery information
- anything else useful

13.3 Rendering

Render Markdown server-side.

Support normal Markdown plus GitHub-flavoured Markdown.

Do not enable arbitrary raw HTML unless there is a compelling implementation reason.

Links should be tappable.

Telephone links and map links written in Markdown should work normally.

There is no in-app editing interface in V1.

Updating Info means:

1. edit Markdown
2. commit
3. redeploy

---

14. Photos

Routes:

"/photos"

Optional detail/lightbox route:

"/photos/[id]"

The implementation may use a client-side modal instead of the detail route if simpler.

14.1 Requirements

Users can:

- select one or multiple photos from their phone
- upload them
- see everyone's uploaded photos
- view an optimized version quickly
- download the optimized version
- download the untouched original full-resolution file
- delete photos they personally uploaded

Admin may delete any photo if convenient.

No:

- comments
- likes
- albums
- tagging
- face recognition
- video
- public sharing

in V1.

14.2 Original preservation

The original uploaded file is sacred.

Do not:

- recompress it
- resize it
- alter metadata
- change its file format
- overwrite it with the display copy

Store the exact bytes selected by the user.

14.3 Storage variants

For each photo store up to three objects:

Original

Untouched upload.

Used for:

Download Original

Display

Optimized gallery image.

Target:

- longest edge approximately 2560 px
- sensible high visual quality
- WebP or JPEG

Used for:

- full-screen in-app viewing
- optionally optimized download

Thumbnail

Target:

- longest edge approximately 600 px

Used for:

- Home feed
- photo grid

Do not load original images in grid views.

14.4 Storage keys

Use stable UUID-based object keys rather than filenames alone.

Recommended shape:

"photos/{photo-id}/original/{safe-original-filename}"

"photos/{photo-id}/display.webp"

"photos/{photo-id}/thumbnail.webp"

Filename sanitization must not alter the original file's bytes.

Original filename remains stored in Postgres.

14.5 Upload flow

The Railway Bucket remains private.

Recommended flow:

1. User chooses photos.
2. Client sends metadata to authenticated endpoint.
3. Server creates photo ID and pending DB row.
4. Server returns a short-lived presigned PUT URL for original object.
5. Browser uploads original directly to Railway Bucket.
6. Client tells server upload completed.
7. Server reads original from private bucket.
8. Server generates display + thumbnail using Sharp or equivalent.
9. Server writes derived variants to bucket.
10. DB row becomes "ready".
11. Gallery displays photo.

Never proxy the original phone upload through Next.js unless necessary as a fallback.

Limit image-processing concurrency so multiple full-resolution uploads cannot exhaust the Railway service's memory.

A concurrency of roughly 1–2 image conversions per process is sufficient.

14.6 Failure behaviour

Original preservation is more important than derivative generation.

If original upload succeeds but image processing fails:

- retain original
- mark processing status "failed"
- allow retry
- never delete original merely because the thumbnail failed

HEIC/HEIF is important because phone users may upload iPhone photos.

The implementation must test at least:

- JPEG
- PNG or WebP
- an actual iPhone HEIC/HEIF image

If the default image-processing build cannot decode HEIC reliably on Railway, add an appropriate HEIC decoder/conversion dependency.

The resulting optimized display image can be WebP/JPEG; the original remains HEIC.

14.7 Download flow

Buckets remain private.

For authenticated/authorized users:

Download Original

Server produces a short-lived presigned GET URL for "original_key".

Download Optimized

Server produces a short-lived presigned GET URL for "display_key".

Suggested URL expiry:

approximately 10–15 minutes.

Do not expose permanent public bucket URLs.

14.8 Photo table

Table: "photos"

Column| Type
id| uuid PK
original_key| text
display_key| text nullable
thumbnail_key| text nullable
original_filename| text
original_content_type| varchar
original_bytes| bigint
original_width| integer nullable
original_height| integer nullable
uploaded_by_member_id| uuid FK
processing_status| varchar
processing_error| text nullable
created_at| timestamptz
updated_at| timestamptz

Allowed processing states:

- "pending"
- "processing"
- "ready"
- "failed"

Optional future field:

"captured_at"

Do not make EXIF extraction a prerequisite for V1.

14.9 Photo ordering

Default gallery ordering:

newest uploaded first.

Home feed:

latest six ready photos.

---

15. More Screen

Route:

"/more"

Display large, obvious links to:

- Photos
- We're Bringing
- Info
- Account

The More screen should not become a settings dump.

---

16. Account

Route:

"/account"

Show:

- display name
- email
- Sign Out

No password management is required because login is magic-link based.

No profile editing is required in V1.

---

17. Database Relationships

Application tables:

- "members"
- "meals"
- "meal_assignments"
- "shopping_items"
- "bringing_items"
- "pets"
- "pet_events"
- "photos"

Authentication tables are owned by Neon Auth and must not be manually recreated.

All attribution references should point to "members.id", not directly throughout the application to raw Neon Auth user IDs.

The "members.auth_user_id" field is the bridge between application identity and Neon Auth.

Use foreign-key constraints.

Use sensible cascading rules, but do not cascade-delete historical records merely because a member becomes inactive.

Normally members should be deactivated rather than deleted.

---

18. Indexes

At minimum add indexes for:

Members

- unique email
- unique non-null auth user ID

Meals

- meal date
- meal date + meal type

Shopping

- "picked_up_at"
- "created_at"

Pet events

- "pet_id + event_type + occurred_at DESC"
- "pet_id + occurred_at DESC"

Photos

- "created_at DESC"
- "processing_status + created_at DESC"

Bringing

- responsible member
- category if useful

Do not optimize beyond obvious query patterns.

---

19. Data Validation

Use server-side validation for every mutation.

A lightweight schema validator such as Zod is appropriate.

Validate:

- IDs
- required strings
- string lengths
- allowed event types
- image MIME/type where applicable
- ownership
- membership

Trim user-entered shopping and bringing names.

Reject empty strings.

Use reasonable maximum string lengths rather than unlimited input.

---

20. Security Rules

Every application route except authentication entry/callback routes requires authentication.

Every mutation requires an active member.

Never trust:

- member IDs submitted by browser
- uploader IDs
- requester IDs
- responsible-user IDs
- recorded-by IDs

Derive these from authenticated session whenever ownership means "current user."

Object-storage credentials must exist server-side only.

Never expose S3 access key or secret key to browser.

Only presigned object URLs may reach the browser.

Presigned URL endpoints must themselves require active membership.

A user may download any cottage photo.

A user may delete only their own photo unless admin.

Shopping deletion is requester-only.

Bringing modifications are responsible-user-only.

Dog events are communal and editable by all members.

Meals and Info are read-only to normal users in V1.

---

21. UI / UX Requirements

Design mobile first.

Primary target widths:

approximately 360–430 px phones.

Desktop/tablet can simply use a centered content column.

Recommended maximum content width:

approximately 700–800 px.

General requirements

- minimum comfortable tap target around 44 px
- fixed bottom navigation
- account for iOS/Android safe-area bottom inset
- obvious pressed/loading states
- prevent accidental duplicate submissions
- skeleton/loading indicators where useful
- friendly empty states
- no tiny desktop-oriented controls
- avoid horizontal scrolling
- make buttons easy to operate one-handed

The application should feel playful and cottage-specific rather than like enterprise software.

Do not over-design.

---

22. Dog UX Details

Dog actions are some of the highest-frequency actions in the application.

They should require exactly one intentional tap.

Do not require:

- selecting pet
- selecting event type from a dropdown
- choosing current time
- submitting a form

The button itself carries all that context.

A successful press should feel immediate.

If practical, optimistically show the new time and reconcile with server response.

---

23. Shopping UX Details

Adding an item should be nearly as easy.

Ideal flow:

1. Tap Add Item / focus input.
2. Type "milk".
3. Submit.
4. Input clears.
5. Milk appears immediately with user's name.

Do not open a multi-field form for this.

---

24. Photo UX Details

The upload button should invoke the native phone photo picker.

Allow multiple selection.

During upload show per-photo state such as:

- uploading original
- processing
- done
- failed / retry

The user should not have to remain on a special blocking screen while photos process.

If simple to implement, uploads can continue while the Photos page remains open.

Do not build resumable multipart uploads in V1.

---

25. PWA Requirements

Make the app installable to a phone home screen.

Provide:

- web app manifest
- application name
- short name
- app icons
- standalone display mode
- theme/background metadata

Ensure fixed navigation works correctly in standalone mode and respects safe areas.

Offline data support is not required.

Do not add a complex offline synchronization system.

If a service worker is required by the chosen PWA implementation, keep it minimal.

---

26. Static Content / Seed Strategy

Maintain initial structured content in an idempotent database seed process.

Seed at minimum:

- members
- pets
- meals
- meal assignments

Info content lives separately as Markdown.

Do not seed:

- shopping history
- dog events
- photos
- bringing activity

unless sample development data is useful locally.

Production seed must be idempotent.

Re-running it must not duplicate meals, users, assignments, or pets.

Use stable natural keys where sensible:

- member email
- pet slug
- meal date + meal type

If the meal schedule legitimately contains two meals with the same meal type/date, introduce an explicit stable seed key.

---

27. Initial Content Inputs

Before final production seeding, the operator will supply:

Members

For each person:

- display name
- email

Meals

For each meal:

- date
- meal type
- title
- responsible person/people
- optional practical notes

The implementation agent should generate a playful restaurant-style "display_description" for each supplied meal if one has not already been supplied.

This generation is a development/content-generation task, not an application API call.

Cottage Info

Markdown content for relevant pages.

The app must still deploy successfully if some content is initially incomplete.

---

28. Environment Variables

Expected application configuration includes:

Variable| Purpose
"DATABASE_URL"| Neon production Postgres connection
"NEON_AUTH_BASE_URL"| Neon Auth endpoint
"NEON_AUTH_COOKIE_SECRET"| cookie/session signing secret
"APP_URL"| deployed Railway public URL
"APP_TIMEZONE"| "America/Toronto"
"FEATURE_JUNO_ENABLED"| "false" initially
S3 endpoint variable| Railway Bucket
S3 bucket-name variable| Railway Bucket
S3 access-key variable| Railway Bucket
S3 secret-key variable| Railway Bucket
S3 region variable| Railway Bucket

Use the actual variable names emitted/recommended by the current Railway Bucket CLI/credentials rather than unnecessarily renaming them.

Do not commit secrets.

Commit an ".env.example" containing variable names and comments but no credentials.

Generate "NEON_AUTH_COOKIE_SECRET" securely and keep it stable across deployments.

---

29. Feature Flags

For V1, feature flags do not need a database or third-party system.

Implement:

"FEATURE_JUNO_ENABLED"

as an environment variable.

Parse explicit truthy values safely.

Default must be false.

Centralize flag access in one application module rather than reading "process.env" throughout components.

Example conceptual API:

"features.junoEnabled"

Server-side authorization must also respect the flag.

Do not rely only on conditional rendering.

---

30. Application Routes

Expected route map:

Route| Purpose
"/"| Home
"/meals"| meal schedule
"/dogs"| Alice / Dogs actions
"/shopping"| shopping list
"/more"| secondary navigation
"/photos"| shared photos
"/bringing"| communal items
"/info"| Info page index
"/info/[slug]"| Markdown info page
"/account"| user/account
"/auth/sign-in"| magic-link login
"/auth/check-email"| post-submit state
Neon Auth handler route| auth callbacks/API
"/api/health"| deployment health check

Additional "/api/..." route handlers are appropriate for:

- photo upload intents
- photo upload completion/processing
- photo downloads

Use server actions for straightforward authenticated CRUD where they simplify implementation.

Do not create REST endpoints purely for architectural symmetry.

---

31. Recommended Code Organization

Keep organization obvious to a coding agent and future maintainer.

Suggested conceptual areas:

- "app/" — routes/pages/layout
- "components/" — reusable UI
- "components/navigation/"
- "components/dogs/"
- "components/photos/"
- "db/" — Drizzle connection/schema
- "db/migrations/"
- "db/seed/"
- "lib/auth/"
- "lib/storage/"
- "lib/features/"
- "lib/time/"
- "lib/validation/"
- "content/info/"
- "public/" — PWA icons/assets

Do not create an elaborate domain-driven folder hierarchy for eight tables.

---

32. Error Handling

Provide useful errors rather than silent failure.

For normal user actions:

- display short toast/message
- keep user's input when appropriate
- allow retry

Examples:

Couldn't add milk. Try again.

Photo uploaded, but the preview couldn't be created. Retry processing.

Couldn't record Alice's outing.

Log server-side details without showing stack traces to users.

---

33. Image Processing

Use "sharp" or another production-appropriate image library.

Derived variants should:

- auto-orient according to source metadata
- resize without upscaling small photos
- preserve aspect ratio
- use reasonable compression quality
- strip unnecessary metadata from derivatives if convenient

The original object remains completely untouched.

Suggested targets:

Display

- max dimension: 2560 px
- WebP quality: roughly 82–88

Thumbnail

- max dimension: 640 px
- WebP quality: roughly 75–82

These are implementation defaults, not sacred constants.

---

34. Railway Provisioning

The coding agent is expected to provision and deploy the Railway infrastructure itself using authenticated Railway CLI access.

Target project:

one Railway project dedicated to this cottage application.

Expected operations:

1. Verify Railway authentication.
2. Create or select Railway project.
3. Create Next.js service.
4. Create a private Railway storage bucket.
5. Select a geographically sensible region for the application's users; prefer eastern North America where available.
6. Inject bucket credentials into app service.
7. Configure application environment variables.
8. Deploy application.
9. Generate Railway-provided public domain.
10. Update "APP_URL".
11. Configure health check.
12. Verify successful deployment and logs.

Railway currently supports direct project creation with "railway init", object buckets through "railway bucket", variables through "railway variable", domains through "railway domain", and source deployment through "railway up". Use the installed CLI's "--help" if command syntax differs.

Do not create a Railway database.

---

35. Railway Deployment Configuration

Commit Railway config-as-code if useful.

Configure database migration as a Railway pre-deploy command.

For Drizzle this should invoke the repository's migration script, for example conceptually:

{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "preDeployCommand": ["npm run db:migrate"],
    "healthcheckPath": "/api/health"
  }
}

The exact start command may use Railway/Railpack's normal Next.js detection unless a custom command is needed.

Do not run production seed automatically on every deployment unless the seed is rigorously idempotent and there is a clear benefit.

Prefer explicit initial:

"npm run db:seed"

after migrations.

---

36. Neon Provisioning

The coding agent is expected to provision Neon using authenticated Neon CLI/API tooling.

Target:

one dedicated Neon project for this application.

Use production branch for deployed application.

Expected operations:

1. Verify Neon authentication.
2. Create or select project.
3. Obtain production connection string.
4. Provision/enable Neon Auth.
5. Enable Magic Link authentication.
6. Configure trusted application origin using Railway public domain.
7. Obtain Neon Auth base URL.
8. Configure required auth settings.
9. Generate/configure stable cookie secret in Railway.
10. Run Drizzle migrations.
11. Seed production data.
12. verify member lookup and login.

Use the current Neon CLI rather than assuming old "neonctl" syntax.

If a required operation lacks a convenient dedicated command, use the authenticated Neon CLI API passthrough.

The current CLI exposes the Neon platform API and can enumerate available routes. The agent should discover the current Auth endpoint/configuration rather than falling back to manual browser setup unnecessarily.

---

37. Auth Deployment Order

Because trusted auth origins depend on the eventual Railway domain, a two-phase deployment is acceptable.

Suggested sequence:

1. Provision Neon/Postgres/Auth.
2. Provision Railway app + bucket.
3. Deploy initial app.
4. Generate Railway domain.
5. Configure Neon Auth trusted origin / callback URL.
6. Set "APP_URL".
7. Redeploy/restart if needed.
8. Test magic-link login end-to-end.

The agent should perform the full loop rather than stopping after infrastructure exists.

---

38. Database Migration Workflow

Use committed Drizzle migrations.

Development:

- modify Drizzle schema
- generate migration
- run against development database/branch
- test

Production:

Railway pre-deploy executes migration before new application starts.

If migration fails, deployment should fail rather than launch code against an incompatible schema.

Do not use ad-hoc "CREATE TABLE" statements outside migration history for production.

---

39. Development / Production Separation

Keep V1 simple.

At minimum do not develop destructively against production data.

Neon branches make a development branch appropriate.

Preferred:

- Neon "production" branch → Railway production
- Neon "development" branch → local development

A second Railway staging deployment is not necessary for V1 unless easily available.

Photo development can use a separate Railway environment/bucket if convenient.

Never point automated tests that delete data at the production database or production bucket.

---

40. Testing Requirements

Automated coverage should focus on business rules rather than chasing high percentage coverage.

At minimum test:

Authorization

- unauthenticated user cannot access app
- authenticated but non-member cannot access app
- inactive member cannot access app

Shopping

- anyone can add
- requester attribution comes from session
- any member can mark picked up
- pickup records current member
- requester can delete
- different normal member cannot delete

Bringing

- current user becomes responsible user
- responsible user can edit/delete
- another member cannot

Dogs

- event records current time/current member
- Alice always enabled
- Juno rejected when flag false
- Juno available when flag true
- member can correct/delete event

Photos

- only members can request upload URL
- upload keys cannot be arbitrarily chosen by client
- user can download any photo
- user can delete own
- different normal user cannot delete
- original survives derivative-processing failure

Meals

- read-only user interface
- correct chronological order

Info

- Markdown files render in configured order

---

41. Manual Mobile Acceptance Test

Before declaring V1 complete, test on at least:

- one iPhone/Safari or installed iOS PWA
- one Android/Chrome device if available

Verify:

1. Magic-link login.
2. Session persists after closing/reopening browser.
3. Add to home screen.
4. Bottom nav safe-area behaviour.
5. Record Alice Outside.
6. Record Alice Poop.
7. Record Alice Fed.
8. Correct an Alice event.
9. Add shopping item.
10. Another account marks it picked up.
11. Add Bringing item.
12. Upload multiple phone photos.
13. Gallery loads thumbnails quickly.
14. Open photo.
15. Download optimized photo.
16. Download original and confirm original resolution.
17. Upload/test HEIC from an iPhone.
18. View all meal days.
19. View Markdown Info.
20. Enable Juno feature flag in a non-production/test context and verify six dog action buttons appear with no selector.

---

42. Performance Expectations

This application serves only a handful of users.

Prioritize perceived speed.

Targets:

- normal navigation feels immediate on broadband
- simple mutations usually complete in under approximately one second
- gallery uses thumbnails
- full original files load only when explicitly downloaded
- image conversion may take longer but must show visible progress/state

Do not build caching layers prematurely.

Use normal Next.js rendering/caching carefully so authenticated/shared state does not become stale incorrectly.

---

43. Home Feed Query Strategy

Do not create a generic activity-feed event system.

Home can query the source tables directly.

Home data can consist of parallel queries for:

- upcoming meals
- latest pet event of each type per enabled dog
- open shopping items
- latest ready photos

Compose results at render time.

This is intentionally simple.

---

44. Future Features Explicitly Deferred

Do not implement these in V1:

- editing meal schedule
- meal-owner confirmation notifications
- runtime AI generation
- push notifications
- native application
- offline data sync
- comments on photos
- photo likes
- video uploads
- photo albums
- chat
- user invitations from UI
- user-management admin panel
- multi-cottage support
- multi-tenant architecture
- generic activity feeds
- email notifications other than authentication
- NAS photo synchronization
- automatic NAS archival
- OAuth/social login
- password login
- dog reminders
- shopping notifications

Schema choices should avoid obviously blocking reasonable future development, but no V1 code should be written merely to anticipate these.

---

45. Definition of Done

V1 is complete only when all of the following are true:

Infrastructure

- Railway project exists.
- Next.js service is deployed.
- Railway private photo bucket exists.
- Neon project exists.
- Neon Auth is enabled.
- production database migrations have run.
- production seed data has run.
- public HTTPS Railway URL works.

Authentication

- allowlisted user receives magic link.
- login succeeds.
- session survives app/browser restart.
- unauthorized email cannot access cottage content.

Home

- upcoming meals visible.
- Alice status visible.
- shopping summary visible.
- recent photos visible.

Meals

- complete supplied schedule visible.
- responsibility visible.
- AI-generated restaurant descriptions visible.
- no meal editing exposed.

Dogs

- Alice has exactly three primary action buttons plus Edit.
- buttons write correct user/time.
- recent events editable.
- Juno exists in schema/data.
- Juno hidden when flag false.
- enabling flag adds Juno's three buttons plus Edit without introducing a selector.

Shopping

- add item works.
- requester shown.
- any member can mark picked up.
- picker shown.
- user can delete own item.
- user cannot delete someone else's.

Photos

- multi-photo phone upload works.
- untouched originals are preserved.
- optimized display copies generated.
- thumbnails generated.
- shared gallery works.
- original download works.
- optimized download works.
- HEIC path tested.
- private bucket is not publicly exposed.

Bringing

- users can add their own responsibility.
- owner shown.
- packed state works.
- users can edit/delete their own entries.

Info

- multiple Markdown files render as individual pages.
- address/arrival/departure/etc. can be represented.
- navigation/order works.

Mobile

- bottom navigation works comfortably on phone.
- PWA installs to home screen.
- application is usable without zooming or desktop UI conventions.

Operational

- "/api/health" succeeds.
- Railway logs show no persistent errors.
- migrations are wired to deployment.
- ".env.example" exists.
- README explains local development, seed, deployment, feature flag, and major architecture.

---

46. Agent Execution Instruction

The coding agent receiving this specification should treat itself as responsible for the full delivery, not merely source-code generation.

It should:

1. inspect the existing repository if one exists
2. scaffold the application if required
3. implement the full V1
4. run lint/typecheck/tests
5. provision Neon
6. provision Neon Auth
7. provision Railway
8. provision Railway Bucket
9. configure environment variables
10. run migrations
11. seed content
12. deploy
13. configure auth origin against deployed domain
14. test production
15. fix deployment/runtime issues
16. verify acceptance criteria
17. report final production URL and any operator inputs still required

The agent should use its Railway and Neon CLI access proactively.

It should not ask the operator to perform routine console setup that can be completed through those authenticated tools.

If command syntax has changed, inspect:

- "railway --help"
- relevant Railway subcommand help
- current Neon CLI help
- "neon api --list"

rather than guessing deprecated syntax.

Do not stop at "build succeeded." Verify the running application.

---

47. Operator Inputs That May Still Be Needed

The infrastructure and application can be built without these, but final real-world content requires:

- final app name, if different from working title
- names + email addresses of the 1–5 allowed members
- final meal schedule
- meal responsibility assignments
- cottage Info Markdown content
- optional custom PWA icon/artwork

Missing content should not prevent infrastructure provisioning or application deployment.

Use clear placeholder/seed data where necessary and make replacement straightforward.

---

48. Guiding Principle

Whenever there are two implementation choices, prefer the one that:

1. has fewer services,
2. has less custom infrastructure,
3. has less user friction,
4. is easier for a future coding agent to understand,
5. still protects the original photos and private cottage data.

This is a cottage app for a handful of people.

It should feel polished.

It should not feel engineered for a Series B startup.
