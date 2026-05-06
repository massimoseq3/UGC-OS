# CLAUDE.md — UGC Lab

## Project Identity

You are building **UGC Lab** — a browser-based YouTube-style workspace that unifies seven AI UGC ad production tools (Character Studio, Image DNA, Ad Anatomy, Script Architect, Voice Studio, B-Roll Studio, Video Studio) into a single environment with shared data banks. All AI calls go through **kie.ai** as a unified API gateway: one user-supplied API key gives access to every model the apps need (chat, vision, image gen, video gen, TTS).

## Role

Act as a senior frontend engineer and product architect. Do not blindly follow instructions — if something is technically flawed, will cause bugs downstream, or contradicts earlier decisions, push back and explain why. Suggest better approaches when you see them.

## Core Rules

### Code Philosophy
- Write simple, readable code. Prefer obvious solutions over clever ones.
- Keep components small and focused. One component, one job.
- Use clear naming. `BankPicker` not `SlidingSelectionPanel`. `useProductBank` not `useBankDataManager`.
- No premature optimization. Make it work, make it right, then make it fast — in that order.
- Comments only where the "why" isn't obvious from the code.

### Architecture Rules
- **Modular by default.** Each app is a self-contained module. Working on B-Roll Studio Pro should never require understanding Voice Studio Pro internals.
- **Shared state is sacred.** The banks (Products, Models, Scripts, Voices, B-Rolls) are the shared data layer. Everything else is local to each app.
- **No prop drilling.** Use React Context or Zustand for shared state. Props are fine within a single app's component tree.
- **File structure matches mental model.** If a component belongs to Script Architect Pro, it lives in `src/apps/script-architect/`. If it's shared (like BankPicker), it lives in `src/components/`.

### Styling Rules
- Tailwind CSS only. No separate CSS files, no CSS modules, no styled-components.
- Dark-first design. The app is dark mode by default. Near-black backgrounds (#050505 to #0A0A0A).
- Match the existing aesthetic: zinc color scale for text, white at 5-10% opacity for borders, backdrop-blur for glass effects, tracking-tight on most text.
- No arbitrary color values without reason. Use the Tailwind zinc/gray scale.
- Transitions should be 200-300ms ease-out for panels and 150ms for hover states.

### State Management
- Banks persist to localStorage. Load on app start, save on every mutation.
- App-specific state (form inputs, generated outputs) lives in React state or context — lost on refresh is fine for the prototype.
- The "Send to" mechanism between apps uses a shared `interAppPayload` in global state.

### When Building New Features
1. Read the spec section for that feature first.
2. Check what shared components already exist before creating new ones.
3. Build the data layer (types, state, persistence) before the UI.
4. Test the component in isolation before integrating.

### When Debugging
- Read the error message fully before acting.
- Check if the issue is in shared state (banks, inter-app) or local state (single app).
- Don't patch symptoms. Find the root cause.
- If a fix requires changing shared components, verify it doesn't break other apps.

## Tech Stack

- **Framework:** React 18+ with TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand (preferred) or React Context for global state
- **Build:** Vite
- **No backend for prototype.** localStorage for persistence. All AI calls go through kie.ai from the client using the user's Bearer token.

### kie.ai client (src/utils/kie.ts)

All AI calls use the unified `kie.ts` client. Two transport patterns:

1. **Async task model** for image / video / TTS:
   - `POST https://api.kie.ai/api/v1/jobs/createTask` with `{ model, input }` → `{ data: { taskId } }`
   - Poll `GET /api/v1/jobs/recordInfo?taskId=…` until `state === 'success'`. Result URLs are in `resultJson.resultUrls`. Outputs are hosted with **3-day retention**, so we always download and persist to `assetStore` before returning.

2. **OpenAI-compatible chat completions** for chat / vision:
   - `POST https://api.kie.ai/<model-slug>/v1/chat/completions` (e.g. `/gemini-3-flash/v1/chat/completions`)
   - Streaming SSE response (`stream: true`); we accumulate `delta.content`. Vision via `image_url` content blocks (data URIs work).

### Models in use

| Capability | Default model (slug) | Used By |
|------------|----------------------|---------|
| Text & vision | Gemini 3 Flash (`gemini-3-flash`) | Ad Anatomy, Script Architect, Image DNA, Character Studio, B-Roll text decomp |
| Image (text→image) | GPT Image 2 (`gpt-image-2-text-to-image`) | Character Studio, B-Roll (no refs) |
| Image (image→image) | GPT Image 2 Edit (`gpt-image-2-image-to-image`) | B-Roll (with reference images) |
| Video | Seedance 2.0 (`bytedance/seedance-2`) | B-Roll animate, Video Studio (both modes) |
| Text-to-Speech | ElevenLabs Turbo 2.5 (`elevenlabs/text-to-speech-turbo-2-5`) | Voice Studio |

The model registry lives at `src/utils/models.ts`. Each entry tracks task type, supported modes, tags (Recommended / New / Fast / Cheap), pricing, and per-app defaults. **No model picker is exposed for chat or TTS** — they're hard-coded — but image and video apps have a `ModelPicker` so users can swap providers when more are added.

### Reference images and base64 → public URL

Image and video models on kie.ai expect publicly accessible URLs in fields like `input_urls` and `first_frame_url` — they don't accept base64. The `ensureHostedUrl` helper in `kie.ts` uploads any data URI to `POST /api/file-base64-upload` and returns the `downloadUrl`. Pure http(s) URLs pass through. Files in kie's hosted storage are deleted after 3 days.

## File Structure

```
src/
├── App.tsx                     # OS shell (desktop, menu bar, dock, app router)
├── main.tsx                    # Entry point
├── index.css                   # Tailwind imports + custom scrollbar styles
│
├── components/                 # Shared UI components
│   ├── Dock.tsx
│   ├── MenuBar.tsx
│   ├── Desktop.tsx
│   ├── DesktopFolder.tsx
│   ├── BankPicker.tsx          # Universal sliding panel for selecting bank items
│   ├── BankItemCard.tsx        # Reusable card for displaying bank items
│   ├── SettingsModal.tsx       # API key configuration modal
│   └── Toast.tsx               # Confirmation toasts
│
├── stores/                     # Global state (Zustand)
│   ├── bankStore.ts            # All five banks + CRUD operations
│   ├── appStore.ts             # Active app, running apps, inter-app payload
│   ├── settingsStore.ts        # API key storage (persisted to localStorage)
│   └── types.ts                # Shared type definitions for banks
│
├── apps/                       # Each app is self-contained
│   ├── finder/
│   │   ├── Finder.tsx
│   │   ├── BankList.tsx
│   │   ├── ProductForm.tsx
│   │   ├── ModelForm.tsx
│   │   ├── ScriptForm.tsx
│   │   ├── VoiceForm.tsx
│   │   └── BRollForm.tsx       # B-Roll detail/edit form with Veo 3.1 animation
│   │
│   ├── character-studio/       # App 1: UGC Character Studio
│   │   ├── CharacterStudio.tsx
│   │   ├── components/
│   │   │   ├── ChipField.tsx
│   │   │   ├── ControlsPanel.tsx
│   │   │   └── OutputPanel.tsx
│   │   ├── services/
│   │   │   └── generateCharacter.ts
│   │   └── types.ts
│   │
│   ├── image-dna/              # App 2: Image DNA Extractor
│   │   ├── ImageDna.tsx
│   │   ├── components/
│   │   │   ├── OutputPanel.tsx
│   │   │   └── UploadPanel.tsx
│   │   ├── services/
│   │   │   └── analyzeImage.ts
│   │   └── types.ts
│   │
│   ├── ad-anatomy/             # App 3: Ad Anatomy Pro
│   │   ├── AdAnatomy.tsx
│   │   ├── components/
│   │   │   ├── ResultsView.tsx
│   │   │   └── UploadView.tsx
│   │   ├── services/
│   │   │   └── analyzeAd.ts
│   │   └── types.ts
│   │
│   ├── script-architect/       # App 4: Script Architect Pro
│   │   ├── ScriptArchitect.tsx
│   │   ├── components/
│   │   │   ├── InputPanel.tsx
│   │   │   └── OutputPanel.tsx
│   │   ├── services/
│   │   │   └── generateScript.ts
│   │   └── types.ts
│   │
│   ├── voice-studio/           # App 5: Voice Studio Pro
│   │   ├── VoiceStudio.tsx
│   │   ├── components/
│   │   │   ├── ControlsSidebar.tsx
│   │   │   ├── EditorPanel.tsx
│   │   │   └── HistoryPanel.tsx
│   │   ├── services/
│   │   │   └── generateVoice.ts
│   │   └── types.ts
│   │
│   ├── broll-studio/           # App 6: B-Roll Studio Pro
│   │   ├── BrollStudio.tsx
│   │   ├── components/
│   │   │   ├── InputPanel.tsx
│   │   │   └── OutputPanel.tsx
│   │   ├── services/
│   │   │   └── generateBroll.ts  # Scene gen (Gemini 3 Flash), image gen + animate (kie.ai)
│   │   └── types.ts
│   │
│   └── video-studio/           # App 7: Video Studio Pro
│       ├── VideoStudio.tsx
│       ├── services/
│       │   └── generateVideo.ts  # Text-to-video / image-to-video via kie.ai
│       └── types.ts
│
└── utils/                      # Shared utilities
    ├── localStorage.ts         # Bank persistence helpers
    ├── kie.ts                  # Unified kie.ai client (chat, vision, image, video, TTS, file upload)
    ├── models.ts               # Model registry: per-task models, defaults, pricing, tags
    ├── assetStore.ts           # IndexedDB-backed asset persistence (audio/image/video blobs)
    └── constants.ts            # App registry, sidebar config, bank config
```

## Documentation

The full product specification is in `AI_UGC_Lab_OS_Spec.md` at the project root. Read the relevant section before building any feature. The spec covers:

- Section 2: OS Shell (desktop, menu bar, dock)
- Section 3: Shared Data Banks (schemas and behavior)
- Section 4: Bank Picker Component
- Section 5: UGC Character Studio
- Section 6: Image DNA Extractor
- Section 7: Ad Anatomy Pro
- Section 8: Script Architect Pro
- Section 9: Voice Studio Pro
- Section 10: B-Roll Studio Pro
- Section 11: Inter-app data flow map
- Section 12: Design system and aesthetic
- Section 13: Technical architecture
- Section 14: Build phases

## Build Order

Always build in this order. Do not skip ahead.

1. **Phase 1:** OS Shell + Banks (foundation everything depends on)
2. **Phase 2:** UGC Character Studio + Image DNA Extractor (character pipeline)
3. **Phase 3:** Ad Anatomy Pro + Script Architect Pro (research & script pipeline)
4. **Phase 4:** Voice Studio Pro + B-Roll Studio Pro (production pipeline)
5. **Phase 5:** Polish, transitions, empty states, error handling
6. **Phase 6 (shipped):** YouTube-style sidebar nav (replaces bottom dock); bigger menu bar with prominent UGC Lab wordmark and hamburger toggle.
7. **Phase 7 (shipped):** kie.ai migration. Replaced direct Gemini API with kie.ai unified gateway. Added `src/utils/kie.ts`, `src/utils/models.ts`, `ModelPicker`, `CostPreview`, plus the new Video Studio Pro app. Settings flow now requires only a kie.ai API key. ElevenLabs Turbo 2.5 became the dedicated TTS backend.
