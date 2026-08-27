# Video transcoding — spec

Status: implemented (2026-08-27) — see README "Videos → The playback copy"
Depends on: nothing. Enables: autoplaying muted video in the lightbox pager (separate work).

## 1. Why

Videos are currently stored and played back as the exact bytes the phone
uploaded (spec §14 principle: original preservation above all). Two problems
follow:

1. **Compatibility.** iPhones record HEVC by default. An HEVC `.mov` plays for
   the uploader but not for a family member on Chrome or Android — today those
   clips simply don't play, with no error the viewer can act on.
2. **Size.** Originals are large (4K60 HEVC ≈ 50 MB/min; older-phone 4K H.264
   is larger). That makes in-app playback slow to start, burns cellular data,
   and keeps most videos over the 64 MB share ceiling
   (`MAX_SHAREABLE_VIDEO_BYTES`), so the Share button hides.

The fix mirrors what photos already do: keep the original untouched, add a
server-made **playback copy** — capped-1080p H.264/AAC MP4 — and serve that
copy for in-app viewing and sharing. Downloads keep offering the original.

## 2. Non-goals

- No adaptive streaming (HLS/DASH), no external transcoding service. One MP4.
- No change to photo processing.
- No re-encoding on the client before upload.
- No UI redesign — the grid, lightbox, and upload flow look the same. The only
  visible effects are "videos now play for everyone", faster starts, and Share
  appearing on more clips.

## 3. Output format

One profile, chosen for universal playback:

| Setting | Value | Why |
| --- | --- | --- |
| Container | MP4, `-movflags +faststart` | moov atom up front so playback starts before the file finishes downloading; range-request friendly |
| Video | `libx264 -preset veryfast -crf 23 -pix_fmt yuv420p` | plays everywhere, decent quality/size, encodes ~real-time on one Railway vCPU |
| Scale | cap longest edge at 1920, preserve aspect, force even dimensions | phone 4K → 1080p; never upscale |
| Rotation | let ffmpeg autorotate from metadata | portrait clips stay portrait |
| Audio | `aac -b:a 128k` | universal; copy-through if source is already AAC ≤ 160k |

**Skip when pointless:** ffprobe the original first. If it is already
H.264-in-MP4, ≤ 1080p, and under ~8 Mbps average bitrate, don't re-encode —
mark playback "ready" with no playback object, meaning "the original is
already fine". This avoids paying an encode for clips that gain nothing.

## 4. Data model

New nullable columns on `media` (images leave all of them null):

- `playback_key text` — bucket key of the transcoded copy
  (`memories/{id}/playback.mp4`). Stays null when the skip rule decided the
  original is already fine.
- `playback_bytes bigint` — size of whichever object `/view` will serve
  (the playback copy, or the original in the skip case). Lets `shareable` be
  computed from what would actually be shared.
- `playback_status varchar(20)` — `pending | processing | ready | failed`,
  reusing `PROCESSING_STATES`. Migration sets existing videos to `pending`
  (the boot sweep then backfills them) and images to null.
- `playback_error text` — trimmed failure message, same convention as
  `processing_error`.

`processing_status` keeps its current meaning and timing: a video is "ready"
(visible, playable via its original) the moment its bytes and poster are
handled, exactly as today. Transcoding is an enhancement pass that never
blocks a clip from appearing — an HEVC clip is unwatchable on Chrome until
its pass finishes, which is the accepted cost of not holding uploads hostage.

## 5. Pipeline

**Runner.** A small in-process queue module (`lib/storage/transcode.ts`),
strictly one job at a time so encodes never stack up against request serving.
ffmpeg comes from the `ffmpeg-static` npm package (adds ~80 MB to the image;
no Dockerfile/Nixpacks changes). Flow per job:

1. Mark `playback_status = processing`.
2. Stream the original from the bucket to a temp file (MP4/MOV needs seekable
   input; never buffer whole clips in memory — spec §14 memory discipline).
3. ffprobe → apply the skip rule (§3) or run ffmpeg to a second temp file,
   with a hard kill at 20 minutes.
4. Upload `playback.mp4`, set `playback_key`, `playback_bytes`,
   `playback_status = ready`.
5. Delete temp files in a `finally`. On any failure: `playback_status =
   failed`, message in `playback_error`, original untouched, playback falls
   back to the original — today's behavior, unchanged.

**Triggers.**

- **Upload:** `/api/memories/[id]/complete` — after its response is sent (via
  `after()` from `next/server`; the server is a long-lived Railway process,
  not a lambda) — enqueues the video. The response itself doesn't wait: a
  multi-minute encode must never depend on a phone keeping a socket open.
- **Boot sweep:** server startup (`instrumentation.ts` `register()`) enqueues
  every video with `playback_status` in (`pending`, `processing`) — crash
  recovery for jobs a deploy or restart interrupted, and the backfill for
  pre-existing videos after the migration. Ordered oldest-first, still one at
  a time; a large backlog just takes a while, which is fine.
- **Failed stays failed** until retried manually (see §8). No automatic retry
  loop — a clip ffmpeg can't handle once won't fare better the third time.

## 6. Serving changes

- **`/api/memories/[id]/view`** (video, no `variant`): presign
  `playback_key ?? original_key`. Poster/photo behavior unchanged. The
  5-minute redirect cache already in place applies as-is.
- **`/api/memories/[id]/share`**: serve the playback copy when `playback_key`
  is set; the 64 MB ceiling checks `playback_bytes ?? original_bytes`. Net
  effect: most videos become shareable, and what lands in WhatsApp plays on
  the recipient's phone regardless of what recorded it.
- **`shareable` flag** (`lib/memories.ts`): computed from
  `playback_bytes ?? original_bytes`, so the Share button appears as soon as
  the transcode lands. The lightbox already re-reads this on refresh.
- **`/api/memories/[id]/download`**: `variant=original` unchanged. Add
  `variant=playback` → the MP4 (404 until ready); the lightbox's "Download
  optimized" gains meaning for videos later, not in this change.
- **Deletion** (`deleteMemory`): include `playback_key` in the
  `deleteObjects` batch.

## 7. Guardrails

- Original bytes are never modified, moved, or deleted by this pipeline.
- One encode at a time; queue survives only in memory — the boot sweep is the
  source of truth after a restart, so no job is ever *lost*, only re-run.
- Re-running a job is safe: same deterministic key, upload overwrites.
- Encode timeout (20 min) and temp-dir hygiene so a poison clip can't wedge
  the queue or fill the disk; skip any job whose original exceeds the upload
  ceiling already enforced at intent time.
- Watch container memory/CPU on Railway after launch; if encodes visibly
  degrade serving, the escape hatch is moving `transcode.ts` behind a
  separate Railway worker service — the module boundary is drawn so that
  move touches no call sites.

## 8. Admin/debug affordance (minimal)

A `failed` playback pass is invisible in the UI by design (the original still
plays where it can). For diagnosis: the existing pattern of trimmed error
columns plus Railway logs is enough. Retry = set `playback_status` back to
`pending` and restart (boot sweep picks it up). No admin UI in v1 of this.

## 9. Testing

- Unit: ffmpeg argument builder (scale/rotation/audio decisions) and the
  skip rule against fabricated ffprobe outputs — pure functions, no binary.
- Integration (vitest, tagged like `bucket.smoke.test.ts` so CI can exclude
  it): transcode a ~2 s fixture clip end to end through a temp dir, assert a
  faststart H.264 MP4 comes out; run ffprobe on the result.
- Manual: upload an iPhone HEVC `.mov`, confirm it plays in Chrome once the
  pass completes, confirm Share appears, confirm delete removes all four
  objects (original, poster, thumbnail/display, playback).

## 10. Rollout

1. Migration (columns + backfill of `pending` on existing videos).
2. Ship pipeline + serving changes together (serving falls back to original
   wherever `playback_key` is null, so order within the deploy doesn't
   matter).
3. Watch the boot sweep chew through the backlog in Railway logs; spot-check
   an HEVC clip on Android/Chrome.
4. Then, separately: the autoplay-in-carousel lightbox work, which assumes
   this exists.
