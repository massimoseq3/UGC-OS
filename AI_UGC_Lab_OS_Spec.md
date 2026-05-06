# UGC Lab — Product Specification

## Document Purpose

This is the product specification for UGC Lab — a unified workspace combining seven AI UGC ad production tools into a single platform with shared data banks and seamless inter-app workflows.

This document serves as:
1. A reference for prototyping
2. The foundation for the Claude Code build spec (production version)

---

## Current State Addendum (2026-05-06)

The spec below was written for the original vision. The shipped app has evolved on a few axes — this section captures the deltas. The narrative further down still holds for product intent and design rationale; treat anything contradicting this addendum as historical.

### What changed

- **Shell aesthetic.** The macOS-style desktop / dock / menu bar has been replaced with a YouTube-style left sidebar. The sidebar is collapsible; menu bar is taller with a prominent "UGC Lab" wordmark. `Desktop.tsx`, `DesktopFolder.tsx`, and `Dock.tsx` were deleted.
- **App count.** Seven apps, not six. Added **Generate Videos** (Video Studio Pro) for standalone text-to-video / image-to-video / frames-to-video / reference-to-video.
- **App names.** Renamed to action-style verbs in the sidebar — "Generate Characters", "Extract Visual DNA", "Analyze Ads", "Generate Scripts", "Generate Voiceovers", "Generate B-Roll", "Generate Videos". Folder names + IDs in code are unchanged (`character-studio/`, etc.) for stable localStorage keys.
- **API backend.** Gemini direct API was replaced with **kie.ai** as a unified gateway. One Bearer key gives access to ~74 models. `src/utils/gemini.ts` was deleted; `src/utils/kie.ts` is the new client. Three transport patterns coexist (createTask polling, OpenAI-compat SSE, Veo custom endpoint).
- **Models.**
  - **Text + vision:** Gemini 3 Flash on kie (chat completions, hard-coded, no picker).
  - **Image gen:** GPT Image 2 default; picker also exposes Nano Banana 2, Flux 2 Pro, SeeDream 5 Lite, Imagen 4.
  - **Video gen:** Six models — Seedance 2.0, Seedance 2.0 Fast, Kling 3.0, Veo 3.1 Fast/Lite/Quality. Per-model duration / resolution / aspect ratio constraints. Multi-dimensional pricing (Kling: resolution × audio).
  - **TTS:** ElevenLabs v3 (`elevenlabs/text-to-dialogue-v3`), hard-coded. Voice catalog of 20 voices with gender + accent filters. Stability is a tri-state (Variable / Natural / Stable) — not a continuous slider.
- **Settings.** Two-key flow (Gemini + Google) collapsed to one kie.ai key with a Test connection button that reports remaining credits via `GET /api/v1/chat/credit`.
- **Pricing UI.** Model pickers and generate buttons now show estimated **credits**, not USD. The `usd` field has been removed from `Pricing`.
- **B-Roll → Video Studio handoff.** Each generated still in B-Roll has an "Animate in Video Studio" button that dispatches an inter-app payload. Video Studio receives it, switches to image-to-video mode, and pre-fills the first frame.
- **Voice schema migration.** Voice Studio dropped the Gemini-era `creativity` / `ambience` / `styleInstructions` fields. `bankStore.loadFromStorage` strips them from any persisted entries on load.

### Where the spec is still authoritative

- Product intent and target user (AI UGC ad creators)
- Bank schemas (Products, Models, Scripts, Voices, B-Rolls) — same shape today, just typed cleaner
- Inter-app payload pattern (`sendToApp` / `consumePayload`)
- Each app's purpose and input/output contract
- Design philosophy (dark, zinc, glass, tracking-tight)

### Where the spec is wrong / outdated

- Section 2 (OS Shell) — describes desktop + dock; we ship a sidebar
- Section 13 (Technical Architecture) — describes Gemini direct calls; we ship kie.ai
- Section 14 (Build Phases) — predates the kie.ai migration, sidebar redesign, and polish pass

For an up-to-date code-level architecture overview see `CLAUDE.md` at the project root.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [The OS Shell](#2-the-os-shell)
3. [Shared Data Banks](#3-shared-data-banks)
4. [Bank Picker Component](#4-bank-picker-component)
5. [App 1: UGC Character Studio](#5-app-1-ugc-character-studio)
6. [App 2: Image DNA Extractor](#6-app-2-image-dna-extractor)
7. [App 3: Ad Anatomy Pro](#7-app-3-ad-anatomy-pro)
8. [App 4: Script Architect Pro](#8-app-4-script-architect-pro)
9. [App 5: Voice Studio Pro](#9-app-5-voice-studio-pro)
10. [App 6: B-Roll Studio Pro](#10-app-6-b-roll-studio-pro)
11. [Inter-App Data Flow](#11-inter-app-data-flow)
12. [Design System & Aesthetic](#12-design-system--aesthetic)
13. [Technical Architecture](#13-technical-architecture)
14. [Build Phases](#14-build-phases)

---

## 1. Product Overview

### What It Is

UGC Lab is a browser-based platform styled as a macOS desktop environment. It wraps six AI-powered tools for creating realistic UGC (user-generated content) ads into one unified workspace with shared data, eliminating redundant input and enabling one-click workflows between apps.

### Core Problem Solved

The standalone versions of these apps require users to re-enter the same product details, re-upload the same character images, and manually copy-paste outputs between tools. UGC Lab eliminates this friction with shared Product, Model, Script, and Voice banks that any app can read from.

### The Six Apps

| App | Phase | Role |
|-----|-------|------|
| UGC Character Studio | Character Creation | Build AI character profiles (JSON + image) |
| Image DNA Extractor | Research / Utility | Reverse-engineer any image into structured JSON |
| Ad Anatomy Pro | Research | Deconstruct winning video ads |
| Script Architect Pro | Script Writing | Generate scripts from winning ad formulas |
| Voice Studio Pro | Voice Generation | Generate realistic AI voiceovers |
| B-Roll Studio Pro | Visual Generation | Generate B-roll image prompts per script segment |

### The Five Shared Banks

| Bank | Stores | Used By |
|------|--------|---------|
| Product Bank | Product image, name, description, target market, pain points, USPs, benefits, offer, CTA | Script Architect Pro, B-Roll Studio Pro |
| Model Bank | Character image, JSON profile, name/label, notes | UGC Character Studio, B-Roll Studio Pro, Image DNA Extractor |
| Script Bank | Script text, title/label, linked product, date | Script Architect Pro, Voice Studio Pro, B-Roll Studio Pro |
| Voice Bank | Voice name, gender, style instructions, creativity, ambience, linked model, label | Voice Studio Pro |
| B-Roll Bank | Still image, prompt, linked product/model/script, generated videos (with aspect ratios) | B-Roll Studio Pro, Finder (animate with Veo 3.1) |

---

## 2. The OS Shell

### 2.1 Desktop

When the app first loads, the user sees a clean macOS-style desktop.

**Wallpaper:** Dark, subtle gradient background. Near-black with a very soft color accent (matching the existing app aesthetic — think dark gradients with hints of deep blue or purple). Premium, minimal feel. No busy patterns.

**Desktop Folders:** Five bank folders are displayed on the desktop, arranged in a grid in the upper-left area (macOS-style icon placement):

```
┌─────────────────────────────────────────────────────┐
│  ● UGC Lab                                      🕐  │ ← Menu Bar
├─────────────────────────────────────────────────────┤
│                                                     │
│   📦 Products (3)     👤 Models (5)                 │
│                                                     │
│   📝 Scripts (8)      🎙️ Voices (2)                 │
│                                                     │
│   🎬 B-Rolls (4)                                    │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  📁  👤  🔍  🎬  ✍️  🎙️  🎞️                        │ ← Dock
└─────────────────────────────────────────────────────┘
```

**Folder behavior:**
- Each folder shows: icon, bank name, item count badge
- Single-click: selects/highlights the folder (blue highlight ring, macOS style)
- Double-click: opens the Finder app with that specific bank category pre-selected in the sidebar
- Folders are not draggable in v1 (fixed position)

### 2.2 Menu Bar

Always visible at the top of the screen. Minimal.

**Left side:**
- UGC Lab logo (small icon) + "UGC Lab" wordmark
- When an app is open: the app name appears after the logo (e.g., "UGC Lab — Script Architect Pro")

**Right side:**
- A subtle clock showing current time (reinforces the OS feel)
- Optional: a small status indicator or settings icon (v2)

**Style:** Semi-transparent dark background with blur, white text. Thin bottom border (1px, white at ~5% opacity). Height: ~32-36px.

### 2.3 Dock

Always visible at the bottom of the screen. Centered horizontally.

**Layout (left to right):**
1. Finder (folder icon)
2. *Separator/divider*
3. UGC Character Studio
4. Image DNA Extractor
5. Ad Anatomy Pro
6. Script Architect Pro
7. Voice Studio Pro
8. B-Roll Studio Pro

**Icon behavior:**
- Default state: icon at resting size, subtle, slightly muted
- Hover: icon scales up slightly (macOS magnification effect), tooltip with app name appears above
- Active app: small dot indicator below the icon (white or accent-colored)
- Click: opens that app as the main panel, or brings it to focus if already open

**Style:** Floating pill shape with glass/blur background. Rounded corners. Subtle border (white at ~10% opacity). Sits ~12px above the bottom edge of the screen. Slight shadow underneath.

**Dock height:** ~64-72px total (icon ~40-48px with padding).

### 2.4 App Panel Behavior

When a dock icon is clicked:
1. The main area (between menu bar and dock) renders that app's full UI
2. Transition: smooth fade-in or slide-up (200-300ms)
3. The menu bar updates to show the active app name
4. The dock icon gets a "running" dot indicator

**State preservation:**
- Each app maintains its state independently when switching between apps
- If a user fills in half of Script Architect Pro, switches to Voice Studio Pro, and comes back, all their work is preserved
- State is held in memory (React context/state) while apps are "running"

**Closing an app:**
- For the prototype: clicking a different app switches away. There's no explicit "close" — apps run until the page is refreshed
- For the final build: the menu bar or window could have a close button that clears the app state and returns to the desktop

**When no app is open:** The user sees the clean desktop with the bank folders.

---

## 3. Shared Data Banks

### 3.1 Product Bank

**Purpose:** Store reusable product profiles so users never have to re-enter product details across apps.

**Data schema per product:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Unique identifier |
| productImage | base64/URL | Optional | Product photo |
| productName | string | Required | e.g., "LARQ Bottle" |
| productDescription | string | Required | What it is and does |
| targetMarket | string | Required | Who it's for |
| painPoints | string | Recommended | Problems it solves |
| usps | string | Recommended | Unique selling propositions |
| benefits | string | Recommended | Outcomes for the user |
| offer | string | Optional | e.g., "50% off for 24h" |
| cta | string | Optional | e.g., "Shop Now" |
| createdAt | timestamp | Auto | Date created |

**Card display (in Finder and bank picker):**
- Product image thumbnail (or placeholder icon)
- Product name (bold)
- Target market (small subtitle)
- Completeness indicator (e.g., "7/9 fields")

**Consumed by:** Script Architect Pro (product context), B-Roll Studio Pro (product image + context)

### 3.2 Model Bank

**Purpose:** Store reusable AI character profiles so users can select a consistent character across apps without re-uploading images.

**Data schema per model:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Unique identifier |
| characterImage | base64/URL | Required | The character image (generated or uploaded) |
| jsonProfile | object | Optional | Full JSON from UGC Character Studio (physical, style, scene, pose, camera parameters) |
| name | string | Required | User-assigned label, e.g., "Sarah - Bedroom" |
| notes | string | Optional | Freeform notes |
| source | string | Auto | "character-studio", "image-dna-extractor", or "manual-import" |
| createdAt | timestamp | Auto | Date created |

**Card display:**
- Character image thumbnail
- Name/label (bold)
- Key attribute tags (e.g., "Female · 20s · Blonde") — parsed from JSON profile if available
- Source badge (e.g., "UGC Character Studio" or "Imported")

**Produced by:** UGC Character Studio (Save to Model Bank), Image DNA Extractor (optional save)
**Consumed by:** B-Roll Studio Pro (character reference image), UGC Character Studio (Load from Model Bank)

### 3.3 Script Bank

**Purpose:** Store generated or manually added scripts for reuse across voice generation and B-roll creation.

**Data schema per script:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Unique identifier |
| title | string | Required | User-assigned or auto-generated (e.g., "LARQ - Lazy Girl Hook") |
| scriptText | string | Required | Full script content |
| linkedProductId | string | Optional | Reference to a Product Bank item |
| source | string | Auto | "script-architect" or "manual" |
| createdAt | timestamp | Auto | Date created |

**Card display:**
- Title (bold)
- First 1-2 lines of script as preview (truncated)
- Linked product name (if applicable)
- Date

**Produced by:** Script Architect Pro (Save to Script Bank)
**Consumed by:** Voice Studio Pro (load script text), B-Roll Studio Pro (load script text)

### 3.4 Voice Bank

**Purpose:** Store voice configuration presets so users can instantly load their preferred voice settings.

**Data schema per voice preset:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Unique identifier |
| label | string | Required | e.g., "Sarah's chill voice" |
| voiceName | string | Required | Gemini TTS voice ID (e.g., "Leda") |
| gender | string | Required | "Female" or "Male" |
| styleInstructions | string | Required | e.g., "Conversational, like talking to a friend" |
| creativity | number | Required | Temperature value (0-2, default 1.3) |
| ambience | string | Required | "Studio" or "Small Room" |
| linkedModelId | string | Optional | Reference to a Model Bank item |
| createdAt | timestamp | Auto | Date created |

**Card display:**
- Label (bold)
- Voice name + style descriptor tag (e.g., "Leda · YOUTHFUL")
- Style instructions preview (truncated)
- Linked model name if applicable

**Produced by:** Voice Studio Pro (Save Voice Preset)
**Consumed by:** Voice Studio Pro (Load Voice Preset)

### 3.5 B-Roll Bank

**Purpose:** Store generated B-roll still images along with their prompts and metadata, enabling reuse and video animation directly from the Finder.

**Data schema per B-roll item:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Unique identifier |
| imageUrl | base64/URL | Required | The still image (generated or uploaded) |
| prompt | string | Required | The image generation prompt |
| productId | string | Optional | Reference to a Product Bank item |
| modelId | string | Optional | Reference to a Model Bank item |
| scriptId | string | Optional | Reference to a Script Bank item |
| videoUrl | string | Optional | Most recent generated video URL |
| videos | BRollVideo[] | Optional | History of all generated videos |
| createdAt | timestamp | Auto | Date created |

**BRollVideo sub-schema:**

| Field | Type | Notes |
|-------|------|-------|
| url | string | Video data URL |
| aspectRatio | string | "9:16" or "16:9" |
| createdAt | timestamp | When this video was generated |

**Card display (in Finder):**
- Still image at original aspect ratio (no cropping, no black bars)
- Download button overlay on hover
- Delete button overlay on hover
- Video count badge (if videos exist)
- Click to open detail/edit view

**Detail view (BRollForm):**
- Full still image preview at original aspect ratio with Replace button
- Editable prompt textarea
- Save Changes button
- Animate section (Veo 3.1 fast frame-to-video):
  - Aspect ratio selector: 9:16 (Portrait) or 16:9 (Landscape)
  - Animate button — uses the still as first frame + prompt
  - Video carousel for past generations with navigation arrows
  - Thumbnail strip for jumping between videos
  - Download button per video
  - Auto-persists new videos to store immediately

**Produced by:** B-Roll Studio Pro ("Save to B-Roll Bank" button), Manual creation in Finder
**Consumed by:** Finder (view, edit, animate with Veo 3.1)

---

## 4. Bank Picker Component

The Bank Picker is a universal, reusable UI component that slides in from the right side of the screen whenever any app needs the user to select an item from a bank.

### Trigger

Any button labeled "Select Product," "Select Model," "Select Script," or "Load Voice Preset" inside any app.

### Appearance

- Slides in from the right edge
- Width: approximately 35-40% of the screen
- Height: full height of the app panel (menu bar to dock)
- Semi-transparent dark backdrop dims the rest of the app (click backdrop to close)
- Panel has its own subtle background with blur

### Layout

```
┌──────────────────────────┐
│  ✕  Select Product       │ ← Header with title + close button
├──────────────────────────┤
│  🔍 Search...            │ ← Search/filter bar
├──────────────────────────┤
│                          │
│  ┌────────────────────┐  │
│  │ 📷 LARQ Bottle     │  │ ← Item cards
│  │ Health-conscious... │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ 📷 PulsePro        │  │
│  │ Athletes who...    │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ + Add New Product   │  │ ← Quick-add option
│  └────────────────────┘  │
│                          │
│  ─────────────────────── │
│  📁 Manage in Finder     │ ← Link to full bank management
└──────────────────────────┘
```

### Interaction Flow

1. User clicks "Select Product" (or Model, Script, Voice) inside an app
2. Bank picker slides in from the right (300ms ease-out animation)
3. Shows all items in the relevant bank as compact cards
4. User can search/filter with the search bar at the top
5. User clicks an item → item is selected → picker slides closed → app fields populate with that data
6. Alternatively: user clicks "Add New" to quick-create an item without leaving the app
7. Alternatively: user clicks "Manage in Finder" to open the full Finder view for that bank
8. Clicking the backdrop or ✕ button closes the picker without selecting anything

---

## 5. App 1: UGC Character Studio

### Role in Workflow

Build AI character profiles by selecting parameters across 5 categories. Generates a visualization and structured JSON prompt. Characters are saved to the Model Bank.

### What Changes from Standalone Version

Minimal UI changes — the builder interface is already well-designed. The key additions are saving to Model Bank and loading from Model Bank.

### User Flow

1. User opens UGC Character Studio from dock
2. **Left panel — sidebar navigation:** 5 tabs (Physical, Style, Scene, Pose & Action, Camera) — identical to standalone
3. **Left panel — controls area:** Parameter inputs with chip selections — identical to standalone
4. **Left panel — sidebar bottom:**
   - Preset buttons: "Car Interior" and "Default Model" (same as standalone)
   - **NEW: "Load from Model Bank"** button — opens Bank Picker showing saved models. Selecting one loads that model's JSON parameters back into all fields, so the user can tweak and generate a new variation
   - "Clear All Parameters" button (same as standalone)
   - Light/Dark mode toggle (same as standalone)
5. **Left panel — bottom:** "Generate Visualization" button (same as standalone)
6. **Right panel — output:**
   - Generated character image (same as standalone)
   - JSON prompt data with "Copy" button (same as standalone)
   - **NEW: "Save to Model Bank"** button — prompts for a name/label (e.g., "Sarah - Bedroom Setup"), saves image + JSON profile to Model Bank, shows confirmation toast

### What Stays the Same

- All 5 tab categories and every parameter/chip option
- The preset system (Car Interior, Default Model)
- The generate button and visualization output
- The JSON output format
- Light/dark mode toggle

### Bank Integration

- **Consumes:** Model Bank (optional — Load from Model Bank to use as starting point)
- **Produces:** Model Bank entries (image + JSON profile)

### Layout

Same split layout as standalone:
- Left column (~50%): Sidebar nav + controls panel + generate button
- Right column (~50%): Generated image + JSON output + save button

---

## 6. App 2: Image DNA Extractor

### Role in Workflow

Utility/research tool. Upload any image, get its "Visual DNA" as structured JSON. Sits outside the main production pipeline but feeds into Model Bank and UGC Character Studio.

### What Changes from Standalone Version

Minimal. The core upload → analyze → JSON output flow stays the same. New additions are save-to-bank options on the output.

### User Flow

1. User opens Image DNA Extractor from dock
2. **Left panel — input:**
   - Upload zone: Drag & drop or click to upload an image (JPG, PNG, WEBP)
   - After upload: image preview with "Clear & Upload New" button
   - Analysis runs automatically on upload (same as standalone)
3. **Right panel — output:**
   - "Visual DNA" JSON viewer with expandable sections (Subject, Attire, Environment, Lighting, Camera)
   - "Copy Prompt" button (same as standalone)
   - **NEW: "Save to Model Bank"** button — visible when the analyzed image appears to be a person/character. Saves the image + extracted JSON to Model Bank, prompts for a name/label
   - **NEW: "Use in Character Studio"** button — sends extracted parameters to UGC Character Studio as a starting point for building/tweaking a character

### Bank Integration

- **Consumes:** Nothing
- **Produces:** Model Bank entries (optional — save analyzed images with their DNA)

### Layout

Same split layout as standalone:
- Left column (~50%): Upload zone / image preview
- Right column (~50%): JSON output + action buttons

---

## 7. App 3: Ad Anatomy Pro

### Role in Workflow

Research entry point. Users upload competitor or high-performing video ads to understand what makes them work. Outputs feed into Script Architect Pro.

### What Changes from Standalone Version

Minimal changes. Ad Anatomy Pro is the most independent app — it analyzes external ads, so it doesn't consume data from any banks. The key additions are "Send to" buttons on its outputs.

### User Flow

1. User opens Ad Anatomy Pro from dock
2. **Upload View:** Drag & drop or click to upload a video file (MP4, MOV, WebM, max 20MB). Video preview appears with file info.
3. User clicks **"Decode Creative"** button
4. **Loading state:** Spinner + "Gemini is dissecting the ad with brutal precision" + greyscale video preview
5. **Results View:** Split layout — video player pinned on the left, scrollable analysis on the right

### Output Sections (unchanged)

1. **Scorecard** — Hook Strength, Structure Clarity, Visual Variety, Persuasion Depth, Overall Execution (each /10) + Analyst's Note
2. **Transcript** — Full timestamped transcript with Copy button
3. **Hook Breakdown** — The hook text, technique, why it works, adaptable template
4. **Structure Map** — Runtime, pacing, beat-by-beat breakdown table
5. **Psychology & Persuasion** — Primary levers, targeting signals
6. **Visual Playbook** — Timestamped visual prompts for each frame
7. **Opportunities for Improvement** — Specific weaknesses with fixes
8. **AI Reconstruction Prompt** — Copy-paste prompt for generating a new script

### New Actions (OS Integration)

**On the Transcript section:**
- Existing: "Copy" button
- **New: "Send to Script Architect Pro"** button → saves transcript text, switches to Script Architect Pro, auto-populates the "Winning Script Transcript" field

**On the AI Reconstruction Prompt section:**
- Existing: "Copy Prompt" button
- **New: "Send to Script Architect Pro"** button → same behavior but pastes the reconstruction prompt

**On the results header area:**
- **New: "Analyze Another"** button (already exists in standalone) — resets to upload view

### Bank Integration

- **Consumes:** Nothing
- **Produces:** Feeds Script Architect Pro via "Send to" buttons (no bank storage needed in v1)

### Layout

Same split layout as standalone:
- Left column (~320px): Fixed video player + file info + "Analyze Another" button
- Right column (remaining): Scrollable analysis results

---

## 8. App 4: Script Architect Pro

### Role in Workflow

Takes a winning ad transcript (from Ad Anatomy Pro or pasted manually) + product context (from Product Bank) and generates a new script modeled on the winning structure.

### What Changes from Standalone Version

**Major change:** The entire Step 02 product details form (7+ fields) is replaced by a single Product Bank selection. This is the biggest UX improvement in the whole OS.

### User Flow

1. User opens Script Architect Pro from dock
2. **Left panel — Step 01: Winning Script**
   - Textarea for pasting a winning script transcript
   - May already be pre-filled if user clicked "Send to Script Architect Pro" from Ad Anatomy Pro
   - Label: "Winning Script Transcript"
   - Placeholder: "Paste transcript here..."
3. **Left panel — Step 02: Product Context**
   - **"Select Product" card/button** at the top of this section
   - Clicking it opens the Bank Picker (slides in from right) showing saved products
   - After selection: the product card displays inline showing product image, name, and an expandable "Details" section showing all loaded fields
   - **Below the product card:** A small "Additional context for this script" textarea for one-off instructions specific to this particular script (e.g., "Focus on the self-cleaning feature" or "This is for a summer campaign")
   - If no products exist in the bank: the "Select Product" button shows a message like "No products yet — add one in Finder" with a link
4. **Left panel — Generate button:** "Generate Script" (same as standalone)
5. **Right panel — Output:**
   - Generated script text display
   - **"Copy Script"** button (same as standalone)
   - **NEW: "Save to Script Bank"** button — saves script with auto-linked product reference, prompts for a title
   - **NEW: "Send to Voice Studio"** button — switches to Voice Studio Pro with script pre-loaded in the text field
   - **NEW: "Send to B-Roll Studio"** button — switches to B-Roll Studio Pro with script pre-loaded

### What's Removed

- Product Name input field → replaced by Product Bank
- Target Market input field → replaced by Product Bank
- Product Description textarea → replaced by Product Bank
- Pain Points textarea → replaced by Product Bank
- USPs textarea → replaced by Product Bank
- Benefits textarea → replaced by Product Bank
- Offer input → replaced by Product Bank
- CTA input → replaced by Product Bank
- Product Image upload → replaced by Product Bank
- Context Profile upload → can be incorporated into Product Bank or dropped for v1

### Bank Integration

- **Consumes:** Product Bank (product details + image)
- **Produces:** Script Bank entries (via "Save to Script Bank")

### Layout

Same split layout as standalone:
- Left column (~50%): Inputs (winning script + product selection + additional context + generate button)
- Right column (~50%): Output (generated script + action buttons)

---

## 9. App 5: Voice Studio Pro

### Role in Workflow

Converts scripts into realistic AI voiceovers. Pulls scripts from the Script Bank and voice configurations from the Voice Bank.

### What Changes from Standalone Version

Two new integrations: loading scripts from Script Bank, and saving/loading voice presets from Voice Bank. The core voice generation interface stays the same.

### User Flow

1. User opens Voice Studio Pro from dock
2. **Left sidebar — controls:**
   - **NEW at top: "Load Voice Preset"** button → opens Bank Picker showing saved voice presets → selecting one auto-fills: voice selection, style instructions, creativity, and ambience
   - Creativity slider (same: 0-2, default 1.3)
   - Room Ambience toggle: Studio / Small Room (same)
   - Voice Selection: Gender toggle (Female/Male) + scrollable voice list (same)
3. **Center panel — editor:**
   - Style Instructions textarea (same, but may be pre-filled from voice preset)
   - **Script Text section:**
     - **NEW: "Select from Script Bank"** button above the textarea → Bank Picker slides in → pick saved script → text populates
     - Or the text is already pre-filled if user clicked "Send to Voice Studio" from Script Architect Pro
     - Or user types/pastes manually (same as standalone)
   - "Generate Audio" floating button (same)
4. **Right sidebar — Generated History:**
   - Same as standalone: play/pause, download, delete for each generation
   - Each item shows voice name, ambience tag, timestamp, text preview, waveform visualizer
   - **NEW:** On each history item, a **"Save Voice Preset"** button that captures the current voice + style + creativity + ambience settings to the Voice Bank (prompts for a label)

### What Stays the Same

- The 3-column layout (controls | editor | history)
- All 30 voices (14 female, 16 male) with their style descriptors
- Creativity slider behavior
- Room ambience options
- Audio generation, playback, waveform visualization, and download
- Generation history panel

### Bank Integration

- **Consumes:** Script Bank (load script text), Voice Bank (load voice presets)
- **Produces:** Voice Bank entries (save voice presets)

### Layout

Same 3-column layout as standalone:
- Left sidebar (~340px): Voice controls
- Center (flex): Style instructions + script text + generate button
- Right sidebar (~400px): Generation history

---

## 10. App 6: B-Roll Studio Pro

### Role in Workflow

Takes a product, character, and script, then generates 3 B-roll image prompt variations per script segment. This is where all the banks converge.

### What Changes from Standalone Version

**Major change:** All four manual inputs (product image upload, character image upload, product context textarea, script textarea) are replaced by bank selections. This is the second biggest UX improvement after Script Architect Pro.

### User Flow

1. User opens B-Roll Studio Pro from dock
2. **Left panel — inputs (restructured):**
   - **"Select Product"** card/button → Bank Picker → selects product → loads product image + product context
   - **"Select Model"** card/button → Bank Picker → selects model → loads character image
   - **"Select Script"** card/button → Bank Picker → selects script → loads script text
   - Or the script is pre-filled if user clicked "Send to B-Roll Studio" from Script Architect Pro
   - **"Additional context"** textarea below the three selections — for one-off notes (optional)
   - **"Generate B-Roll Prompts"** button at bottom
3. **Right panel — output (unchanged):**
   - Scene count header (e.g., "7 SCENES")
   - Scene-by-scene output, each with:
     - Scene number + type tag (A-ROLL CHARACTER OR PRODUCT, etc.)
     - Script line in italics
     - 3 prompt variations:
       - Option 1: LITERAL / ACTION
       - Option 2: EMOTIONAL / REACTION
       - Option 3: PRODUCT / DETAIL
     - Copy button on each prompt

### What's Removed

- Product Image upload → replaced by Product Bank selection
- A-Roll Character Image upload → replaced by Model Bank selection
- Product Context textarea → replaced by Product Bank data
- UGC Script textarea → replaced by Script Bank selection (or pre-filled via "Send to")

### Bank Integration

- **Consumes:** Product Bank (image + context), Model Bank (character image), Script Bank (script text)
- **Produces:** B-Roll Bank entries (via "Save to B-Roll Bank" on each generated image)

### Image Generation & Save Flow

Each prompt variation has a "Generate Image" button that uses Gemini image generation (model: `gemini-3.1-flash-image-preview`) with optional reference images (product + model). Once generated, a "Save to B-Roll Bank" button appears that saves the image + prompt + linked product/model/script IDs to the B-Roll Bank. The button shows a green "Saved" confirmation for 2 seconds.

### Video Animation (via Finder)

Video animation from stills is handled in the Finder's B-Roll detail view (BRollForm), not in B-Roll Studio Pro. Users:
1. Generate images in B-Roll Studio Pro and save to B-Roll Bank
2. Open the B-Roll item in Finder to animate it using Veo 3.1 fast frame-to-video
3. The still image becomes the first frame; the prompt drives the animation

### Layout

Same split layout as standalone:
- Left column (~50%): Three bank selections + additional context + generate button
- Right column (~50%): Scene-by-scene prompt output with image generation + save to bank

---

## 11. Inter-App Data Flow

### Complete Flow Map

```
                            ┌─────────────────┐
                            │  PRODUCT BANK   │
                            │  (shared data)  │
                            └────────┬────────┘
                                     │ product context + image
                         ┌───────────┼───────────┐
                         ▼           ▼           ▼
┌──────────────┐   ┌──────────┐  ┌────────┐  ┌──────────┐
│ Ad Anatomy   │──▶│ Script   │  │ B-Roll │  │          │
│ Pro          │   │ Architect│─▶│ Studio │  │          │
│              │   │ Pro      │  │ Pro    │  │          │
│ (transcript) │   └────┬─────┘  └──┬─▲───┘  │          │
└──────────────┘        │           │ │      │          │
                        │ script    │ │model │          │
                        ▼           │ │      │          │
                  ┌──────────┐  ┌───┘ └────┐ │          │
                  │ SCRIPT   │  │ MODEL    │ │          │
                  │ BANK     │  │ BANK     │◀┤          │
                  └────┬─────┘  └────▲─────┘ │          │
                       │             │       │          │
                       │ script      │model  │          │
                       ▼             │       │          │
                  ┌──────────┐  ┌────┴──────┐│          │
                  │ Voice    │  │ UGC       ││ Image DNA│
                  │ Studio   │  │ Character ││ Extractor│
                  │ Pro      │  │ Studio    │└──────────┘
                  └────┬─────┘  └───────────┘
                       │
                       ▼
                  ┌──────────┐       ┌──────────┐
                  │ VOICE    │       │ B-ROLL   │
                  │ BANK     │       │ BANK     │◀── B-Roll Studio Pro (save images)
                  └──────────┘       └────┬─────┘
                                         │
                                         ▼
                                   ┌───────────┐
                                   │  Finder   │
                                   │ (animate  │
                                   │ via Veo)  │
                                   └───────────┘
```

### "Send to" Actions Summary

| From | Action | To | What's Transferred |
|------|--------|----|--------------------|
| Ad Anatomy Pro | "Send to Script Architect Pro" (transcript) | Script Architect Pro | Transcript text → Winning Script field |
| Ad Anatomy Pro | "Send to Script Architect Pro" (prompt) | Script Architect Pro | Reconstruction prompt → Winning Script field |
| Script Architect Pro | "Send to Voice Studio" | Voice Studio Pro | Script text → Text field |
| Script Architect Pro | "Send to B-Roll Studio" | B-Roll Studio Pro | Script text → Script field |
| Image DNA Extractor | "Use in Character Studio" | UGC Character Studio | Extracted parameters → parameter fields |

### "Save to Bank" Actions Summary

| From | Action | Saved To | What's Saved |
|------|--------|----------|-------------|
| Script Architect Pro | "Save to Script Bank" | Script Bank | Script text + title + linked product |
| UGC Character Studio | "Save to Model Bank" | Model Bank | Character image + JSON profile + name |
| Image DNA Extractor | "Save to Model Bank" | Model Bank | Analyzed image + extracted JSON + name |
| Voice Studio Pro | "Save Voice Preset" | Voice Bank | Voice + style + creativity + ambience + label |
| B-Roll Studio Pro | "Save to B-Roll Bank" | B-Roll Bank | Still image + prompt + linked product/model/script IDs |
| Finder (B-Roll detail) | "Animate" (Veo 3.1) | B-Roll Bank | Generated video added to item's video history |

---

## 12. Design System & Aesthetic

### Overall Aesthetic

The existing apps share a consistent dark-first design language. The OS shell should feel like a natural container for them, not a redesign.

**Core principles:**
- Dark-first: near-black backgrounds (#050505 to #0A0A0A range)
- Subtle gradients: radial gradients with very muted color hints
- Glass/blur effects: backdrop-blur on panels, dock, menu bar
- Minimal color: white/zinc text hierarchy with sparse accent colors
- Tight tracking: font-tracking-tight across the board
- Thin borders: 1px borders at white/5 to white/10 opacity

### Color System

**Backgrounds:**
- Desktop wallpaper: custom dark gradient
- Menu bar: semi-transparent dark with blur (#09090b at ~80% + backdrop-blur)
- Dock: semi-transparent dark with blur (similar to menu bar)
- App panels: inherit from individual app styles (each app has its own subtle background treatment)

**Text:**
- Primary: white (#FFFFFF) or near-white
- Secondary: zinc-400 (#A1A1AA)
- Muted: zinc-500 (#71717A) to zinc-600
- Disabled: zinc-700 (#3F3F46)

**Accent colors per app (preserved from standalone):**
- UGC Character Studio: Sky blue (#0ea5e9)
- Image DNA Extractor: Neon green (custom --neon variable)
- Ad Anatomy Pro: Red/orange gradient (red-500 to orange-500)
- Script Architect Pro: Blue (#2563eb)
- Voice Studio Pro: Indigo (#6366f1)
- B-Roll Studio Pro: White/neutral

**Borders:** white at 5-10% opacity for subtle separation

### Typography

- Font family: DM Sans (loaded via Google Fonts)
- Headings: font-bold, tracking-tight
- Body: font-light to font-normal, tracking-tight
- Labels/metadata: text-xs, uppercase, tracking-wider or tracking-widest
- All text: zinc color scale

### Shared Component Styles

**Buttons (primary action):**
- Rounded-full (pill shape)
- App accent color background
- White text, font-semibold
- Shimmer hover effect (translucent white gradient sweep)
- Subtle glow/shadow in dark mode

**Cards (bank items):**
- bg-white/5 or bg-zinc-900/40
- border border-white/5
- rounded-xl
- Hover: border-white/10, slight background brightening
- Padding: p-4

**Input fields:**
- bg-transparent or bg-white/5
- border border-white/10
- rounded-xl
- Focus: border-white/20
- Placeholder text: zinc-600

### The "UGC Lab | App Name" Header Pattern

In the standalone apps, each has a header pill showing "UGC Lab | App Name". In the OS version:
- **Remove** the individual app header pills
- The menu bar handles app identification globally
- Each app panel can optionally have a subtle section header at the top of its content area, but not the full branded pill

---

## 13. Technical Architecture

### Stack

- **Framework:** React + TypeScript
- **Styling:** Tailwind CSS
- **AI Backend:** Google Gemini API via unified client (`src/utils/gemini.ts`):
  - Text: `gemini-3-flash-preview` (analysis, script gen, scene decomposition, image DNA)
  - Image: `gemini-3.1-flash-image-preview` (B-roll image generation with reference images)
  - Video: `veo-3.1-fast-generate-preview` (frame-to-video animation via `predictLongRunning` + polling)
  - TTS: `gemini-2.5-flash-preview-tts` (voice generation)
- **State Management:** React Context or Zustand for shared state (banks + inter-app communication)
- **Data Persistence:** localStorage for the prototype; backend/database for production

### State Architecture

```
appStore (Zustand)
├── activeApp: string | null
├── runningApps: string[]
├── interAppPayload: { targetApp, targetField, data } | null
├── launchApp(id)
├── consumePayload()
└── setPayload(...)

bankStore (Zustand — persisted to localStorage)
├── products: Product[]
├── models: Model[]
├── scripts: Script[]
├── voices: VoicePreset[]
├── brolls: BRoll[]
├── add/update/delete/getById for each bank type
└── loadFromStorage() / saveToStorage()

settingsStore (Zustand — persisted to localStorage)
├── apiKey: string
├── setApiKey(key)
└── getApiKey()  // throws if not set
```

Each app's internal state lives in React component state (not in global stores). App state is preserved while the app is "running" (mounted but hidden) and lost on page refresh.

### Key Implementation Notes

**App switching:** Each app component is rendered but only the active one is visible (using CSS display or conditional rendering with state preservation). This ensures state is maintained when switching.

**"Send to" mechanism:** When a user clicks "Send to Script Architect Pro":
1. Set `interAppPayload` with the target app, target field, and data
2. Set `activeApp` to the target app
3. The target app reads and consumes the payload on mount/focus, populating the relevant field
4. Clear the payload

**Bank Picker:** A single reusable component that:
- Accepts a `bankType` prop ("products" | "models" | "scripts" | "voices" | "brolls")
- Reads from the appropriate bank in global state
- Returns the selected item via a callback
- Any app can invoke it

**Data persistence (prototype):** localStorage with JSON serialization. Banks are loaded on app start and saved on every change. Individual app states are kept in memory only (lost on refresh).

**Data persistence (production):** Backend API with a database. User authentication, cloud storage for images, proper CRUD operations.

---

## 14. Build Phases

### Phase 1: OS Shell + Banks (Foundation)

Build first because everything else depends on it.

**Deliverables:**
- Desktop with wallpaper
- Menu bar (logo, app name, clock, settings gear)
- Dock with all 7 icons (Finder + 6 apps) with hover effects and active indicators
- Finder app with 5 bank categories (Product, Model, Script, Voice, B-Roll)
- Full CRUD for each bank (add, view, edit, delete items)
- B-Roll detail view with Veo 3.1 animation (BRollForm)
- Bank Picker slide-in component
- Desktop folder icons that open Finder to specific banks
- App switching mechanism with state preservation
- localStorage persistence for banks
- Settings modal for API key configuration

### Phase 2: UGC Character Studio + Image DNA Extractor (Character Pipeline)

**Deliverables:**
- UGC Character Studio (full standalone functionality + "Save to Model Bank" + "Load from Model Bank")
- Image DNA Extractor (full standalone functionality + "Save to Model Bank" + "Use in Character Studio")

### Phase 3: Ad Anatomy Pro + Script Architect Pro (Research & Script Pipeline)

**Deliverables:**
- Ad Anatomy Pro (full standalone functionality + "Send to Script Architect Pro" buttons)
- Script Architect Pro (full functionality with Product Bank integration replacing manual fields + "Save to Script Bank" + "Send to Voice/B-Roll Studio" buttons)

### Phase 4: Voice Studio Pro + B-Roll Studio Pro (Production Pipeline)

**Deliverables:**
- Voice Studio Pro (full functionality + Script Bank integration + Voice Bank save/load)
- B-Roll Studio Pro (full functionality with Product Bank + Model Bank + Script Bank integration replacing all manual inputs + image generation + Save to B-Roll Bank)

### Phase 5: Polish & Integration Testing

**Deliverables:**
- End-to-end workflow testing (Ad Anatomy Pro → Script Architect Pro → Voice Studio Pro → B-Roll Studio Pro)
- Transition animations between apps
- Empty states and onboarding hints
- Error handling and edge cases
- Performance optimization

---

*Last Updated: March 11, 2026*
*Version: 1.2 — Renamed to UGC Lab, reordered apps, renamed Character Studio → UGC Character Studio, Script Architect → Script Architect Pro, updated font to DM Sans*
