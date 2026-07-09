# UI_LAYOUT.md — UGC OS interface map

A spatial reference for the rendered UI, so an automated session can locate a
control without guessing. Every claim here is grounded in the JSX; `file:line`
anchors are given so it stays verifiable when the code moves. Source code is the
source of truth — if a label here disagrees with the code, the code wins and
this file is stale (fix it).

**Reading the geometry words.** "Left/right" = horizontal position in a pane;
"top→bottom" = vertical render order; "leading/trailing" inside a row = start/end
of a flex row. Desktop (`md`+) layout is described first; every app collapses to a
single stacked column below `md`, with the generate button pinned to the bottom of
the viewport (`fixed bottom-0 … md:static`).

---

## 1. Global frame

macOS-style shell: a thin **menu bar** pinned top, a floating **dock** pinned
bottom-center, and the active app inside a rounded, bordered **window** floating
between them. `src/App.tsx:102` → `Workspace`.

```
┌─────────────────────────────────────────────────────────────┐
│ MENU BAR   logo · UGC OS · <active app>     credits · links  │  fixed top (h-9)
├─────────────────────────────────────────────────────────────┤
│    ┌───────────────────────────────────────────────────┐    │
│    │  ACTIVE APP  (rounded window; desktop gradient      │    │
│    │  peeks around it; empty state until an app opens)   │    │
│    └───────────────────────────────────────────────────┘    │
│              ┌──────── DOCK (floating) ────────┐             │  fixed bottom-center
└──────────────┴─────────────────────────────────┴────────────┘
```

- The **window** is `absolute inset-x-2 top-11 bottom-[108px]` — a rounded,
  bordered, blurred frame; app chrome clips at its edge instead of butting against
  a gutter (`App.tsx:122`).
- Apps are code-split and kept mounted once opened, toggled by opacity, so all
  open apps share the window rectangle and switching back is instant
  (`App.tsx:133`). No app active → centered **empty state** ("Pick a tool from the
  dock to get started").
- The old left **sidebar + mobile burger drawer are gone** — the dock is the sole
  navigation at every screen size (it scrolls horizontally when it can't fit).
  `Sidebar.tsx` / `auth/UserMenu.tsx` still exist as files but are no longer
  rendered anywhere.
- Toasts render bottom-stacked via `ToastContainer` (`App.tsx:157`).

### 1.1 Menu bar — `src/components/MenuBar.tsx`

Thin (`h-9`) top chrome — branding + status only, **no navigation**. Left→right:

- **Leading:** app logo + "UGC *OS*" wordmark (a **button** — clicking it reopens
  the **Meet your team** intro, macOS "About This Mac" style), then the **active
  app's name** (like macOS naming the frontmost app beside the logo).
- **Trailing:** a **Meet your team** button (explicit twin of the wordmark click),
  then a **streak** chip (flame + "N day streak", only while a generation streak
  is live; click opens the Dashboard), then the **credits** balance ("`<n>` credits left"; coin glyph swaps to a
  spinner, click refreshes — polls on mount + 60s + window focus; shows "—" until a
  kie.ai key is set), then external links **Get Credits** (kie.ai billing) and
  **Community** (Skool). These trailing items are `sm:`+ only — hidden on phones.

### 1.2 Dock — `src/components/Dock.tsx`

Floating glassy rounded bar, bottom-center. Left→right, app tiles grouped by
category with inset hairline **dividers** between groups (`SECTION_ORDER =
system · library · create · tools`, order from `APP_REGISTRY`, `constants.ts`):

- **System:** Dashboard (green; also the default landing page — fresh visits
  redirect to `/dashboard`).
- **Library:** Bank.
- **Create:** Ad Analyzer · Characters · Scripts · Voiceovers · B-Roll ·
  Playground (analyzer leads the group — no divider between it and Characters).
- divider → **utility cluster:** a **theme** tile (dark↔light quick toggle; System
  is Settings-only) + a **Settings** tile (opens the Settings modal).

Each item is a colored macOS-style app icon (accent fill + sheen) over an
always-visible label, with a running/active **dot** underneath. Hover gives a
subtle lift and **cross-fades the tile glyph to the app's crab persona sprite**
(label text never changes; roster in `src/utils/team.ts`, tooltip shows "Name ·
Role"); there is **no click-press animation**. While an app has a generation in
flight the dot **pulses in the app's accent** (apps report via
`useReportActivity` into `stores/activityStore.ts`; lazy-mounted apps only
report once opened that session). **Admin is not in the dock** (its
`category: 'admin'` is excluded from `SECTION_ORDER`) — it lives in Settings.

Note the **two namespaces**: dock display names vs the internal app/folder ids
(`constants.ts:30`). `Bank`→`finder`, `Characters`→`character-studio`,
`Scripts`→`script-architect`, `Voiceovers`→`voice-studio`, `B-Roll`→`broll-studio`,
`Ad Analyzer`→`ad-anatomy`.

### 1.3 Settings modal — `src/components/SettingsModal.tsx`

A single centered scrolling modal (NOT tabbed), opened from the dock's Settings
tile. Header ("Settings" + ✕ top-right, `SettingsModal.tsx:196`), then top→bottom:

1. **kie.ai API key** — label + "Get key" link, masked input, "Test connection"
   button + result, full-width **Save** button.
2. **Appearance** — Dark / Light / System segmented toggle.
3. **Your team** — a "Meet your team" button that closes Settings and replays
   the Meet your team intro (§1.4).
4. **Storage** (cloud mode only) — usage bar + manual orphan-cleanup flow
   (confirm → scan → purge).
5. **Legal** footer links (Terms · Privacy · AUP · DMCA), open in a new tab.
6. **Account** (cloud + signed-in) — email + avatar, **Sign out** button.
7. **Admin** (admins only) — an "Open Admin panel" row; the **only** entry point
   to the Admin app now that it's out of the dock.
8. **Demo-data** tool (admin / local-only), tiny + low-contrast at the very bottom.

### 1.4 Meet your team intro — `src/components/MeetTheTeam.tsx`

Centered onboarding modal ("Meet your *team*") framing the seven dock apps as
a named production crew (roster data in `src/utils/team.ts`) — one pixel-art
crab mascot per app (`src/components/CrabSprite.tsx`), each in a role costume,
labelled "Name · Role" (kept to a single line — `whitespace-nowrap`, card
width sized to the longest label): Bank = Sandy · Studio Manager (green
visor), Characters = Clawdia · Casting Director (shades), Scripts = Pinchy ·
Copywriter (pencil), Voiceovers = Echo · Voice Talent (headphones), B-Roll =
Bubbles · Videographer (backwards cap), Playground = Sebastian · Creative
Director (beret + paint), Ad Analyzer = Scout · Strategist (magnifying glass).
Cards sit in dock order on accent-tinted tiles; clicking one opens that app.
Below the roster, a compact horizontal **fuel row** — a golden sun-rayed `kie`
crab variant + "kie.ai credits keep your team fed" + three one-line steps (get
key → paste in Settings → top up via Get Credits) — sized so the modal fits
without scrolling. **Auto-opens once per browser** (`ugc-lab:team-intro-seen`
in localStorage, state in `appStore.teamIntroOpen`); reopens from the menu bar
wordmark, the menu bar's "Meet your team" item, or Settings → Your team.
Dismiss via ✕, backdrop, Escape, or the "Let's get to work" button.

### 1.5 Shared control idioms

- **SegmentedToggle** (`src/components/SegmentedToggle.tsx`) — the house tab/pill
  control used for nearly every mode switch and Output/History tab. Rounded-full
  track, equal-width segments, a sliding active pill. When you read "tabs" or "a
  toggle" below, it's this component, and the **left-to-right option order is the
  array order** in code.
- **Model picker** (`src/components/ModelPicker.tsx`) — a pill button (model
  icon + name + credits + chevron) that opens an **inline dropdown anchored to the
  pill** (`absolute … bottom-full`/`top-full`, opens upward in footers, scrollable
  ~360px). The dropdown is a list of model rows: icon + name + credits + a check on
  the active model. It is **NOT** a right-edge slide-over. Verified in Characters
  (Nano Banana 2 / GPT Image 2 ✓ / Seedream Lite); same component in B-Roll's card
  modal and Playground.
- **Preset / style / voice / bank-ref slide-overs** — the Characters scoped preset
  pickers ("Physical Presets" / "Scene & Pose Presets"), "Select a style", "UGC
  Prompt Presets", the voice picker, and "Select from bank" pickers open as
  **right-edge slide-over panels** (roughly the right half of the viewport, ✕
  top-right), with a titled header and a card grid (e.g. a STARTERS recipe grid over
  a BANK section). These are distinct from the model-picker dropdown above.
- **Generate button** — every Create/Tool app's primary action is a full-width
  pill at the **bottom of the left control column**, accent-filled in the app's
  family color, with the credit cost in the label.

---

## 2. Bank (Finder) — `src/apps/finder/`

Single full-width column: a header toolbar over a scrolling card area.
`Finder.tsx:215` (header), `:270` (content).

### Header toolbar (`Finder.tsx:215`, `lg:justify-between`)

- **Leading (left):** bank-type tabs, left→right: **Products · Characters ·
  Scripts · Voices · B-Rolls** (each with a count badge). `Finder.tsx:217`.
- **Trailing (right):** in order — **Sort** control (pill+chevron, e.g. "Newest
  first"; only when the active bank has items) → **Bulk add** (Products bank only)
  → **Add** (filled pill, always). `Finder.tsx:229`–`262`.

### Card area (`src/apps/finder/BankList.tsx`)

- **Products** — square cards, `grid-cols-2 → 5`. Status dot top-left
  (orange=draft / green=confirmed / "Extracting" badge), title on a bottom
  gradient, download + star + delete top-right on hover.
- **Characters (models)** — portrait `9/16` cards, dense masonry `grid-cols-2 →
  6`; landscape sheets span 2–3 cols (`aspect-video`). Badges top-left ("Sheet" /
  "Preset"), copy-JSON + download + star + delete top-right.
- **Scripts** — tall `9/16` text cards `grid-cols-2 → 4`: a SCRIPT/SCENES badge +
  title at top, faded body preview, product + date footer, star + delete top-right.
- **Voices** — NOT a grid; a vertical list of rounded-full horizontal pills (mic
  avatar + label + voice name + stability), delete trailing.
- **B-Rolls** — portrait `9/16` dense grid `grid-cols-2 → 6`, grouped under date
  pills; download + star + delete top-right on hover; "Animate in Playground"
  pill appears on hover (stills only).

Star buttons (products / characters / scripts / b-rolls) are hover-revealed but
stay visible (filled amber) once starred; starred items sort first in every bank
picker slide-over, marked with a small amber star badge.

### Add/Edit Product form (`src/apps/finder/ProductForm.tsx`)

Header (title + ✕). Two columns on `lg`: **left** = square product image (with
Change / Download overlays, or a dashed drop-to-autofill box); **right** = fields,
top→bottom: **Product Name\*, Description\*, Target Market, Pain Points, USPs,
Benefits, Offer, CTA**. Sticky footer holds the submit button ("Add Product" /
"Save Changes").

---

## 3. Characters (Character Studio) — `src/apps/character-studio/`

**Two panes** split 50/50 (`CharacterStudio.tsx`): **left = controls**, **right =
output gallery**. (The dock/bank label is now **Characters** — the internal app id,
folder, and types keep the `character` naming.)

### Left controls (`components/ControlsPanel.tsx` + `GenerateBar.tsx`), top→bottom

1. **Field-group tabs** — segmented toggle with **exactly two** options:
   **Physical** and **Scene & Pose** (`ControlsPanel.tsx:201`). Clicking scroll-jumps
   to that tab's field block; an IntersectionObserver keeps the active tab in sync
   as you scroll.
   - ⚠️ **Camera is NOT a top-level tab.** It is a field *group within Scene &
     Pose*, alongside Pose & Action and Setting. Physical contains the Identity /
     Eyes / Hair / Face & Skin / Wardrobe groups.
2. **Scrollable field blocks** — every tab's block opens with a **TabDivider** (a
   centered pill on a full-width rule, `ControlsPanel.tsx:234`): **Clear** on the
   left, a **scoped preset picker** in the center (**Physical Presets** / **Scene &
   Pose Presets** — each loads only that tab's fields from a saved preset, opening a
   right slide-over), and a **scoped Copy** on the right (**Copy Physical** / **Copy
   Scene & Pose**). Below it, each field group renders as its own card: centered
   icon + title, then a two-column grid of `ChipField`s ("wide" fields span both).
3. **Generate bar** (`components/GenerateBar.tsx`), pinned bottom, top→bottom:
   - **Preset + photo row** — a **Load preset** dropdown (left, restores a full
     saved recipe) + a dashed **"Drop an image to autofill"** zone (right,
     vision-based DNA extraction). `GenerateBar.tsx:91`.
   - **Output toggle** — **Portrait** / **Character Sheet** (`GenerateBar.tsx:107`).
   - **Model picker row** — model picker (fills the left half) + a **resolution**
     chip + an **aspect-ratio** chip (9:16 / 16:9 / 1:1; sheets get their own
     16:9↔9:16 picker).
   - **Generate button** — pink (`bg-influencers-500`), full width: "Generate
     Character" / "Generate Character Sheet" + credits.

Characters defaults to the **GPT Image 2** model (app-wide image default is Nano
Banana 2).

### Right gallery (`components/GalleryPanel.tsx`)

Scrolling, newest-first, grouped under date pills ("In progress" / "Today" /
date). Grid `grid-cols-2 → lg:3`, `grid-auto-flow:dense`; **16:9 outputs span the
full row** (`col-span-2 lg:col-span-3`). Each tile: badges top-left (Sheet/Saved),
delete top-right on hover, a bottom hover toolbar (edit / make-sheet on the left,
save / download on the right), model caption underneath.

- **Lightbox** (`InfluencerLightbox.tsx`): fullscreen; ✕ top-right, image centered,
  prompt + Copy/Download centered below.
- **Edit modal** (`InfluencerEditModal.tsx`): left editor (mode toggle, model
  picker, prompt, reference uploads, generate) + right outputs strip; ✕ top-right.

---

## 4. Scripts (Script Architect) — `src/apps/script-architect/`

**Two panes** 50/50 (`ScriptArchitect.tsx:222`): **left = input**, **right =
output**.

### Mode tabs (top of left pane)

Left→right: **Remix · Write New** (the old Remix Script / Remix Scenes tabs are
merged into one Remix mode — the source box auto-detects the pasted format).

### Left input, top→bottom by mode

- **Remix:** one merged source box (bank card header + paste textarea) →
  Product Context → Additional Context (optional). When the pasted text is a
  scene blueprint (`--- Scene N` / `SCENE N —` headers) the box flips to
  fuchsia + monospace and a footer chip appears: "Scene blueprint detected —
  scenes will be rewritten" with a **Remix as script instead** override button
  (toggles back via "Rewrite scenes instead").
- **Write New:**
  1. **Output** sub-toggle — left→right **Script · Scenes · Cinematic**.
  2. **Product Context** card (+ "Edit product details" link).
  3. **Script Style** picker — *replaced by an optional **Character** picker when
     Output = Cinematic*.
  4. **Describe Your Video** textarea (the brief; optional).
     - ⚠️ The label is **"Describe Your Video"**. Older copy and the June
       screenshots say "Describe Your Ad"; the live label is the former.
  5. **Length** toggle — 10s / 15s / 30s / 60s (Cinematic caps to 10s/15s).

**Generate button** (pinned bottom): label varies — "Generate 3 Scripts" /
"Generate 3 Scene Drafts" / "Generate 3 Cinematic Concepts" / "Generate 3 Script
Variations" / "Rewrite Scene Prompts".

### Right output (`components/OutputPanel.tsx`)

Top: **Output / History** tabs (`RightPanel.tsx:59`). Output = a vertical stack of
result cards; each card has a title/scene-count badge (left) + Copy (right) header,
then a wrapping action-button row. Button order (`OutputPanel.tsx:275`):

- **Save to Bank** (always, leading).
- Then conditionally: **Send to Voiceovers** (spoken scripts) · **Send to B-Roll**
  (all non-cinematic) · **Send to Playground** (scene formats; and the *only* send
  target for Cinematic).

(The June screenshot's "Send to Characters" is stale — no such button exists.)

---

## 5. Voiceovers (Voice Studio) — `src/apps/voice-studio/`

Three regions (`VoiceStudio.tsx:193`): **center editor** (flex-fill) + **right
panel** (fixed `w-[400px]`) + a **bottom player** bar that appears when a clip is
playing.

### Center editor (`components/EditorArea.tsx`), top→bottom

Script bank selector (pill / dashed "Click to select from bank") → "or paste
script manually" divider → large textarea → "Clear All" link → progress bar →
**footer row**: character counter (leading) · download icon + **Generate
Voiceover** button (trailing).

### Right panel (`components/RightPanel.tsx`)

Top tabs: **Settings / History**. Settings (`SettingsView.tsx`), top→bottom:

1. **Voice** selector (avatar + name + description; opens the voice picker
   slide-over).
2. **Model** row (read-only "Eleven Multilingual v2").
3. Sliders **in this exact order**: **Speed → Stability → Similarity → Style
   Exaggeration** (`SettingsView.tsx:54`–`101`).
4. **Reset values** link.

**Voice picker** (`VoicePickerView.tsx`): slide-over with a "Select a voice"
header (back arrow), search box + category chips, then a scrolling list of rows
(play-button avatar + name/category + selected check).

### Bottom player (`components/BottomPlayer.tsx`), left→right

Voice avatar + script preview + voice name/time (≈28% width) → back-10s · play/pause
· forward-10s → current time → scrubber → duration → details (AlignLeft) · download ·
close (ChevronDown).

---

## 6. B-Roll (Broll Studio) — `src/apps/broll-studio/`

**Two panes** split **25 / 75** (`BrollStudio.tsx:371`): narrow **left input**
(`md:w-1/4`), wide **right scenes** (`md:w-3/4`).

### Left input (`components/InputPanel.tsx`), top→bottom

"References" header + Clear All → **Product** ref card → **Character** ref card →
**Script** ref card (each: dashed "Click to select from bank" when empty, filled
pill when set) → "or paste script manually" divider + script textarea → divider →
**Additional Instructions** textarea → **Generate B-Roll Prompts** button (pinned
bottom).

### Right scenes (`components/RightPanel.tsx` → `ScenesView.tsx`)

Top tabs: **Scenes / History**. Scenes view: a control bar with the scene count
(left) and a **Generate all images** button (right), then scene blocks
(`gap-10`). Each scene block:

- Header: big italic scene number + "Line N" chip + the quoted script line (left);
  a **Generate all** button for that scene (right).
- A grid of **4 variation cards**, `grid-cols-2 → md:3 → xl:5`. The four variation
  tags (`variationTags.ts`): **Dialogue · Action · Emotional · Product shot** —
  shown as a colored chip top-left of each card (cyan / lime / pink / amber). The
  bottom-center caption reads **A-Roll** (Dialogue) or **B-Roll** (others).
  - Tags are not pinned to a fixed column position — cards fill the responsive grid
    in generation order.

Each card (`VariationCard.tsx`, portrait `9/16`): tag chip top-left, status badges +
delete top-right (hover), and a bottom-right hover toolbar **Copy Prompt · Save to
B-Rolls (stills only) · Download**. Click opens the card detail modal.

### Card detail modal (`components/CardDetailModal.tsx`)

✕ top-right; header tag chip + "ROLLTYPE · Scene N". Body is a 50/50 grid:

- **Left:** **Image / Video / Animate** tab toggle → model picker + constraint
  chips (resolution, aspect, and for video: duration + audio) → **Reference Images**
  (two slots: Character left, Product right) *or* the Animate start-frame preview →
  Prompt (with Enhance · Regenerate · Undo · Redo) → **Generate Image / Generate
  Video / Animate** button.
- **Right:** a masonry gallery of this card's generations.

---

## 7. Playground — `src/apps/playground/`

**Two panes** (`Playground.tsx:523`): **left control panel** (`md:w-1/3`,
min-380px) + **right history grid** (flex-fill).

### Mode tabs (top of left, `PromptPanel.tsx:120`)

Left→right: **Video · Image · Music**. The fresh default is **Video**
(`Playground.tsx:101`, `mode: 'video'`); the panel then **restores the last-used
mode from the persisted draft**, so a returning session may open on Image or Music.

### Left panel, top→bottom (varies by mode)

- **Image:** "Image Model" picker (+ Clear trailing) → resolution + aspect chips →
  **Reference images** strip (≤4 drop slots) → **Prompt** (heading + Enhance Prompt /
  Undo / Redo, then a full-width **"Select UGC Preset"** button that opens the presets
  slide-over, then the textarea with the `@`-mention popover) → **Generate Image**
  (pinned bottom).
- **Video:** "Video Model" picker → resolution + aspect + duration chips + **Audio**
  toggle → **Reference frames** (Start frame / End frame slots, each with Upload +
  "Pick from Bank") + Reference images (≤9) / Reference audio (voice/lip-sync ≤15s) /
  Reference video (motion/style ≤15s) strips (model-dependent); **Motion Control**
  models swap this for a "Motion inputs" section (character image + driving clip +
  orientation toggle); **Gemini Omni** adds the Omni inputs section (characters /
  voices / source clip) → Prompt → **Generate Video**.
- **Music:** "Music Model" picker → **Instrumental / With lyrics** toggle → Prompt →
  **Generate Music**. (No reference section.)

### Right history grid (`components/PlaygroundHistoryGrid.tsx`)

Scrolling, newest-first, date-bucketed; masonry `grid-cols-2 → lg:3 → xl:4`,
landscape items span 2 cols. Image/video/audio tiles with hover actions (reuse,
save-to-B-Rolls for images, download, delete) + model caption; click opens a
centered preview lightbox (with Send-to-inputs / Save / Download, and for video a
first/last frame-grab row).

---

## 8. Ad Analyzer (Ad Anatomy) — `src/apps/ad-anatomy/`

Root is a horizontal flex (`AdAnatomy.tsx:158`). Three columns once a result is
open:

1. **History rail (far left)** — `HistoryRail.tsx`. A red **New analysis** button
   at the **top**, then the list of past analyses.
2. **Media column (center, `md:w-1/3`)** — the video/image player + filename chip
   (only when the analysis has media).
3. **Results column (right, flex-fill)** — `ResultsView.tsx`, with a sticky
   section-jump toggle (**Breakdown · Transcript · Scenes**), top→bottom:
   - **Breakdown** — one card: the scorecard on top (scored dimensions in this
     fixed order: **Hook Strength, Structure Clarity, Visual Variety,
     Persuasion Depth, Overall Execution**, analyst's note to the right), then
     under an inset divider the Hook / Angle / Structure blocks and the
     copyable **Script Style Prompt** (product-agnostic writing brief; saves to
     the Script Bank with a STYLE badge). Legacy results that predate the
     creative breakdown show only the scorecard part.
   - **Transcript**.
   - **Reverse-Engineered Scenes**.

Under the Breakdown, Transcript, and Scenes sections sits a shared action row
(`ResultsView.tsx`), left→right: **Save to Script Bank · Send to Scripts**
(hidden on the Breakdown card for legacy results with no style prompt).

The pre-result **upload state** (`UploadView.tsx`) shows the drop/upload target
instead of the media+results columns.

---

## 9. Dashboard — `src/apps/dashboard/Dashboard.tsx`

Single scrollable page (no panes/tabs), centered `max-w-5xl`. First tile in the
dock (green) and the **default landing page** (`DEFAULT_SLUG = 'dashboard'`).
Hero text (greeting + big stat values) is Instrument Serif italic; every card,
pill, and tile carries a subtle drop shadow. Top→bottom:

- **Greeting header:** date line, "Good morning, `<first name>`" (time-of-day
  phrase; name from `profile.first_name`, omitted in local-only mode), one-line
  sub. Top-right: **Get Credits** (kie.ai/billing) and **Community** (Skool)
  pill links.
- **Bento grid** (12-col on `md:`). While no kie.ai key is saved, a full-width
  **Get set up** card (`ConnectKeyCard.tsx`) sits ABOVE the metric cards — a
  single "Connect your kie.ai API key" row that opens the Settings modal and
  removes itself once a key lands. Cards:
  - **Time saved** card (5 cols): serif hero ("286 hrs"), a green
    "+N hrs this week" delta (rolling 7 days, hidden at zero), workdays
    sub-line ("…of production and tool-hopping…"). No hover tooltip —
    assumptions live in `utils/usage.ts` (`MINUTES_SAVED_PER_GEN` +
    `TASK_SWITCH_MINUTES_PER_GEN`).
  - **Money saved** card (4 cols): serif hero USD, green "+$N this week"
    delta, sub "vs official APIs & creator platforms · N credits used".
  - **Streaks** card (3 cols): three icon rows — current streak (flame, green),
    longest streak (trophy), active days since first activity (calendar).
  - **Activity** card (full width): 26-week GitHub-style heatmap
    (`ActivityHeatmap.tsx`) — Monday-first columns, month labels above, green
    intensity ramp, Less→More legend bottom-right, native `title` tooltip per
    cell; "`<n>` generations · last 6 months" top-right.
  - **Crew shortcut row** (7 tiles, dock order): crab sprite on an accent-tinted
    chip, app name, "Name · Role" in the app accent (truncated), `ArrowUpRight`
    top-right; clicking opens that app. No footer below the grid.

All values derive from `bankStore.usageDays` via `computeUsageMetrics`
(`utils/usage.ts`); the page is read-only. Related: model pickers (ModelPicker +
ModelSidePanel rows) show a green "**`<n>`% off**" chip after the model name for
models with verified `official` pricing in `models.ts`, and the menu bar shows a
flame streak chip while a streak is live (§1.1).

---

## 10. Admin — `src/apps/admin/AdminPanel.tsx`

Admin-only (sidebar entry hidden for non-admins). Tabs: **Members · Insights ·
Allowlist** (`MembersTable.tsx`, `Insights.tsx`, `AllowlistEditor.tsx`). Not
exercised by creator-facing tutorials; mapped here only for completeness.

---

## Maintenance

When you change a pane split, reorder tabs/buttons, rename a control, or move a
generate action, update the matching section above **and** keep the `file:line`
anchor pointing at the right place. This file exists so UI-driven automation
doesn't have to re-derive the layout from scratch — stale entries are worse than
none.
