import { usePersistedState } from './usePersistedState'

// The history rail's open/shut state, shared by the three apps that have one
// (Scripts, Voiceovers, B-Roll).
//
// It ships SHUT at every width (Massimo's call, September 2026). It used to
// default to `useMinWidth(980)` — open wherever it could sit beside the output
// instead of covering it — and that reasoning was about whether the rail FITS,
// which is a different question from whether opening this app should land on
// the list of what you made before. It shouldn't: the pane's job is the take
// you just generated, and the rail is one labelled 38px circle away.
//
// The width answer still decides everything else about the rail (whether
// picking a row hands the pane back, whether it is a column or a cover), so
// each app keeps its own `useMinWidth(980)` read for that.
export function useHistoryRailOpen(slotKey: string) {
  return usePersistedState<boolean>(slotKey, false)
}

// One-time reset, the same idiom (and the same rules) as `RESETS` in
// `stores/appVisibilityStore.ts`.
//
// A default flip alone would reach almost nobody here: `usePersistedState`
// writes its value on MOUNT, not just on change, so every browser that has
// ever opened one of these apps at >=980px is already carrying a stored
// `true` — which is a real choice everywhere else in the app and, in this one
// case, mostly isn't: it is the old default written down. So the stored value
// for each rail slot is dropped once per browser and the slot falls back to
// `false` above.
//
// It is a reset, not a lock: the next time a member opens or shuts a rail the
// new value is written and no later load touches it, because the run is
// remembered under its own marker key and never repeats.
//
// Matching on the key SUFFIX rather than a list of three literals is what
// keeps a fourth app's rail from being the one nobody remembered to add.
const RESET_MARKER = 'ai-ugc-lab:history-rail:shut-by-default-2026-09'
const SLOT_SUFFIX = ':historyRail'

function applyReset(): void {
  try {
    if (localStorage.getItem(RESET_MARKER)) return
    const stale = Object.keys(localStorage).filter((k) => k.endsWith(SLOT_SUFFIX))
    for (const key of stale) localStorage.removeItem(key)
    // Recorded last, so a throw anywhere above leaves the marker unset and the
    // reset simply runs again on the next load rather than half-applying.
    localStorage.setItem(RESET_MARKER, '1')
  } catch { /* ignore — the reset runs again next load */ }
}

// At module scope, deliberately: this has to land before the first
// `usePersistedState` reads its slot, and that read happens in the initializer
// of a component that imports this file.
applyReset()
