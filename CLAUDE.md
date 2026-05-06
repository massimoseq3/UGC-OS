# CLAUDE.md — UGC Lab

## Project Identity

You are building **UGC Lab** — a browser-based YouTube-style workspace that unifies seven AI tools for UGC ad production into a single environment with shared data banks. Every AI call goes through **kie.ai** as a unified API gateway: one user-supplied Bearer key gives access to every model the app uses (chat, vision, image gen, video gen, TTS).

App display names (action-style):

| Sidebar entry | Folder name (stable, do not rename) | Job |
|---|---|---|
| Finder | `finder/` | Banks browser |
| Generate Characters | `character-studio/` | Form → portrait image |
| Extract Visual DNA | `image-dna/` | Image → JSON of physical / style / scene attributes |
| Analyze Ads | `ad-anatomy/` | Ad image or video frame → scorecard + transcript + visual playbook |
| Generate Scripts | `script-architect/` | Winning ad + product → new script |
| Generate Voiceovers | `voice-studio/` | Script → audio (ElevenLabs v3) |
| Generate B-Roll | `broll-studio/` | Script → scenes → still images → animated frames |
| Generate Videos | `video-studio/` | Prompt + optional reference frames → standalone video |

Folder names and the `id` strings in `src/utils/constants.ts` are stable on purpose — they're used in localStorage keys for per-app model selections.

## Role

Senior frontend engineer + product architect. Push back when something's flawed. Ask for context (kie doc URLs, exact error text) before guessing. Prefer the boring, debuggable solution.

## Core Rules

### Code philosophy
- Simple > clever. Obvious > terse.
- Components small, single-purpose. Names say what they do.
- No premature optimisation.
- Comments only for *why* the code looks the way it does, not *what* it does.

### Architecture
- **Self-contained apps.** Each app under `src/apps/<name>/` owns its types, components, and service. Cross-app communication goes through the bank store (persistent state) or the inter-app payload (one-shot handoffs).
- **Shared state** = banks (Products, Models, Scripts, Voices, B-Rolls, voiceHistory) + settings + active app. Persisted to localStorage. Asset blobs (audio, image, video) live in IndexedDB via `assetStore`, not localStorage.
- **No prop drilling.** Zustand stores for global state. Local React state for ephemeral UI.
- **Model registry is single source of truth.** Add or change a model only by editing `src/utils/models.ts`. Don't sprinkle slugs through service files.

### Styling
- Tailwind only. No CSS modules, no styled-components.
- Dark-first. Backgrounds `#050505`–`#0A0A0A`. Borders `white/5`–`white/10`. Glass via `backdrop-blur-xl`.
- Tracking-tight on most text. Transitions 200–300 ms ease-out for panels, 150 ms for hover.
- Tags use `TAG_STYLES` from `models.ts` (Recommended green / New fuchsia / Fast sky / Cheap zinc).

### Errors
- Surface raw kie.ai response shape on failures. Don't wrap them in friendly text — the user has explicitly asked to see the underlying error.
- The chat completions parser falls back to JSON parsing if SSE produces nothing, then surfaces the body's first 400 chars in the thrown error.
- The kie envelope can return `{ code: 5xx, msg: "...maintained..." }` inside an HTTP 200 — common during kie's maintenance windows. Not a code bug.

## Tech Stack

- React 18 + TypeScript
- Vite (`npm run dev` → http://localhost:5173)
- Tailwind CSS 4
- Zustand for global state
- IndexedDB (`assetStore.ts`) for blobs
- localStorage for everything else (bank metadata, settings, picker selections, sidebar collapsed state)
- No backend. Bearer token sent directly from the client to kie.ai.

## kie.ai client (`src/utils/kie.ts`)

Three transport patterns — pick the right one per task type.

### 1. Async task (image, video createTask flow, TTS)
```
POST  https://api.kie.ai/api/v1/jobs/createTask    { model, input } → { data: { taskId } }
GET   https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…           → { data: { state, resultJson, ... } }
```
Helpers: `runTask`, `kieImageGenerate`, `kieVideoGenerate`, `kieTTS`, `parseResult`. Result URLs land in `resultJson.resultUrls` (string-encoded JSON inside the envelope). Outputs auto-expire in 3 days; always `downloadAsBase64` + `saveAsset` so user banks survive.

### 2. OpenAI-compatible chat completions (text, vision)
```
POST  https://api.kie.ai/<model-slug>/v1/chat/completions
```
Streaming SSE by default (`stream: true`). The helper accumulates `delta.content`, falls back to JSON parse if the server returned a single envelope. Vision via `image_url` content blocks; data URIs work — no upload needed.

Helper: `kieChatCompletions(apiKey, endpointPath, messages, opts)`. The endpoint path comes from `getChatEndpointPath()` in `models.ts` so callers don't hardcode slugs.

### 3. Veo custom endpoint
Veo 3.1 family doesn't use `/jobs/createTask`. It hits:
```
POST  https://api.kie.ai/api/v1/veo/generate
GET   https://api.kie.ai/api/v1/veo/record-info?taskId=…
```
Helper: `kieVeoGenerate(apiKey, body, opts)`. Variant (`veo3` / `veo3_fast` / `veo3_lite`) is selected via the `model` field in the body, not the URL.

### File upload (when models need URLs, not base64)
Image-to-image and image/frame-conditioned video models accept *public URLs only*. `ensureHostedUrl(apiKey, source)` uploads any `data:` URI via `POST /api/file-base64-upload` and returns the `downloadUrl`. http(s) URLs pass through. Hosted files expire after 3 days.

### Connection test
`kieTestConnection(apiKey)` hits `GET /api/v1/chat/credit` and returns the remaining credit balance. Used by Settings.

## Models in use (defaults)

The full list lives in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded across every text-using app — no picker |
| Image (text→image) | GPT Image 2 (`gpt-image-2-text-to-image`) | Picker also exposes Nano Banana 2, Flux 2 Pro, SeeDream 5 Lite, Imagen 4 |
| Image (image→image) | GPT Image 2 Edit (`gpt-image-2-image-to-image`) | Used by B-Roll when reference images are present |
| Video (4 modes) | Seedance 2.0 (`bytedance/seedance-2`) | Picker exposes Seedance 2.0 Fast, Kling 3.0, Veo 3.1 Fast/Lite/Quality |
| TTS | ElevenLabs v3 (`elevenlabs/text-to-dialogue-v3`) | Hard-coded — no picker; voice catalog filterable by gender + accent |

### Pricing model

Each `ModelEntry` declares `pricing.credits` (flat per-unit) plus an optional `priceFor(opts)` callback for models with multi-dimensional pricing (Kling: resolution × audio; Veo Quality: 4K is 2× others). `estimateCredits(modelId, params)` and `formatCredits` are the only public APIs callers need.

USD values are **not** stored — kie.ai is credit-based and we don't show dollars anywhere.

### Video modes

```ts
type VideoMode =
  | 'text-to-video'
  | 'image-to-video'        // single first frame
  | 'frames-to-video'       // start frame + end frame
  | 'reference-to-video'    // up to 9 reference images (Seedance) / 3 (Veo Fast)
```
Each video model declares `videoModes: VideoMode[]` + `videoConstraints` (allowed durations, resolutions, aspect ratios, audio support). The Video Studio UI re-shapes its input area per mode and snaps constraint controls to allowed values when the model changes.

### Per-model body shaping

`buildImageInput(modelId, opts)` and `buildVideoInput(modelId, opts)` in `models.ts` produce the correct request body for each model. Callers pass a uniform options object; the builders handle the field-name differences (Seedance `first_frame_url` vs Kling `image_urls[]` vs Veo `imageUrls`).

## File structure

```
src/
├── App.tsx                        # Shell: menu bar + sidebar + active app
├── main.tsx                       # Entry point
├── index.css                      # Tailwind + scrollbar styles
│
├── components/                    # Shared UI
│   ├── MenuBar.tsx                # Top bar: hamburger + UGC Lab wordmark
│   ├── Sidebar.tsx                # Left nav (collapsible). Replaced the old Dock.
│   ├── BankPicker.tsx             # Universal sliding panel for selecting bank items
│   ├── BankItemCard.tsx           # Reusable card for displaying bank items
│   ├── ModelPicker.tsx            # Dropdown with credit estimate inline
│   ├── SettingsModal.tsx          # kie.ai API key + Test connection
│   ├── GenerationProgress.tsx     # Loading bar with percent (no seconds)
│   └── Toast.tsx                  # Confirmation toasts
│
├── stores/
│   ├── bankStore.ts               # Banks + voiceHistory (one-shot v3 voice migration on load)
│   ├── appStore.ts                # Active app, running apps, inter-app payload, sidebar collapsed
│   ├── settingsStore.ts           # kieApiKey + perAppModel selections
│   └── types.ts                   # Bank type definitions
│
├── apps/
│   ├── finder/                    # Bank browser + edit forms
│   ├── character-studio/          # → "Generate Characters"
│   ├── image-dna/                 # → "Extract Visual DNA"
│   ├── ad-anatomy/                # → "Analyze Ads"
│   ├── script-architect/          # → "Generate Scripts"
│   ├── voice-studio/              # → "Generate Voiceovers" (ElevenLabs v3)
│   ├── broll-studio/              # → "Generate B-Roll" (chains text → image → animate)
│   └── video-studio/              # → "Generate Videos" (4 modes, 6 models)
│
├── hooks/
│   └── useAssetUrl.ts             # Resolves asset:// refs to blob URLs for <img> / <video>
│
└── utils/
    ├── kie.ts                     # Unified kie.ai client (3 transports + file upload)
    ├── models.ts                  # Model registry, ModelEntry, buildImageInput, buildVideoInput, estimateCredits
    ├── assetStore.ts              # IndexedDB-backed blob persistence
    ├── localStorage.ts            # Bank persistence helpers
    └── constants.ts               # APP_REGISTRY, BANK_CONFIG (icons, accents, display names)
```

## Banks

Persisted to `localStorage` under `ai-ugc-lab-banks`. Asset blobs (images, audio, video) are stored in IndexedDB via `assetStore`; the bank stores `asset://<id>` refs. `useAssetUrl(ref)` turns a ref into a blob URL.

| Bank | Type (in `stores/types.ts`) | Source |
|---|---|---|
| `products` | `Product` | Manually added in Finder |
| `models` | `Model` | Saved from Character Studio output |
| `scripts` | `Script` | Saved from Script Architect output |
| `voices` | `VoicePreset` | Saved from Voice Studio history |
| `brolls` | `BRoll` | Saved from B-Roll Studio + Video Studio |
| `voiceHistory` | `VoiceHistoryItem` | Auto-pushed on every Voice Studio generation |

`VoicePreset` and `VoiceHistoryItem` migrated to the v3 shape (`voiceId`, `stability`). Legacy fields (`creativity`, `ambience`, `styleInstructions`) get stripped on load — see `migrateVoiceShape` in `bankStore.ts`.

## Inter-app payloads

```ts
// Sender:
sendToApp({ targetApp: 'video-studio', targetField: 'firstFrame', data: <dataUri> })

// Consumer (in target app's component):
useEffect(() => {
  if (activeApp !== 'video-studio') return
  if (!interAppPayload || interAppPayload.targetApp !== 'video-studio') return
  if (interAppPayload.targetField === 'firstFrame') { ... }
  consumePayload()
}, [interAppPayload, activeApp, consumePayload])
```

Wired today:
- Ad Anatomy → Script Architect (winning transcript / reconstruction prompt)
- Ad Anatomy → Finder (productId)
- Script Architect → Voice Studio (script text)
- B-Roll Studio → Video Studio (still as first frame)

## Build phases (history)

1. OS shell + banks (initial commit, macOS-style)
2. Character Studio + Image DNA
3. Ad Anatomy + Script Architect
4. Voice Studio + B-Roll Studio
5. Polish: transitions, empty states, error handling
6. **Sidebar redesign** — YouTube-style left nav replaces bottom dock; bigger menu bar.
7. **kie.ai migration** — every app onto kie.ai. Added `kie.ts`, `models.ts`, `ModelPicker`, Video Studio Pro. Dropped `gemini.ts`. ElevenLabs Turbo 2.5 became TTS.
8. **Polish pass** — Loading bar shows percent; action-style app names; eye icon for Analyze Ads; Settings simplified; Voice Studio rebuilt on ElevenLabs v3 with 20-voice catalog + filters; Video Studio expanded to 6 models with per-model constraints, 4 modes, multi-dim pricing for Kling, Veo's custom endpoint; B-Roll → Video Studio handoff.
9. **Cleanup pass** — Drop `usd` field, split `Mode` into `ImageMode` + `VideoMode`, factor `getChatEndpointPath` into `models.ts`, delete dead `Desktop.tsx` + `DesktopFolder.tsx`, voice shape localStorage migration.

## When making changes (going forward)

After any non-trivial change to behaviour, file structure, or model lineup:

1. Update this file (`CLAUDE.md`) so future-Claude has accurate context.
2. Update `AI_UGC_Lab_OS_Spec.md` when feature-level intent changes (not for every refactor).
3. Update the model table above if you register or remove a model.
4. Add a one-line entry to **Build phases** when shipping a coherent body of work.

The user has explicitly asked for these docs to stay in sync with reality.

## Documentation

The product spec lives in `AI_UGC_Lab_OS_Spec.md` at the project root.
