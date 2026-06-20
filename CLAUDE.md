# CLAUDE.md — UGC OS

## Project Identity

You are building **UGC OS** — a browser-based, YouTube-style workspace that unifies seven AI tools for UGC ad production into one environment with shared data banks. Every AI call goes through **kie.ai**: one user-supplied Bearer key gives access to every model the app uses (chat, vision, image, video, TTS, music).

**Who it's for / why.** A private Skool community of solo creators and small teams producing AI UGC ads at scale — access is gated by an email allowlist synced from Skool, so non-members can't sign up even with the URL. The pitch is one workspace instead of seven tabs: the same product, character, script, voice, and B-Roll flow across every app via the shared banks. Inference cost is on the member (BYO kie.ai key), so the operator only pays for hosting + storage.

Sidebar is grouped into three sections (LIBRARY / CREATE / TOOLS). Display names are terse nouns, not action verbs. Folder names and the `id` strings in `src/utils/constants.ts` are **stable** — they key per-app model selections in localStorage. Do not rename them.

| Section | Sidebar entry | Folder | Job |
|---|---|---|---|
| Library | Bank | `finder/` | Banks browser |
| Create | Influencers | `character-studio/` | Form → portrait image, or (Portrait / Character Sheet toggle) a multi-panel reference sheet (turnaround + expressions + full body; scene/pose/camera fields ignored; own 16:9 / 9:16 aspect picker, prompt layout swaps with orientation, resolution bumps to 2K). Sheets save as their own bank Model entry (named like a portrait; stamped as both `characterImage` and `sheetImage`). Horizontal (16:9) gallery outputs span a full row. Drop a reference photo anywhere to auto-fill every field via vision-based DNA extraction. Display name rebranded from "Characters" — folder, ids, types, and LLM prompts keep the character naming. |
| Create | Scripts | `script-architect/` | Three modes: Write New (brief + style + 10/15/30/60s → 3 human-sounding takes, as plain script or scene blueprint), Remix Script (winning transcript → 3 variations), Remix Scenes (Ad Analyzer blueprint → rewritten scene prompts). Write New has a third **Output** = **Cinematic** (`writeFormat: 'prompt'`): generates 3 distinct ≤15s single-clip AI-commercial master prompts (generic STYLE→TIMELINE formula, `@INFLUENCER`/`@PRODUCT` tokens) — swaps the Script Style picker for an optional Influencer (models bank) picker, caps length to 10s/15s, and ships each via **Send to Playground** (`cinematicVideo` payload → video mode, refs attached, Seedance 2.0). |
| Create | Voiceovers | `voice-studio/` | Script → audio (ElevenLabs v2) |
| Create | B-Roll | `broll-studio/` | Script → scenes → 4 variations/scene (Speaking / Literal / Emotional / Product). Each card has Generate Image **and** Generate Video; video gens are fire-and-forget with refresh-safe resume. |
| Tools | Ad Analyzer | `ad-anatomy/` | Ad image or video frame → scorecard + transcript + visual playbook |
| Tools | Playground | `playground/` | Free-form Image / Video / Music. Prompt bar, mode tabs, model picker, model-aware ref slots + drag-drop (images everywhere; Seedance 2 adds audio/video reference clips; Gemini Omni adds characters / designed voices / a trimmed source clip under a 7-slot quota). `@`-mentions reference Products / Influencers / B-Rolls and auto-attach the asset. Uploaded audio/video refs are memory-only (pruned from the persisted draft — too big for localStorage). |

## Role

Senior frontend engineer + product architect. Push back when something's flawed. Ask for context (kie doc URLs, exact error text) before guessing. Prefer the boring, debuggable solution.

## Core Rules

**Code philosophy.** Simple > clever. Obvious > terse. Components small and single-purpose. No premature optimisation. Comments explain *why*, not *what*.

**Architecture.**
- **Self-contained apps.** Each app under `src/apps/<name>/` owns its types, components, and service. Cross-app communication goes through the bank store (persistent) or the inter-app payload (one-shot handoffs).
- **No prop drilling.** Zustand stores for global state; local React state for ephemeral UI.
- **Model registry is the single source of truth.** Add or change a model only by editing `src/utils/models.ts`. Don't sprinkle slugs through service files.

**Styling.** Tailwind only. Per-app accent palettes are custom Tailwind families (`influencers-*`, `scripts-*`, `voice-*`, `broll-*`, `playground-*`) defined in the `@theme` block of `index.css` (Ad Analyzer uses literal `#FF5257`); the matching hexes for sidebar/bank chrome live in `constants.ts`. Change an accent there, not by sprinkling new color classes. Tracking-tight text. Transitions 200–300 ms for panels, 150 ms for hover. Tags use `TAG_STYLES` from `models.ts` (Recommended green / New fuchsia / Fast sky / Cheap zinc). **Single-line inputs, select-style triggers, chips, and buttons are fully rounded (`rounded-full`), not rectangles** — Massimo's preferred aesthetic; multi-line textareas use `rounded-2xl`.

**Theming (dark default + light mode).** Driven by `data-theme` on `<html>`: an inline script in `index.html` sets it pre-paint; `stores/themeStore.ts` owns the preference (`dark`/`light`/`system`, own localStorage key `ai-ugc-lab-theme`, deliberately per-browser — never cloud-synced, survives sign-out). Switchers: Settings → Appearance + sidebar quick toggle. UI chrome must use the semantic tokens from `index.css`, never literal white/zinc/dark hexes:
- `ink` — fg chrome (white in dark, near-black in light): `border-ink/10`, `bg-ink/5`, `text-ink`. `paper` is its inverse (`bg-ink text-paper` buttons).
- `surface-0/1/2` — page → panel → popover elevation.
- `ink-50…950` — text ramp; dark equals zinc, light is mirrored (ink-100 stays "bright", ink-500 mid, ink-700 dim). Inverse elements self-flip (`bg-ink-100 text-ink-900`).
- Accent families auto-flip their 100–400/600 tints in light mode.
Exceptions that stay literal: anything overlaying user media (badges/scrims/play buttons → `text-white`, `bg-black/60`, `from-black/85`), white text on solid accent buttons, modal backdrops. Status tints (-100…-400 colored text on tinted bg) need a `light:` darker variant (`text-red-300 light:text-red-700`; the `light:` custom variant is defined in `index.css`). `AppBackground.tsx` holds the per-theme canvas gradient.

**Errors.** End-user generation surfaces show friendly copy via `humanizeError()` (see `utils/friendlyError.ts`). Infra/admin/Settings surfaces still surface the raw kie.ai message — the operator debugs there. Note: the kie envelope can return `{ code: 5xx, msg: "...maintained..." }` inside an HTTP 200 during maintenance windows — not a code bug.

## Tech Stack

- React 19 + TypeScript + Vite (`npm run dev` → http://localhost:5173). Tailwind CSS 4. Zustand for global state.
- IndexedDB (`assetStore.ts`) for blobs, mirrored to Cloudflare R2 when cloud sync is active. localStorage for bank metadata, settings, picker selections.
- **Cloud (opt-in):** Supabase (auth + Postgres) + R2. Enabled when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set; absent → local-only mode (100% client-side). Access gated by email allowlist synced from Skool via Zapier.
- kie.ai Bearer token sent directly from the client (no proxy).

## kie.ai client (`src/utils/kie.ts`)

Four transports — pick by task type. Endpoints and result shapes live in `kie.ts`; the gotchas worth knowing here:

1. **Async task** (`runTask`, `kieImageGenerate`, `kieVideoGenerate`, `kieTTS`) — `POST /jobs/createTask` → poll `GET /jobs/recordInfo`. Result URLs are string-encoded JSON inside `resultJson.resultUrls`. Outputs expire in 3 days — always `downloadAsBase64` + `saveAsset`.
2. **Chat completions** (`kieChatCompletions`) — `POST /<slug>/v1/chat/completions`, streaming SSE, falls back to JSON parse then surfaces the body's first 400 chars on failure. Vision via `image_url` blocks (data URIs work, no upload). Get the endpoint path from `getChatEndpointPath()` — never hardcode slugs.
3. **Veo** (`kieVeoGenerate`) — custom `/veo/generate` + `/veo/record-info`. Variant (`veo3` / `veo3_fast` / `veo3_lite`) via the `model` field, not the URL. Results nest under `response.resultUrls`.
4. **Suno music** (`kieMusicGenerate` / `kieMusicPoll` / `runMusicTask`) — custom `/generate` + `/generate/record-info`. Suno-specific status values; `callBackUrl` is required by the schema but we pass a no-op and poll. Audio at `response.sunoData[].audioUrl` (v1 uses the first track).
5. **Omni create** (`kieOmniAudioCreate` / `kieOmniCharacterCreate`) — synchronous `POST /omni/audio/create` and `/omni/character/create`, no polling. Mint persistent `kieAudioId` / `characterId` values (scoped to the member's kie account) that `gemini-omni-video` consumes as `audio_ids` / `character_ids`. Success can come back as envelope code 0 *or* 200.

`ensureHostedUrl(apiKey, source)` uploads `data:` URIs to kie's file host (image→image and frame-conditioned video models need public URLs; hosted files expire in 3 days). `kieTestConnection` checks the credit balance (Settings).

## Models (defaults)

Full list in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded everywhere — no picker |
| Image (text→image) | Nano Banana 2 (`nano-banana-2`) | App-wide default (leads the registry). Picker also: GPT Image 2, Seedream 5 Lite |
| Image (image→image) | Nano Banana 2 (`nano-banana-2`) | Used when reference images are present. Picker also: GPT Image 2 Edit |
| Video | Seedance 2.0 (`bytedance/seedance-2`); B-Roll defaults to Veo 3.1 Fast (`veo3_fast`) | Ref-capable. Picker also: Seedance 2.0 Fast, Seedance 1.5 Pro (`bytedance/seedance-1.5-pro`, `input_urls` frames, no reference inputs), Veo 3.1 Fast/Lite/Quality, Gemini Omni (`gemini-omni-video`), Kling 3.0, Kling 3.0 Turbo (`kling/v3-turbo-image-to-video`, image-to-video only), Kling 3.0 / 2.6 Motion Control (`kling-3.0/motion-control`, `kling-2.6/motion-control` — Playground only), Wan 2.7 |
| TTS | ElevenLabs Multilingual v2 (`elevenlabs/text-to-speech-multilingual-v2`) | Hard-coded; ~64-voice catalog, slide-in picker |
| Music | Suno V5 (`suno-v5`) | Playground only. Picker also: Suno V5.5 |

- **Pricing.** `estimateCredits(modelId, params)` + `formatCredits` are the only public APIs. Each `ModelEntry` declares flat `pricing.credits` or a `priceFor(opts)` callback for multi-dimensional models (Kling, Veo). No USD is shown anywhere. Per-call models (Veo all variants) have `videoConstraints.durations: []` so the duration toggle hides.
- **Video modes** (`text-to-video` / `image-to-video` / `frames-to-video` / `reference-to-video` / `motion-control`). Each model declares `videoModes` + `videoConstraints`. B-Roll and Playground infer the mode at generate time from which inputs are filled (references → reference-to-video; start+end → frames; start only → image; none → text). Ref-capable models: `veo3_fast`, `bytedance/seedance-2`, `bytedance/seedance-2-fast`, `gemini-omni-video`.
- **Motion Control** (`kling-3.0/motion-control`, `kling-2.6/motion-control`, Playground only). Flagged `motionControl: true`; mode is fixed (not inferred). Takes a required character image + driving video (`input_urls` / `video_urls`) and a `character_orientation` ('video' ≤30s / 'image' ≤10s); prompt optional, no aspect/duration/audio. Playground swaps the ref panel for `MotionControlSection` (image slot + driving-clip upload + orientation toggle) via the `motion-image` / `motion-video` ref slots; the driving clip is memory-only (pruned from the persisted draft). Per-second billing keyed on 720p/1080p.
- **Gemini Omni** (`gemini-omni-video`, Playground only). Three capability flags on `ModelEntry`: `supportsReferenceAudio` / `supportsReferenceVideos` (Seedance 2 family — `reference_audio_urls` / `reference_video_urls`, ≤15s total each, validated client-side via `utils/media.ts` metadata reads) and `omniInputs` (Omni only). Omni inputs share a 7-slot quota (image ×1, source clip ×2, character ×1). Characters come from the Influencers bank — `ensureOmniCharacterId` (playground/service.ts) mints the id via `/omni/character/create` on first attach and stamps `Model.omniCharacterId`. Designed voices live browser-locally in `stores/omniVoiceStore.ts` (like the kie key — ids are kie-account-scoped). Omni audio is always on (no toggle); a video input switches billing to a flat per-call tier (`PriceParams.videoInput`).
- **Body shaping.** `buildImageInput` / `buildVideoInput` / `buildMusicInput` produce the correct per-model request body from a uniform options object (handling field-name differences like Seedance `first_frame_url` vs Veo `imageUrls`).
- **B-Roll per-card video.** Each card carries its own `videoStatus` + persisted `videoTaskId`, so cards generate in parallel and survive a refresh. `services/generateVideo.ts` splits into `startVideoTask` (→ taskId) and `finishVideoTask` (poll → download → save). OutputPanel resumes pending tasks on mount; entries older than 30 min are evicted with a Reset link.

## Non-obvious files

Most files are self-explanatory. These carry behaviour worth knowing before you touch them:

- `stores/bankStore.ts` — all banks + history + `migrateVoiceShape`.
- `utils/orphanCleanup.ts` — once-per-sign-in asset sweep. Its bank list **must** cover every bank (compile-time `satisfies Record<BankKey, true>` guard) or it deletes that bank's live assets from IDB + R2.
- `utils/assetStore.ts` — IndexedDB blobs + fire-and-forget R2 mirror; `getBlob()` falls back to R2 on miss.
- `utils/friendlyError.ts` — `humanizeError(err, fallback)`, the ordered rule table for end-user error copy.
- `lib/cloudSync.ts` — pull on sign-in + debounced diff-push + persistent localStorage outbox + non-destructive hydrate.
- `lib/supabase.ts` — `ensureFreshSession()` (3s race + cached-token fallback) and a custom non-blocking `auth.lock`.
- `hooks/useAssetUrl.ts` — resolves `asset://` refs to blob URLs.

## Banks

Persisted to `localStorage` under `ai-ugc-lab-banks`. Asset blobs live in IndexedDB (mirrored to R2 in cloud mode); rows store `asset://<id>` refs. `useAssetUrl(ref)` turns a ref into a blob URL. Types are in `stores/types.ts`.

`products`, `models` (from Influencers), `scripts`, `voices`, `brolls`, plus auto-pushed history banks: `voiceHistory`, `videoHistory`, `imageHistory`, `musicHistory`, `scriptHistory`, `brollHistory`, `characterHistory`, `adAnatomyHistory` (all cloud-synced — every bank table has a Postgres mirror). Gotchas:

- **`brolls`** — only **stills** are saveable to the bank (reusable as start frames / references); videos are download-only, so no UI writes new `videos[]` entries anymore (the save-to-bank action is hidden on video tiles in B-Roll + Playground). The `videos[]` field and its render/edit/cleanup paths stay for back-compat — older saved-video entries (and the video-only-broll render path in `BankList`) still display and download. Saved video-history items stamp `linkedBRollId`; deletion only purges the blob if not linked.
- **`videoHistory`** is shared by B-Roll and Playground (for refresh-resume); Playground's grid filters out `sourceApp === 'broll-studio'`. 14-day retention.
- **`characterHistory`** carries `imageRef` + the full `profile` snapshot; `linkedModelId` is set on save-to-bank and gates blob purge. Presets aren't a bank — reuse a recipe by saving to `models` and reloading via the Controls header dropdown.
- **`VoicePreset` / `VoiceHistoryItem`** carry the full v2 param set (`voiceId`, `stability`, `similarityBoost`, `style`, `speed`). Legacy fields are stripped and missing v2 fields backfilled (`0.75 / 0 / 1`) by `migrateVoiceShape`.

## Auth + cloud sync

`AuthGate` wraps the app: bootstrapping → spinner; signed-out → `AuthScreen`; signed-in → workspace + `UserMenu`. No cloud env vars → local-only mode with a bottom banner. Full deploy stack is in `DEPLOYMENT.md`; threat model in `SECURITY.md`.

- **Allowlist.** Postgres trigger `enforce_allowlist` blocks signups not in `public.allowlist` (no client bypass). A global `public.app_config.enforce_allowlist` flag (Admin → Allowlist toggle) short-circuits the trigger when off — open signups while Zapier isn't wired; flip back on to re-gate. `on_allowlist_delete` sets `profiles.disabled_at` → app signs the user out on hydration; `on_allowlist_insert` clears it. A disabled account (sign-in or stale session) sets `authStore.accessRevoked`, and `AuthScreen` shows a "members only" popup linking to `SKOOL_COMMUNITY_URL`. Zapier syncs Skool events in. **Names:** signup collects First name + Surname → passed as auth user metadata; `on_auth_user_created` seeds `profiles.first_name/last_name` from the allowlist row, falling back to that metadata (migration 0015) so members who sign up with a non-Skool email are still identifiable.
- **Cloud sync** (`cloudSync.ts`). Pulls profile + all bank tables on sign-in. `bankStore` writes local first, then pushes the row. A failed/timed-out push (15s) is recorded in a persistent localStorage outbox (`ugc-lab:sync-outbox`) and replayed by `drainOutbox()` on startup + tab focus. **Hydrate is non-destructive:** a per-table fetch error keeps local rows (never `[]`), and outbox-pending rows are overlaid so an unsynced row survives a refresh.
- **Session freshness** (`supabase.ts`). Every cloud write awaits `ensureFreshSession()`, which races `getSession()` against a 3s timeout and falls back to a module-cached token (kept current by an `onAuthStateChange` listener) when the SDK's auth lock stalls after a backgrounded tab returns. The client also uses a custom `auth.lock` (`nonBlockingLock`, ~2s bound then runs unlocked) because supabase-js takes that lock on every request. `visibilitychange` recovers the token on focus.
- **kie.ai key is browser-local only.** Lives in `localStorage` under `ai-ugc-lab-settings`, never written to or read by Supabase/cloudSync. Users re-paste on each new browser. Deliberate trade-off: nothing in the DB ever holds the key.
- **Schema.** Bank tables are JSONB (id PK, user_id FK, project_ids[] GIN-indexed, data jsonb). RLS `auth.uid() = user_id` everywhere, admin bypass via `profiles.is_admin`. Admin app (Members + Insights + Allowlist) only renders for admins; the Members table and the Insights charts share one fetch via `apps/admin/useMembers.ts`.

## Inter-app payloads

One-shot handoffs. Sender calls `sendToApp({ targetApp, targetField, data })`. Consumer reads `interAppPayload` in a `useEffect` keyed on `activeApp`, dispatches on `targetField`, then calls `consumePayload()`. Wired: Ad Analyzer → Scripts (transcript) / Bank (productId); Scripts → Voiceovers (script text); Scripts → Playground (`cinematicVideo`: a `CinematicVideoPayload` of resolved prompt + product/influencer refs + modelId + duration → opens video mode, refs attached, Seedance default); B-Roll Bank → Playground (`videoStartFrame` opens video mode with the still as start frame + prompt prefilled); Anywhere → Playground (`prompt`, `imageRef`, `videoStartFrame`).

## Recent changes

This file no longer keeps a changelog — read `git log` for history. Most recent coherent work: friendly, consistent end-user error copy via `utils/friendlyError.ts`, wired into every generation catch across the apps.

## When making changes

After non-trivial changes to behaviour, file structure, or the model lineup:

1. Keep this file accurate — it's both your guardrail and per-session context, so keep it **lean**. Don't add a changelog; that's what `git log` is for.
2. Update the model table when you register or remove a model.
