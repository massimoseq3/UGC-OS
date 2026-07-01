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

Full-viewport, no top bar. `src/App.tsx:128` → `Workspace`.

```
┌──────────┬───────────────────────────────────────────────┐
│ SIDEBAR  │  ACTIVE APP (absolute inset, left-padded to    │
│ (fixed   │  clear the sidebar gutter: md:pl-20 collapsed, │
│  gutter) │  md:pl-56 expanded)                            │
│          │                                                │
└──────────┴───────────────────────────────────────────────┘
```

- The sidebar is a **fixed left gutter** on `md`+: `w-20` collapsed (icon rail) /
  `w-56` expanded. Below `md` it's an **overlay drawer** (hidden, slides in from
  the left over a black backdrop) opened by a floating burger pinned top-left
  (`App.tsx:64` `MobileMenuButton`).
- Apps are kept mounted once opened and toggled by opacity, so all open apps
  occupy the same content rectangle (`App.tsx:147`).
- Toasts render bottom-stacked via `ToastContainer` (`App.tsx:170`).

### 1.1 Sidebar — `src/components/Sidebar.tsx`

Top→bottom. Section list and order come from `APP_REGISTRY` / `SECTION_ORDER`
(`src/utils/constants.ts:29`, `Sidebar.tsx:22`).

1. **Header row** (`Sidebar.tsx:83`): burger (leading) + app logo + "UGC *OS*"
   wordmark. Below it an inset hairline divider.
2. **LIBRARY** — `Bank` (bookmark icon).
3. **CREATE** — in order: `Influencers`, `Scripts`, `Voiceovers`, `B-Roll`,
   `Playground`.
4. **TOOLS** — `Ad Analyzer`.
5. **ADMIN** — `Admin` (only rendered for admin profiles; section hidden otherwise).
6. **Footer block** (`Sidebar.tsx:136`), top→bottom:
   - **Credits chip** — "`<n>` credits left" with a coin glyph; the whole chip is
     the manual-refresh control (coin swaps to a refresh icon on hover). Hidden
     until a kie.ai key is set.
   - **Appearance toggle** — segmented Dark / Light / System (icon-only). Collapsed
     rail drops System and shows Dark/Light only.
   - **Settings** — opens the Settings modal (does NOT navigate).
   - **My Account** — `UserMenu`; opens a small popover *above* the button.

Each nav row: leading icon + label. Collapsed rail stacks icon-over-label and
center-aligns. Active row gets an `bg-ink/[0.08]` fill (`SidebarRow`,
`Sidebar.tsx:315`).

Note the **two namespaces**: sidebar display names vs the internal app/folder ids
(`constants.ts:29`). `Bank`→`finder`, `Influencers`→`character-studio`,
`Scripts`→`script-architect`, `Voiceovers`→`voice-studio`, `B-Roll`→`broll-studio`,
`Ad Analyzer`→`ad-anatomy`.

### 1.2 Settings modal — `src/components/SettingsModal.tsx`

A single scrolling modal (NOT tabbed). Top→bottom:

1. Header: "Settings" title, close **✕ top-right** (`SettingsModal.tsx:189`).
2. **kie.ai API key**: label + "Get key" link, masked input, "Test connection"
   button + result, then a full-width **Save** button directly under the input.
3. **Appearance**: Dark / Light / System segmented toggle.
4. **Storage** (cloud mode only): usage bar + orphan-cleanup flow.
5. **Legal** footer links (Terms / Privacy / AUP / DMCA).
6. **Account** (cloud + signed-in): email + avatar, **Sign out** button.
7. Demo-data tool (admin/local only), at the very bottom.

### 1.3 User menu popover — `src/components/auth/UserMenu.tsx`

Opens upward from the "My Account" footer button. Items top→bottom: a "Signed in
as `<email>`" header, then a single **Sign out** action. (Account email + sign-out
also live in the Settings modal.)

### 1.4 Shared control idioms

- **SegmentedToggle** (`src/components/SegmentedToggle.tsx`) — the house tab/pill
  control used for nearly every mode switch and Output/History tab. Rounded-full
  track, equal-width segments, a sliding active pill. When you read "tabs" or "a
  toggle" below, it's this component, and the **left-to-right option order is the
  array order** in code.
- **Model picker** (`src/components/ModelPicker.tsx`) — a pill button (model
  icon + name + credits + chevron) that opens an **inline dropdown anchored to the
  pill** (`absolute … bottom-full`/`top-full`, opens upward in footers, scrollable
  ~360px). The dropdown is a list of model rows: icon + name + credits + a check on
  the active model. It is **NOT** a right-edge slide-over. Verified in Influencers
  (Nano Banana 2 / GPT Image 2 ✓ / Seedream Lite); same component in B-Roll's card
  modal and Playground.
- **Preset / style / voice / bank-ref slide-overs** — "Influencer Presets" (the
  "Select Influencer" picker), "Select a style", "UGC Prompt Presets", the voice
  picker, and "Select from bank" pickers open as **right-edge slide-over panels**
  (roughly the right half of the viewport, ✕ top-right), with a titled header and a
  card grid (e.g. Influencer Presets = a STARTERS recipe grid over a BANK section).
  These are distinct from the model-picker dropdown above.
- **Generate button** — every Create/Tool app's primary action is a full-width
  pill at the **bottom of the left control column**, accent-filled in the app's
  family color, with the credit cost in the label.

---

## 2. Bank (Finder) — `src/apps/finder/`

Single full-width column: a header toolbar over a scrolling card area.
`Finder.tsx:215` (header), `:270` (content).

### Header toolbar (`Finder.tsx:215`, `lg:justify-between`)

- **Leading (left):** bank-type tabs, left→right: **Products · Influencers ·
  Scripts · Voices · B-Rolls** (each with a count badge). `Finder.tsx:217`.
- **Trailing (right):** in order — **Sort** control (pill+chevron, e.g. "Newest
  first"; only when the active bank has items) → **Bulk add** (Products bank only)
  → **Add** (filled pill, always). `Finder.tsx:229`–`262`.

### Card area (`src/apps/finder/BankList.tsx`)

- **Products** — square cards, `grid-cols-2 → 5`. Status dot top-left
  (orange=draft / green=confirmed / "Extracting" badge), title on a bottom
  gradient, download + star + delete top-right on hover.
- **Influencers (models)** — portrait `9/16` cards, dense masonry `grid-cols-2 →
  6`; landscape sheets span 2–3 cols (`aspect-video`). Badges top-left ("Sheet" /
  "Preset"), copy-JSON + download + star + delete top-right.
- **Scripts** — tall `9/16` text cards `grid-cols-2 → 4`: a SCRIPT/SCENES badge +
  title at top, faded body preview, product + date footer, star + delete top-right.
- **Voices** — NOT a grid; a vertical list of rounded-full horizontal pills (mic
  avatar + label + voice name + stability), delete trailing.
- **B-Rolls** — portrait `9/16` dense grid `grid-cols-2 → 6`, grouped under date
  pills; download + star + delete top-right on hover; "Animate in Playground"
  pill appears on hover (stills only).

Star buttons (products / influencers / scripts / b-rolls) are hover-revealed but
stay visible (filled amber) once starred; starred items sort first in every bank
picker slide-over, marked with a small amber star badge.

### Add/Edit Product form (`src/apps/finder/ProductForm.tsx`)

Header (title + ✕). Two columns on `lg`: **left** = square product image (with
Change / Download overlays, or a dashed drop-to-autofill box); **right** = fields,
top→bottom: **Product Name\*, Description\*, Target Market, Pain Points, USPs,
Benefits, Offer, CTA**. Sticky footer holds the submit button ("Add Product" /
"Save Changes").

---

## 3. Influencers (Character Studio) — `src/apps/character-studio/`

**Two panes** split 50/50 (`CharacterStudio.tsx:268`): **left = controls**, **right
= output gallery**.

### Left controls (`components/ControlsPanel.tsx`), top→bottom

1. **Field-group tabs** — segmented toggle with **exactly two** options:
   **Physical** and **Scene & Pose** (`ControlsPanel.tsx:226`, `types.ts:71`). Each
   shows a filled-field count badge.
   - ⚠️ **Camera is NOT a top-level tab.** It is a field *group within the Scene &
     Pose tab* (`types.ts:274`), alongside Pose & Action and Setting. The Physical
     tab contains the Identity / Eyes / Hair / Face & Skin / Wardrobe groups.
2. **Preset + photo row** — two equal pills: a **"Select Influencer"** picker
   (left, person icon + chevron) that opens the **Influencer Presets** right
   slide-over (a STARTERS grid of recipe cards over a BANK section of saved
   models), and a dashed **"Drop an image…"** auto-fill zone (right).
   `ControlsPanel.tsx:176`.
3. **Scrollable fields** — each group renders a header (icon + name) then a
   two-column grid of `ChipField`s; "wide" fields span both columns. The **first**
   group's header carries the trailing action cluster: **Clear All · Save as
   Preset · Copy Prompt**.
4. **Generate bar** (`components/GenerateBar.tsx`), pinned bottom, top→bottom:
   - **Output toggle** — **Portrait** / **Influencer Sheet** (`GenerateBar.tsx:77`).
     (CLAUDE.md historically called this "Character Sheet"; the live label is
     "Influencer Sheet".)
   - **Model picker row** — model picker (fills width) + a **resolution** chip + an
     **aspect-ratio** chip (9:16 / 16:9 / 1:1; sheets get their own 16:9↔9:16
     picker).
   - **Generate button** — pink (`bg-influencers-500`), full width: "Generate
     Influencer" / "Generate Influencer Sheet" + credits.

Influencers defaults to the **GPT Image 2** model (app-wide image default is Nano
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
  3. **Script Style** picker — *replaced by an optional **Influencer** picker when
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

(The June screenshot's "Send to Influencers" is stale — no such button exists.)

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

"References" header + Clear All → **Product** ref card → **Influencer** ref card →
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
  (two slots: Influencer left, Product right) *or* the Animate start-frame preview →
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
  models swap this for a "Motion inputs" section (influencer image + driving clip +
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
3. **Results column (right, flex-fill)** — `ResultsView.tsx:332`, top→bottom:
   - **Scorecard** — scored dimensions in this fixed order: **Hook Strength,
     Structure Clarity, Visual Variety, Persuasion Depth, Overall Execution**
     (`services/analyzeAd.ts:43`), with the analyst's note to the right.
   - **Transcript**.
   - **Reverse-Engineered Scenes**.

Under the Transcript and the Scenes sections sits a shared action row
(`ResultsView.tsx:303`), left→right: **Save to Script Bank · Send to Scripts**.

The pre-result **upload state** (`UploadView.tsx`) shows the drop/upload target
instead of the media+results columns.

---

## 9. Admin — `src/apps/admin/AdminPanel.tsx`

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
