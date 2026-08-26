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
| Home | `/` | Upcoming meals, your meal confirmations, Alice's status, shopping summary, recent memories |
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

- **No** Redis, job queue, separate API server, CMS, WebSockets, or runtime AI.
- Home refreshes when the app regains focus and every 30s while visible. No
  subscriptions — with five users that's plenty.
- All times render in `America/Toronto` regardless of where the server or the
  phone thinks it is. Meal dates are SQL `date`; everything else is `timestamptz`.
- Meals are served at 8:00, 12:00 and 17:00 cottage time (`MEAL_TIMES` in
  `lib/time`). 22 hours before each one, whoever is cooking gets a tile on Home
  asking them to confirm it or type a new name — which lands the ask just after
  the previous day's equivalent meal. Renaming clears the seeded description and
  photo, since they describe the old dish; regenerating them needs runtime AI,
  which the app still doesn't have. Saving an edit *is* the confirmation — there
  is no second step. Confirmed meals carry a badge on Home and `/meals`.
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
sent it — never recompressed, resized, or re-encoded.

1. Client asks `/api/memories/upload-intent` for a presigned PUT.
2. Browser uploads the original **straight to the bucket**, not through Next.
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

Clips are stored and played back exactly as recorded — no transcoding, so
**there is no ffmpeg in the deploy**. Instead the browser does the one thing a
server would have needed a video decoder for: before uploading, it reads the
clip's dimensions and length and draws a frame to a canvas. That JPEG is PUT
alongside the clip and becomes the poster, the thumbnail and the tile in the
home feed — the server only ever processes a still.

- Up to 512 MB per clip (photos stay at 60 MB); uploads show a real progress bar.
- `/api/memories/[id]/view` redirects a clip straight at the bucket so S3 serves
  the range requests that scrubbing and buffering depend on.
- Share hands the OS the clip untouched, and is hidden above 64 MB — past that
  a phone can't hold the file in memory and Download is the honest option.
- If the browser can't decode the clip (an HEVC `.mov` opened in Chrome, say),
  it uploads with no poster and shows a placeholder tile. The clip is intact and
  still plays wherever its codec is supported.

The bucket is private. Only short-lived presigned URLs ever reach the browser,
and credentials are server-side only. To verify that end to end:

```bash
RUN_BUCKET_SMOKE=1 npx vitest run tests/bucket.smoke.test.ts
```

It writes under `memories/_smoketest-*`, asserts the original round-trips
byte-identically, and asserts an unsigned URL is rejected.

New objects land under `memories/`; anything uploaded before the rename still
lives under `photos/` and is found by the key stored on its row.

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
