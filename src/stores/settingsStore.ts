import { create } from 'zustand'
import { saveProfile } from '../lib/cloudSync'
import { isCloudEnabled } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useAppStore } from './appStore'
import { getModel, getDefaultModel, CHAT_MODEL_DEFAULT, TTS_MODEL_PRO, TTS_MODEL_SLOT } from '../utils/models'

const STORAGE_KEY = 'ai-ugc-lab-settings'

function cloudActive(): boolean {
  return isCloudEnabled() && !!useAuthStore.getState().user
}

// Best-effort profile push. Awaited inline; failures toast and re-throw so
// the caller can surface them too.
async function pushProfile(): Promise<void> {
  if (!cloudActive()) return
  try {
    await saveProfile()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try { useAppStore.getState().addToast(`Settings sync failed: ${msg}`, 'error') } catch { /* ignore */ }
    throw e
  }
}

interface SettingsState {
  kieApiKey: string
  // ScrapeCreators key, powering Outliers. Same doctrine as the kie key: the
  // member's own, browser-local, never written to Supabase.
  scrapeCreatorsKey: string
  perAppModel: Record<string, string>

  setKieApiKey: (key: string) => void
  setScrapeCreatorsKey: (key: string) => void

  getKieApiKey: () => string
  getScrapeCreatorsKey: () => string

  setAppModel: (appId: string, modelId: string) => void
  getAppModel: (appId: string) => string | undefined
}

interface PersistedShape {
  kieApiKey?: string
  scrapeCreatorsKey?: string
  perAppModel?: Record<string, string>
  // Legacy field — read once during migration, never written again.
  googleApiKey?: string
}

// Everything persisted under STORAGE_KEY. Named so the write paths below can't
// silently drop a field the way a hand-built object literal did when the
// ScrapeCreators key was added to a shape that only listed two.
type PersistedSettings = Pick<SettingsState, 'kieApiKey' | 'scrapeCreatorsKey' | 'perAppModel'>

const MIGRATIONS_KEY = 'ai-ugc-lab-settings-migrations'

// Shared by the localStorage migration below and the profile migration further
// down — one function so the two copies of perAppModel can't be migrated to
// different answers.
//
// Clears EVERY image slot, in every app, rather than a list of key literals:
// slots are keyed `${appId}:${task}:${mode}` (see ModelPicker's persistedKey),
// so testing the TASK segment catches Characters, B-Roll, Playground and any
// image picker added later, and can't be defeated by a key nobody remembered
// to add. Matching on the segment rather than a `:image:` substring is what
// keeps `…:video:image-to-video` out of it.
function clearImageModelSlots(m: Record<string, string>): void {
  for (const key of Object.keys(m)) {
    if (key.split(':')[1] === 'image') delete m[key]
  }
}

// Same shape, for the prompt-writer slot Scripts and B-Roll each own
// (`${appId}:chat`, see scriptModelSlot). Clearing lands both apps on whatever
// `defaultFor` says today rather than rewriting them to a literal id, which is
// what keeps the next flip one more of these instead of a rewrite chain.
function clearChatModelSlots(m: Record<string, string>): void {
  for (const key of Object.keys(m)) {
    if (key.split(':')[1] === 'chat') delete m[key]
  }
}

// One-shot migrations applied to perAppModel. Each runs once per browser, then
// its name is recorded under MIGRATIONS_KEY so it never runs again.
const MODEL_MIGRATIONS: Array<{ name: string; apply: (m: Record<string, string>) => void }> = [
  {
    // Scripts' and B-Roll's prompt-writer slots clear, so both land on the
    // registry default — Gemini 3.8 Flash, which has held `defaultFor` on both
    // apps since September 2026. Massimo's call, after opening the app on a
    // fresh session and finding Gemini 3.6 Flash still writing.
    //
    // The flip itself shipped without a migration, on the reasoning that
    // nothing writes a resolved default into a slot so an unpicked slot follows
    // `defaultFor` on its own. That reasoning is sound and it wasn't enough: a
    // member who opened the picker while 3.6 held the default and clicked the
    // row already ticked has a stored 3.6 that is indistinguishable from a
    // deliberate pick, and every default flip since has walked straight past
    // it. This is what moves them.
    //
    // UNCONDITIONAL, like the image flip below, and for the same reason: the
    // twin entry in PROFILE_MIGRATIONS runs against a copy this browser has
    // never seen, where "delete it if it holds the old default" would re-fire
    // an old flip against a pick made after it. So a member who deliberately
    // chose Claude Opus 5 or GPT 5.6 Terra moves too. One click to undo,
    // nothing deleted, every model still one row away in the picker.
    name: '2026-09-chat-default-gemini-3-8-flash',
    apply: clearChatModelSlots,
  },
  {
    // GPT Image 2.5 Sunburst becomes the image default in EVERY app — Massimo's
    // call, widening the Characters-only flip that shipped hours earlier. This
    // supersedes `2026-09-character-studio-gpt-image-2-5-default`, which is
    // left in the list below: it is already marked as run in members' browsers,
    // and re-running it would do nothing this one doesn't.
    //
    // UNCONDITIONAL, like its predecessor: it clears every image slot whatever
    // it holds, so a member who deliberately picked Seedream or Nano Banana in
    // Playground or B-Roll moves too. That is the cost and it was the explicit
    // ask ("all of them should be GPT Image 2.5 Sunburst now as the default").
    // One click to undo, nothing deleted, every model still in the picker.
    //
    // It CLEARS rather than rewrites, so each slot falls through to whatever
    // leads the registry today — which is where the app-wide image default now
    // lives, no `defaultFor` involved. That is what keeps the next flip one
    // more of these instead of a rewrite chain.
    //
    // It is also listed in PROFILE_MIGRATIONS below, and it has to be: this
    // list only ever reaches the localStorage copy, which cloudSync's hydrate
    // then OVERWRITES wholesale with the account's `per_app_model`.
    name: '2026-09-image-default-gpt-image-2-5-sunburst',
    apply: clearImageModelSlots,
  },
  {
    // Superseded by the entry above, kept because it is already recorded in
    // members' browsers. Narrower (Characters only) and idempotent against it.
    name: '2026-09-character-studio-gpt-image-2-5-default',
    apply: clearImageModelSlots,
  },
  {
    // Three models removed at once (Massimo's call): Gemini 3 Flash, Gemini
    // Omni 1.0 and Wan 2.7. Each was superseded rather than merely dropped —
    // CHAT_MODEL_DEFAULT moved to Gemini 3.8 Flash, Omni Flash 1.1 takes
    // everything 1.0 did plus real frame fields, and Wan 3.0 beats 2.7 on
    // every axis.
    //
    // Most of this is belt-and-braces — getAppModel already drops an id that
    // no longer resolves, and Playground's draft `state` blob validates its own
    // modelId on hydrate now (see its sanitize). ONE part is not: B-Roll's two
    // Continuous slots, 'broll-studio:continuous:video' and
    // ':continuous:animate', are read STRAIGHT off perAppModel rather than
    // through getAppModel, so a stored id there survives its model's removal
    // and reaches generate as "Unknown video model: wan/2-7". Both read sites
    // are guarded now too, but the guard only makes the slot fall back — this
    // clears it, so the member's stored pick is a real pick again.
    name: '2026-09-remove-gemini-3-flash-omni-1-wan-2-7',
    apply: (m) => {
      const GONE = ['gemini-3-flash', 'gemini-omni-video', 'wan/2-7']
      for (const k of Object.keys(m)) {
        if (GONE.includes(m[k])) delete m[k]
      }
    },
  },
  {
    // Grok 4.5 removed from the chat registry — it sat one row under Grok 4.6
    // on the identical rate card, so the only real choice between the two was
    // the worse one. Unlike the Veo and Suno removals this needs no draft
    // repair: a chat pick lives only in perAppModel, which getAppModel already
    // drops when the id no longer resolves, and Playground's `state` blob
    // snapshots image/video/music models but never a chat one. Clearing the
    // slot outright is belt-and-braces, and lands the two pickers back on
    // their `defaultFor`.
    name: '2026-09-remove-grok-4-5',
    apply: (m) => {
      for (const k of Object.keys(m)) {
        if (m[k] === 'grok-4-5') delete m[k]
      }
    },
  },
  {
    // ...and back again: Characters' image default returns to GPT Image 2.
    // Exactly the migration below, mirrored — same by-value targeting, same
    // accepted trade-off. A member sitting on the Nano Banana 2 default moves;
    // a Seedream pick survives; someone who chose Nano Banana 2 deliberately is
    // indistinguishable from the first group and moves with them.
    //
    // Without this the flip would only reach browsers with an empty slot, which
    // after the migration below is most of them but not all — and a default
    // that lands for some members and not others is worse than either default.
    name: '2026-08-character-studio-gpt-image-2-default',
    apply: (m) => {
      if (m['character-studio:image:text-to-image'] === 'nano-banana-2') {
        delete m['character-studio:image:text-to-image']
      }
    },
  },
  {
    // Characters' image default flipped from GPT Image 2 to Nano Banana 2.
    // Targeted BY VALUE rather than deleting the slot outright: a member who
    // picked Seedream keeps it, and only someone still sitting on the old
    // default moves. (Someone who re-picked GPT Image 2 deliberately is
    // indistinguishable from that, so they move too — the same trade-off the
    // image-default migration below already accepted.)
    name: '2026-08-character-studio-nano-banana-default',
    apply: (m) => {
      if (m['character-studio:image:text-to-image'] === 'gpt-image-2-text-to-image') {
        delete m['character-studio:image:text-to-image']
      }
    },
  },
  {
    // Voiceovers' delivery defaults changed: style Vocal Smile → Empathetic,
    // pace Natural → Rapid Fire, and the Tone / Context box now ships
    // pre-filled instead of empty. None of the three reaches
    // an existing browser on its own — the panel's settings are a persisted
    // blob, so DEFAULT_VOICE_SETTINGS only applies to a slot that has never
    // been written, which after a single visit to the tab is nobody.
    //
    // Targeted at the OLD defaults exactly, the same by-value rule the model
    // migrations above follow: a member who picked The Drift keeps it, and a
    // tone line someone actually typed is never touched. The cost is that
    // someone who deliberately re-picked Natural, or deliberately emptied the
    // tone box, is indistinguishable from someone who never touched either and
    // moves with them — once, and both are one edit away from back.
    //
    // It can't live in `sanitizeVoiceSettings`: coercing an empty tone box to
    // the default on every read would make the field impossible to clear.
    name: '2026-08-voice-studio-delivery-defaults',
    apply: () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(':voice-studio:settings')) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object') continue
          // A loaded preset is skipped whole: its pace and tone came from a
          // saved row on purpose, and rewriting either would leave the panel
          // naming a preset the settings no longer hold.
          if (parsed.presetId) continue
          let changed = false
          if (parsed.style === 'Vocal Smile') { parsed.style = 'Empathetic'; changed = true }
          if (parsed.pace === 'Natural') { parsed.pace = 'Rapid Fire'; changed = true }
          // Literal, not DEFAULT_SAMPLE_CONTEXT: a migration records what was
          // written on one date, so a later edit to the default must not
          // retroactively change what this one puts in members' boxes.
          if (!parsed.sampleContext) { parsed.sampleContext = 'Creator talks at a normal tempo.'; changed = true }
          if (changed) localStorage.setItem(key, JSON.stringify(parsed))
        }
      } catch { /* ignore */ }
    },
  },
  {
    // Suno V5 removed from the registry; V5.5 is the only music model left.
    // Same two repairs as the Veo removal below: getAppModel already drops an
    // id that no longer resolves, but Playground ALSO snapshots modelId inside
    // its draft `state` blob, which nothing validates, so a stale 'suno-v5'
    // there would reach buildMusicInput and be sent to Suno as model 'V5'.
    name: '2026-08-remove-suno-v5',
    apply: (m) => {
      for (const k of Object.keys(m)) {
        if (m[k] === 'suno-v5') delete m[k]
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(':playground:state')) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          if (parsed && parsed.modelId === 'suno-v5') {
            parsed.modelId = 'suno-v5_5'
            localStorage.setItem(key, JSON.stringify(parsed))
          }
        }
      } catch { /* ignore */ }
    },
  },
  {
    // Veo 3.1 Fast / Lite / Quality removed from the registry. getAppModel
    // already drops an id that no longer resolves, so this is belt-and-braces
    // for the picks — but Playground ALSO snapshots modelId inside its draft
    // `state` blob, which nothing validates against the registry, so a stale
    // 'veo3_fast' there would reach buildVideoInput. Repair both.
    name: '2026-07-remove-veo',
    apply: (m) => {
      const GONE = ['veo3', 'veo3_fast', 'veo3_lite']
      for (const k of Object.keys(m)) {
        if (GONE.includes(m[k])) delete m[k]
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(':playground:state')) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          if (parsed && GONE.includes(parsed.modelId)) {
            parsed.modelId = 'grok-imagine-video-1-5-preview'
            localStorage.setItem(key, JSON.stringify(parsed))
          }
        }
      } catch { /* ignore */ }
    },
  },
  {
    // Earlier builds let users persist Nano Banana 2 as the Characters image
    // model. GPT Image 2 is the registered default for character-studio; clear
    // the stale entry so the registry default kicks in.
    name: '2026-05-character-studio-default',
    apply: (m) => { delete m['character-studio:image:text-to-image'] },
  },
  {
    // Default for character-studio flipped to Nano Banana 2. Clear any
    // persisted selection so users see the new default unless they pick
    // explicitly afterwards.
    name: '2026-05-character-studio-nano-banana-default',
    apply: (m) => { delete m['character-studio:image:text-to-image'] },
  },
  {
    // Default for broll-studio image gen flipped to Nano Banana 2. Clear
    // any stale persisted selection so users see the new default unless
    // they pick explicitly afterwards.
    name: '2026-05-broll-studio-nano-banana-default',
    apply: (m) => { delete m['broll-studio:image:text-to-image'] },
  },
  {
    // B-Roll Videos dropped its mode toggle. Old per-mode keys
    // ('video-studio:video:image-to-video', etc.) collapse into a single
    // 'video-studio:video' slot. Take whichever per-mode value the user
    // had selected last (image-to-video is the most common starting point)
    // as the new flat selection.
    name: '2026-05-video-studio-flatten-modes',
    apply: (m) => {
      const modes = ['image-to-video', 'frames-to-video', 'reference-to-video', 'text-to-video']
      if (!m['video-studio:video']) {
        for (const mode of modes) {
          const old = m[`video-studio:video:${mode}`]
          if (old) {
            m['video-studio:video'] = old
            break
          }
        }
      }
      for (const mode of modes) {
        delete m[`video-studio:video:${mode}`]
      }
    },
  },
  {
    // Flux 2 Pro was removed from the image model lineup. Drop any persisted
    // selection so those slots fall back to the registry default (GPT Image 2).
    name: '2026-06-remove-flux-2-pro',
    apply: (m) => {
      for (const k of Object.keys(m)) {
        if (m[k] === 'flux-2/pro-text-to-image') delete m[k]
      }
    },
  },
  {
    // B-Roll video default flipped to Veo 3.1 Fast. Clear any persisted
    // selection so users see the new default unless they pick explicitly after.
    name: '2026-06-broll-veo-fast-default',
    apply: (m) => { delete m['broll-studio:video'] },
  },
  {
    // Image default flipped to Nano Banana 2 app-wide. Drop GPT Image 2 (the
    // previous default) from the picker-persistence layer so users land on the
    // new default unless they pick it explicitly afterwards. Playground also
    // snapshots its image model inside its draft `state` blob (not just
    // perAppModel), so repair those keys directly too.
    name: '2026-06-image-default-nano-banana',
    apply: (m) => {
      const OLD = ['gpt-image-2-text-to-image', 'gpt-image-2-image-to-image']
      for (const k of Object.keys(m)) {
        if (OLD.includes(m[k])) delete m[k]
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(':playground:state')) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          if (parsed && OLD.includes(parsed.modelId)) {
            parsed.modelId = 'nano-banana-2'
            localStorage.setItem(key, JSON.stringify(parsed))
          }
        }
      } catch { /* ignore */ }
    },
  },
  {
    // Video default flipped to Gemini Omni for both video surfaces (B-Roll was
    // Veo 3.1 Fast, Playground fell through to Seedance 2.0 by registry order).
    // Clear the persisted picks so users land on the new default unless they
    // pick explicitly afterwards, and repair Playground's draft `state` blob,
    // which snapshots modelId separately from perAppModel (see the Nano Banana
    // migration above). A user who had deliberately picked the old default is
    // indistinguishable from one who never opened the picker, so both move —
    // same trade-off the image-default migration accepted.
    name: '2026-07-video-default-gemini-omni',
    apply: (m) => {
      delete m['broll-studio:video']
      delete m['playground:video']
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(':playground:state')) continue
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          // Repointed from 'gemini-omni-video' when that entry was removed in
          // September 2026. A migration normally freezes the literal it wrote
          // on its own date, but this one hasn't finished running: it still
          // fires on any browser that has never loaded the app since July, and
          // writing a dead id there would be writing a bug. Flash 1.1 is the
          // same family and the closest thing to what this migration meant.
          if (parsed && parsed.modelId === 'bytedance/seedance-2') {
            parsed.modelId = 'google/gemini-omni-flash-1-1'
            localStorage.setItem(key, JSON.stringify(parsed))
          }
        }
      } catch { /* ignore */ }
    },
  },
]

// ── Profile migrations ─────────────────────────────────────────────
//
// MODEL_MIGRATIONS above only ever touches the localStorage copy of
// perAppModel, and on a cloud account that copy is not the one that wins:
// cloudSync's hydrate replaces `perAppModel` wholesale with the account's
// `per_app_model` column on every sign-in. A default flip written only up
// there is therefore undone the moment the member signs in — and because its
// marker was recorded during the same load, it never runs again in that
// browser. (Sign-out compounds it: resetSettingsStore drops STORAGE_KEY but
// keeps MIGRATIONS_KEY, so the next sign-in is already marked as migrated.)
//
// So a migration that has to reach a signed-in member is listed HERE as well,
// and cloudSync runs it against the profile it just pulled.
//
// Two rules make that safe:
//   - Every entry must be IDEMPOTENT and value-independent. These run against
//     a copy this browser has never seen, so "delete the key if it holds the
//     old default" would re-fire an old flip against a pick the member made
//     after it. An unconditional clear cannot.
//   - The marker is per USER as well as per browser (the `ugc-lab:` per-user
//     flag idiom, same as the usage backfill), and it is recorded only after
//     the corrected profile has actually been pushed — a failed push leaves it
//     unset so the next sign-in retries rather than silently keeping the old
//     value forever.
//
// The narrow race left: a member who signs in on device A (migrated, pushed),
// deliberately re-picks, and then signs in on device B for the FIRST time
// since the flip loses that re-pick. Closing it properly means recording the
// applied migrations in the profile row itself, which is a schema change; it
// is not worth one for a one-off default flip.
const PROFILE_MIGRATIONS: Array<{ name: string; apply: (m: Record<string, string>) => void }> = [
  {
    // Scripts and B-Roll land on the registry chat default at the member's next
    // sign-in. See the twin entry in MODEL_MIGRATIONS — without this one the
    // flip is undone by the first hydrate, which replaces perAppModel wholesale.
    name: '2026-09-chat-default-gemini-3-8-flash',
    apply: clearChatModelSlots,
  },
  {
    // Every member's image slots, in every app, land on GPT Image 2.5 Sunburst
    // at their next sign-in. See the twin entry in MODEL_MIGRATIONS.
    name: '2026-09-image-default-gpt-image-2-5-sunburst',
    apply: clearImageModelSlots,
  },
  {
    // Superseded by the entry above; kept for accounts whose browsers recorded
    // it in the hours it was live on its own.
    name: '2026-09-character-studio-gpt-image-2-5-default',
    apply: clearImageModelSlots,
  },
]

// Drop every slot whose value no longer names a real model. This is the same
// rule `getAppModel` applies at READ time (`id && getModel(id) ? id : undefined`),
// applied at rest — so it is safe by construction: an id no registry entry
// resolves can never be a legitimate pick, and `setAppModel` is the only writer,
// always from a picker. Mutates, and returns what it removed so the caller can
// say so in the console.
//
// It carries NO marker and runs on EVERY load and every hydrate, deliberately.
// That is what separates it from a default flip: a flip has to be one-shot or it
// overrides the member's later pick, whereas this can only ever remove a value
// that has stopped meaning anything, so re-running it is free and a failed push
// simply self-heals at the next sign-in.
//
// It also makes a REMOVAL migration unnecessary from here on. The three entries
// in MODEL_MIGRATIONS that clear specific retired ids (Veo, Suno V5, Grok 4.5,
// Gemini 3 Flash / Omni 1.0 / Wan 2.7) predate this and stay — they are already
// marked as run in members' browsers — but pulling a model out of the registry
// now needs no new entry here at all. A hand-kept GONE list only ever knew about
// the removals someone remembered to write down; this knows about all of them.
export function pruneUnknownModelIds(m: Record<string, string>): string[] {
  const removed: string[] = []
  for (const key of Object.keys(m)) {
    const id = m[key]
    if (!id || !getModel(id)) {
      removed.push(`${key}=${id}`)
      delete m[key]
    }
  }
  return removed
}

// Everything hydrate has to do to a per_app_model map pulled from the cloud,
// in one place so the ordering and the rules live beside each other rather than
// in the sync layer. Pure — it writes no storage and touches no store, so a
// caller whose push fails leaves nothing behind.
//
// `appliedMigrations` must be recorded ONLY after the corrected profile has
// actually been pushed (see recordProfileMigrations); `prunedIds` needs no
// recording at all, per the note above.
export function repairPulledPerAppModel(
  pulled: Record<string, string>,
  userId: string,
): { perAppModel: Record<string, string>; appliedMigrations: string[]; prunedIds: string[]; changed: boolean } {
  const next = { ...pulled }
  const prunedIds = pruneUnknownModelIds(next)
  const { perAppModel, applied } = applyProfileMigrations(next, userId)
  // Compared by CONTENT, not by key count: every rule here happens to delete
  // today, so counting keys would work — and would quietly stop working the
  // first time one rewrites a value instead, skipping the push that makes the
  // repair stick.
  const keys = new Set([...Object.keys(pulled), ...Object.keys(perAppModel)])
  const changed = [...keys].some((k) => pulled[k] !== perAppModel[k])
  return { perAppModel, appliedMigrations: applied, prunedIds, changed }
}

function profileMigrationsKey(userId: string): string {
  return `ugc-lab:profile-migrations:${userId}`
}

function ranProfileMigrations(userId: string): Record<string, true> {
  try {
    const raw = localStorage.getItem(profileMigrationsKey(userId))
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    return {}
  }
}

// Apply any profile migration this user hasn't had yet to a per_app_model map
// pulled from the cloud. Returns the migrated copy plus the names applied —
// the caller records those (via `recordProfileMigrations`) only once the
// corrected profile is safely pushed. Pure: it neither writes storage nor
// touches the store, so a caller that fails to push leaves nothing behind.
export function applyProfileMigrations(
  perAppModel: Record<string, string>,
  userId: string,
): { perAppModel: Record<string, string>; applied: string[] } {
  const next = { ...perAppModel }
  const already = ranProfileMigrations(userId)
  const applied: string[] = []
  for (const m of PROFILE_MIGRATIONS) {
    if (already[m.name]) continue
    m.apply(next)
    applied.push(m.name)
  }
  return { perAppModel: next, applied }
}

export function recordProfileMigrations(names: string[], userId: string): void {
  if (names.length === 0) return
  try {
    const already = ranProfileMigrations(userId)
    for (const n of names) already[n] = true
    localStorage.setItem(profileMigrationsKey(userId), JSON.stringify(already))
  } catch { /* quota / unavailable — it retries next sign-in, which is harmless */ }
}

function loadFromStorage(): PersistedSettings {
  let parsed: PersistedShape = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) parsed = JSON.parse(raw) as PersistedShape
  } catch {
    // Corrupted data — start fresh, but still stamp the migrations below so a
    // blob written later this session isn't migrated against on the next load.
  }
  const perAppModel = { ...(parsed.perAppModel ?? {}) }

  let ranMigrations: Record<string, true> = {}
  try {
    const rawMig = localStorage.getItem(MIGRATIONS_KEY)
    if (rawMig) ranMigrations = JSON.parse(rawMig) as Record<string, true>
  } catch { /* ignore */ }

  // Runs (and records) even with no settings blob yet. It used to be inside the
  // `if (raw)`, so a browser arriving without one — a new device, or any browser
  // after the sign-out wipe, which removes STORAGE_KEY — recorded nothing. The
  // blob then appeared during that same session (a pasted kie key, a model pick,
  // or cloudSync's own hydrate write), and the NEXT load found it and ran every
  // migration for the first time — deleting the member's Characters and B-Roll
  // picks. A pick that survives until you reload and then silently reverts to
  // the default is exactly the bug this file's migrations are meant to be.
  let migrated = false
  for (const m of MODEL_MIGRATIONS) {
    if (!ranMigrations[m.name]) {
      m.apply(perAppModel)
      ranMigrations[m.name] = true
      migrated = true
    }
  }
  // Then the unmarked repair, on every load: drop any slot whose model has left
  // the registry. Unlike the list above this needs no marker and no new entry
  // per removal — see pruneUnknownModelIds. `migrated` is what gates the
  // write-back below, so a prune with no migration still gets persisted.
  const pruned = pruneUnknownModelIds(perAppModel)
  if (pruned.length > 0) {
    migrated = true
    console.warn('Dropped per-app model picks whose model has been removed:', pruned.join(', '))
  }
  const next: PersistedSettings = {
    kieApiKey: parsed.kieApiKey ?? '',
    scrapeCreatorsKey: parsed.scrapeCreatorsKey ?? '',
    perAppModel,
  }
  if (migrated) {
    try {
      localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(ranMigrations))
      // Writes the WHOLE snapshot. An earlier version rebuilt a literal with
      // only the two fields it knew about, which would wipe any key added to
      // the shape later the first time a migration ran. Only when there was
      // something to write back — a browser with no blob stays with no blob.
      if (parsed.perAppModel || parsed.kieApiKey || parsed.scrapeCreatorsKey) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
    } catch { /* quota / unavailable — the in-memory result below still stands */ }
  }
  return next
}

function saveToStorage(state: PersistedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// The persisted slice of the live store. Every setter spreads this and
// overrides its own field, so adding a key to PersistedSettings can never
// leave one setter quietly writing a snapshot that drops it.
function snapshot(s: SettingsState): PersistedSettings {
  return {
    kieApiKey: s.kieApiKey,
    scrapeCreatorsKey: s.scrapeCreatorsKey,
    perAppModel: s.perAppModel,
  }
}

// Write the live store's whole persisted slice to localStorage. For callers
// that changed settings state directly (cloudSync's hydrate) rather than
// through a setter — every setter already spreads `snapshot`. Going through
// `snapshot` is the point: a hand-built literal drops any field added to
// PersistedSettings later, which is how scrapeCreatorsKey came to be wiped on
// every sign-in.
export function persistSettingsSnapshot(): void {
  try {
    saveToStorage(snapshot(useSettingsStore.getState()))
  } catch { /* quota / unavailable — in-memory state still stands */ }
}

// Wipe the in-memory settings and the localStorage snapshot. Called on
// sign-out so a different user signing in on the same browser can't pick
// up the previous user's kie.ai API key or per-app model picks.
export function resetSettingsStore(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  useSettingsStore.setState({ kieApiKey: '', scrapeCreatorsKey: '', perAppModel: {} })
}

// ---------------------------------------------------------------------------
// Per-user key vault
//
// The kie.ai and ScrapeCreators keys are the only settings a member types by
// hand, and by design they are never cloud-synced — so the sign-out wipe above
// (which exists so the next person on a shared browser can't inherit them) also
// meant re-pasting both on every sign-in. They are therefore mirrored into a
// vault keyed BY USER ID, which the wipe deliberately leaves alone: signing
// back in adopts your own entry, and a different member adopts theirs (or
// nothing), so nobody ever sees a key that isn't theirs. The trade-off is that
// a signed-out member's keys stay on that browser's disk until they clear the
// fields in Settings — which is what makes "log back in and it's still there"
// possible at all.
// ---------------------------------------------------------------------------

const KEY_VAULT_KEY = 'ai-ugc-lab-keys'

type VaultEntry = { kieApiKey: string; scrapeCreatorsKey: string }

function readVault(): Record<string, VaultEntry> {
  try {
    const raw = localStorage.getItem(KEY_VAULT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, VaultEntry>) : {}
  } catch {
    return {}
  }
}

function rememberKeysFor(userId: string, s: PersistedSettings): void {
  try {
    const vault = readVault()
    // Both cleared means "forget me on this browser" — drop the entry outright
    // rather than storing a pair of empty strings that would outlive the intent.
    if (!s.kieApiKey && !s.scrapeCreatorsKey) delete vault[userId]
    else vault[userId] = { kieApiKey: s.kieApiKey, scrapeCreatorsKey: s.scrapeCreatorsKey }
    localStorage.setItem(KEY_VAULT_KEY, JSON.stringify(vault))
  } catch { /* localStorage unavailable — the live session still has the key */ }
}

// Mirror the current keys into the signed-in member's vault entry. No-op when
// signed out: local-only mode never wipes, so the main snapshot is enough.
function rememberKeys(s: PersistedSettings): void {
  const userId = useAuthStore.getState().user?.id
  if (userId) rememberKeysFor(userId, s)
}

// Restore this member's keys after a wipe. Called from authStore at every point
// where a user becomes the signed-in one (bootstrap, sign-in, another tab), and
// always AFTER wipeLocalUserData has run. A member with no vault entry yet has
// theirs seeded from whatever the live settings already hold, which is how a
// browser that predates the vault keeps the key it is currently signed in with.
export function adoptUserKeys(userId: string): void {
  const current = snapshot(useSettingsStore.getState())
  const stored = readVault()[userId]
  const next: PersistedSettings = {
    ...current,
    kieApiKey: stored?.kieApiKey || current.kieApiKey,
    scrapeCreatorsKey: stored?.scrapeCreatorsKey || current.scrapeCreatorsKey,
  }
  try { saveToStorage(next) } catch { /* quota — in-memory state below still stands */ }
  rememberKeysFor(userId, next)
  useSettingsStore.setState({ kieApiKey: next.kieApiKey, scrapeCreatorsKey: next.scrapeCreatorsKey })
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setKieApiKey: (key) => {
    // The kie.ai key lives in localStorage only — it is never written to the
    // cloud. No pushProfile() call here (per-app model picks still sync via
    // setAppModel below). rememberKeys mirrors it into the per-user vault so
    // the sign-out wipe doesn't cost the member a re-paste.
    const next = { ...snapshot(get()), kieApiKey: key }
    saveToStorage(next)
    rememberKeys(next)
    set({ kieApiKey: key })
  },

  setScrapeCreatorsKey: (key) => {
    // Same rule as the kie key above: browser-local, never synced, vaulted.
    const next = { ...snapshot(get()), scrapeCreatorsKey: key }
    saveToStorage(next)
    rememberKeys(next)
    set({ scrapeCreatorsKey: key })
  },

  getKieApiKey: () => {
    const key = get().kieApiKey
    if (!key) throw new Error('No kie.ai API key configured. Open Settings to add it.')
    return key
  },

  getScrapeCreatorsKey: () => {
    const key = get().scrapeCreatorsKey
    if (!key) throw new Error('No ScrapeCreators API key configured. Open Settings to add it.')
    return key
  },

  setAppModel: (appId, modelId) => {
    const perAppModel = { ...get().perAppModel, [appId]: modelId }
    saveToStorage({ ...snapshot(get()), perAppModel })
    set({ perAppModel })
    pushProfile().catch(() => { /* toast already raised */ })
  },

  // Drop a persisted pick that no longer resolves (e.g. a retired model) so
  // the picker falls back to its default instead of showing "Select model".
  getAppModel: (appId) => {
    const id = get().perAppModel[appId]
    return id && getModel(id) ? id : undefined
  },
}))

// The two apps that let a member choose who writes their words. The slot key
// matches what ModelPickerModal derives from `${appId}:${task}`, so the panel and
// the services agree without either knowing about the other.
export type ScriptModelApp = 'script-architect' | 'broll-studio'

export function scriptModelSlot(appId: ScriptModelApp): string {
  return `${appId}:chat`
}

// Which chat model writes this app's scripts and prompts. Falls back to the
// app's OWN registry default — both on Gemini 3.8 Flash since September 2026,
// though the two are free to differ and have before, which is why each app
// resolves through `defaultFor` rather than through one shared constant.
export function resolveScriptModel(appId: ScriptModelApp): string {
  return (
    useSettingsStore.getState().getAppModel(scriptModelSlot(appId)) ??
    getDefaultModel(appId, 'chat')?.id ??
    CHAT_MODEL_DEFAULT
  )
}

// Which TTS model reads the script in Voiceovers. Same shape as the pair above:
// the member's pick if there is one, otherwise the app's own registry default.
// Nothing writes the default into the slot, so an empty slot follows
// `defaultFor` and a stored id is always a deliberate pick.
export function resolveTtsModel(): string {
  return (
    useSettingsStore.getState().getAppModel(TTS_MODEL_SLOT) ??
    getDefaultModel('voice-studio', 'tts')?.id ??
    TTS_MODEL_PRO
  )
}
