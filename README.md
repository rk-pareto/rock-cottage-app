# Rock Cottage

A small, private web app for the five of us at The Rock Cut Cottage in Port
Carling — **August 31 to September 6, 2026**.

Meals, Alice, the shopping list, memories, who's bringing what, and the
cottage info you always need and can never find. Mobile first; installs to a phone home
screen.

**Production:** https://web-production-7f9f0.up.railway.app

---

## What's in it

| Screen | Route | What it does |
|---|---|---|
| Home | `/` | Feed posts from anyone, upcoming meals, your meal confirmations, Alice's status, shopping summary, recent memories |
| Meals | `/meals` | The whole week with deeply pretentious descriptions; only the cook can rename their own |
| Alice | `/dogs` | Three big buttons: out, pooped, fed. One tap, recorded under your name |
| Shopping | `/shopping` | Add something, anyone can mark it picked up |
| Memories | `/memories` | Everyone's photos and videos; originals preserved exactly |
| Public Goods | `/bringing` | Claim the ketchup so we don't end up with four |
| Cottage Info | `/info` | Address, wifi, emergency — Markdown files, not a database |
| Account | `/account` | Your details and sign out |

Sign-in is a magic link. There are no passwords. Log in once and you should
never see the login screen again all week.

---

## Architecture

One Next.js app is both the frontend and the server. That's the whole system.

```
Phone ──► Railway (Next.js 16, App Router)
             │
             ├─► Neon Postgres        application tables, via Drizzle
             ├─► Neon Auth            magic link, Better Auth under the hood
             └─► Railway Bucket       private S3, originals + derivatives
```

- **No** Redis, job queue, separate API server, CMS, or WebSockets. The one
  runtime AI call is Ollama's cloud API, used only to regenerate a meal's
  fancy description after a rename — see [AI meal descriptions](#ai-meal-descriptions).
- Home refreshes when the app regains focus and every 30s while visible. No
  subscriptions — with five users that's plenty.
- All times render in `America/Toronto` regardless of where the server or the
  phone thinks it is. Meal dates are SQL `date`; everything else is `timestamptz`.
- Meals are served at 8:00, 12:00 and 17:00 cottage time (`MEAL_TIMES` in
  `lib/time`). 22 hours before each one, whoever is cooking gets a tile on Home
  asking them to confirm it or type a new name — which lands the ask just after
  the previous day's equivalent meal. Renaming clears the seeded description and
  photo immediately, since they describe the old dish, then regenerates the
  description for the new title in the background (blank if regeneration is
  unconfigured or fails — never blocks the rename). Saving an edit *is* the
  confirmation — there is no second step. Confirmed meals carry a badge on
  Home and `/meals`.
- Many meals have two cooks, and both get the same prompt. Either may answer and
  only the first answer counts: the write is conditional on `confirmed_at` still
  being null, so simultaneous taps resolve to one winner and the other cook is
  told who got there first.
- The meal seed key is `(meal_date, meal_type)` — one meal per slot per day. It
  deliberately excludes the title so a re-seed updates a renamed meal instead of
  inserting the original alongside it. A re-seed restores the authored title,
  description and photo, and clears the confirmation when it actually changed
  the title.

### Layout

```
app/(app)/        authenticated screens; the layout enforces membership
app/auth/         sign-in, check-email, magic-link callback
app/api/          auth proxy, health, memory upload/download
db/               Drizzle schema, migrations, idempotent seed
lib/auth/         membership guard — the allowlist lives here
lib/storage/      S3 client + Sharp image processing
lib/features/     feature flags (Juno)
content/info/     cottage info, one Markdown file per page
tests/            business-rule tests
```

---

## Local development

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run db:migrate
npm run db:seed
npm run dev
```

Point `.env.local` at the Neon **development** branch — never production.

```bash
# connection string for the development branch
neon connection-string development --project-id noisy-wave-60475951

# the auth base URL for that branch
neon neon-auth status --project-id noisy-wave-60475951 --branch development
```

`NEON_AUTH_COOKIE_SECRET` is any 32+ character random string. Keep it stable —
changing it signs everyone out.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Localhost origins are allowed on the development branch and **disabled** on
production, so magic links can't be redirected off-site.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed members, pets, meals, assignments (idempotent) |
| `npm test` | Business-rule tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Signing in

A magic link takes four hops, and the third one is easy to get wrong:

```
browser  ──POST /api/auth/sign-in/magic-link──►  our proxy ──►  Neon Auth
                                                                    │ email
tap the link  ──────────────────────────────────────────────►  Neon Auth
                                                                    │ 302
browser  ◄──  /auth/callback?neon_auth_session_verifier=…  ─────────┘
         ──►  our route exchanges the verifier for a session cookie ──► /
```

The emailed link points at **Neon's** host, so the cookie Neon sets there is
useless to us. What crosses back is a one-time verifier on the callback URL,
and `app/auth/callback/route.ts` trades it for a session cookie on our own
domain. Without that exchange a perfectly valid link just lands you back on the
sign-in screen, forever.

Both the link and its callback are built from the request `Origin`, which is
why the browser — not the server — posts the sign-in request, and why
`callbackURL` stays relative (an absolute one is rejected as
`INVALID_CALLBACK_URL`). Links last 30 minutes and work once; a link a mail
client opened first comes back as `?error=INVALID_TOKEN`, which the sign-in
page explains.

---

## The allowlist

Authentication and authorization are separate on purpose. Neon Auth will mint
an identity for any email that receives a link; **access is decided by the
`members` table**. An authenticated user with no active matching row (by
lowercased email) sees an Unauthorized page and no cottage data at all.

To add someone, add them to `MEMBERS` in `db/seed/data.ts` and re-seed. To
remove someone, set `is_active = false` — don't delete them, or their shopping
items and dog events lose their attribution.

Every mutation re-checks membership server-side. Ownership (`requested_by`,
`uploaded_by`, `responsible_member_id`, `recorded_by`) always comes from the
session, never from the browser.

---

## Memories

Photos and videos share one screen, one table (`media`) and one delete rule.
The original upload is sacred either way: it is stored exactly as the phone
sent it — never recompressed, resized, or re-encoded. Everything the app shows
or shares is a derived copy alongside it.

1. Client asks `/api/memories/upload-intent` for a presigned PUT.
2. Browser uploads the original **straight to the bucket**, not through Next.
   That PUT is cross-origin and carries a real `content-type`, so the browser
   preflights it — see [Bucket CORS](#bucket-cors) below.
3. `/api/memories/[id]/complete` reads it back and generates:
   - `display.webp` — longest edge 2560px
   - `thumbnail.webp` — longest edge 640px
4. Row becomes `ready`.

If processing fails the original is kept and the row is marked `failed` — a
missing thumbnail never costs you the photo.

**HEIC**: sharp's prebuilt libvips reads the HEIF container but has no HEVC
codec, so `metadata()` succeeds while decoding fails with `bad seek`. Since
iPhones default to HEIC, `lib/storage/process.ts` falls back to `heic-decode`
(libheif via WASM) and hands sharp raw pixels. Covered by
`tests/images.test.ts` against a real HEIC file.

### Videos

The **original is never touched** — but a clip also gets a server-made
*playback copy*, exactly as a photo gets a display copy. iPhones record HEVC,
which doesn't play on Chrome or Android, and a 4K original is far too big for
the share sheet; the playback copy fixes both.

The tile still comes from the browser: before uploading it reads the clip's
dimensions and length and draws a frame to a canvas. That JPEG is PUT alongside
the clip and becomes the poster, the thumbnail and the tile in the home feed.
If the browser can't decode the clip at all it uploads with no poster and shows
a placeholder tile — the clip itself is intact either way.

- Up to 512 MB per clip (photos stay at 60 MB); uploads show a real progress bar.
- `/api/memories/[id]/view` redirects a clip straight at the bucket so S3 serves
  the range requests that scrubbing and buffering depend on.
- Share sends the playback copy, and is hidden when even that is above 64 MB —
  past which a phone can't hold the file in memory and Download is the honest
  option. Download always offers the original (`?variant=playback` for the MP4).

#### The playback copy

`lib/storage/transcode.ts` is an in-process queue, **strictly one encode at a
time** so a transcode can't starve request serving. ffmpeg and ffprobe come
from the `ffmpeg-static` / `ffprobe-static` packages, so there is no Dockerfile
or Nixpacks change (`FFMPEG_PATH` / `FFPROBE_PATH` override them).

- Output: MP4, `libx264 -preset veryfast -crf 23 -pix_fmt yuv420p`, longest edge
  capped at 1920, `aac 128k` (an existing AAC track ≤160k is copied through),
  `-movflags +faststart`. Rotation is applied by ffmpeg, so a portrait clip
  stays portrait.
- **Skipped when pointless**: an original that is already H.264-in-MP4, ≤1080p
  and under ~8 Mbps is marked ready with no playback object — "the original is
  already fine". A `.mov` is never skipped; that's the case this exists for.
- Tracked in `playback_status` (`pending | processing | ready | failed`),
  separate from `processing_status`: a clip is visible and playable the moment
  its poster is handled, and this lands afterwards. A failure is invisible in
  the UI by design — the original still plays wherever it can, and the reason
  is in `playback_error`.
- Triggered by `/api/memories/[id]/complete` via `after()` (nothing waits on the
  encode) and by a boot sweep in `instrumentation.ts`, which re-queues every
  `pending`/`processing` clip oldest-first. That sweep is both the backfill for
  older videos and the crash recovery for a deploy that interrupted a job — the
  queue is in memory, so a job is never lost, only re-run.
- Retry a `failed` pass by setting `playback_status` back to `pending` and
  restarting.

The argument builder and the skip rule are pure and covered by
`tests/video.test.ts`. An end-to-end encode is opt-in:

```bash
RUN_TRANSCODE_SMOKE=1 npx vitest run tests/transcode.smoke.test.ts
```

The bucket is private. Only short-lived presigned URLs ever reach the browser,
and credentials are server-side only. To verify that end to end:

```bash
RUN_BUCKET_SMOKE=1 npx vitest run tests/bucket.smoke.test.ts
```

It writes under `memories/_smoketest-*`, asserts the original round-trips
byte-identically, and asserts an unsigned URL is rejected.

New objects land under `memories/`; anything uploaded before the rename still
lives under `photos/` and is found by the key stored on its row.

### Bucket CORS

A new bucket has no CORS rules, and a bucket with no CORS rules answers the
uploader's preflight with `403 AccessForbidden` — every upload then fails
before a byte moves, while `/upload-intent` still returns a healthy 200. Each
environment gets its own bucket, so this is a one-time step per environment:

```bash
railway run npm run bucket:cors
```

`scripts/bucket-cors.ts` allows `APP_URL`, `RAILWAY_PUBLIC_DOMAIN` and
`localhost:3000`; it replaces the whole policy, so re-run it after adding a
domain.

Once a custom domain is attached, every Railway variable reports *it* — the
generated `*.up.railway.app` domain keeps serving while appearing in no
variable at all. Any second serving domain therefore has to be named in
`BUCKET_CORS_EXTRA_ORIGINS` (comma-separated) or it silently loses the ability
to upload. Check what a bucket currently allows with:

```bash
curl -si -X OPTIONS "https://$BUCKET_NAME.t3.storageapi.dev/probe" \
  -H "Origin: https://cottage.krook.io" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
```

---

## Feed posts

Anyone can pin a short message — text, a photo/video, or both — to the top of
everyone's Home feed (`feed_posts`). Dismissing one only hides it for the
member who dismissed it (`feed_post_dismissals`); everyone else still sees it
until they each do the same. The author, or an admin, can instead remove a
post for everyone.

An attachment goes through the exact upload pipeline `/memories` uses
(`lib/uploads/browser.ts`, shared with the Memories screen) before the post is
even submitted, so it's an ordinary `media` row — it shows up in `/memories`
regardless of whether the post itself survives.

---

## AI meal descriptions

`display_description` was always meant to hold AI-generated restaurant prose
(spec §9.4); V1 shipped with hand-authored seed descriptions and no runtime
call. Renaming a meal now regenerates one, via
[Ollama's cloud API](https://docs.ollama.com/cloud):

```bash
OLLAMA_API_KEY="…"                    # ollama.com/settings/keys
OLLAMA_MODEL="glm-5.3-flash:cloud"    # default; override to try another model
```

`lib/ai/mealDescription.ts` is the whole integration: `isAiConfigured()` gates
it off entirely when `OLLAMA_API_KEY` is unset (renaming then just clears the
description, exactly as before this existed), and `generateMealDescription`
never throws — a timeout, a non-2xx response, or a malformed reply all just
leave the description blank rather than fail the rename. The call itself runs
in `after()` in `app/(app)/meals/actions.ts`, off the response path, and is
guarded to only write back if the meal's title hasn't changed again since.

---

## Feature flag: Juno

Juno exists in the schema and seed from day one but is hidden.

```bash
FEATURE_JUNO_ENABLED=true
```

Turning it on adds a second section with three more buttons and switches the
nav label from "Alice" to "Dogs". There is never a dog selector.

The flag is enforced **server-side** — with it off, a crafted request to record
a Juno event is rejected, not merely hidden. Read flags only through
`lib/features`, never `process.env` in a component.

---

## Deployment

Railway builds from the local directory. Migrations run as a pre-deploy step,
so a failed migration fails the deploy instead of starting the app against an
incompatible schema.

```bash
npm run lint && npm test && npm run build   # check before shipping
railway up --service web --environment production --ci
```

Config lives in `railway.json` (`preDeployCommand`, `healthcheckPath`).

The seed is **not** run automatically. Run it deliberately:

```bash
DATABASE_URL="$(neon connection-string main --project-id noisy-wave-60475951 --pooled)" npm run db:seed
```

### Updating cottage info

Info pages are Markdown, not database rows. Edit, commit, redeploy:

1. Edit a file in `content/info/` (frontmatter: `title`, `order`, optional `description`)
2. `railway up --service web --environment production --ci`

The filename is the slug.

---

## Infrastructure

| | |
|---|---|
| Neon project | `rock-cottage` (`noisy-wave-60475951`), `aws-us-east-1` |
| Neon branches | `main` → production · `development` → local |
| Railway project | `rock-cottage`, service `web` |
| Bucket | `cottage-photos`, region `iad`, private |
| Health check | `/api/health` |

Auth is configured for magic link only — email/password sign-in is **disabled**
on both branches, and the only trusted redirect domain on production is the
Railway URL.
