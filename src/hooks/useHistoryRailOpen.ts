import { useState } from 'react'

// The history rail's open/shut state, shared by the four apps that have one
// (Scripts, Voiceovers, B-Roll, and Playground's project rail).
//
// It is NOT persisted, and that is the point (Massimo's call, September 2026).
// It used to be, back when the rail was a laid-out column: opening it narrowed
// the output beside it, so "open" was a working preference — a member recording
// their screen shut it once, not once per session. The rail is an overlay now
// (`components/RailOverlay`), one that slides in over the pane and dismisses
// the moment you click away from it, which makes "open" a momentary view rather
// than a preference. Storing it would mean landing on a reload with a panel
// sitting over your work, which is the exact complaint the overlay was built to
// answer.
//
// It stays a hook rather than a bare `useState` in four files so this reasoning
// has one place to live and a fifth rail can't quietly reintroduce the slot.
export function useHistoryRailOpen() {
  return useState(false)
}

// One-time cleanup of the slots the persisted version left behind, the same
// idiom (and the same rules) as `RESETS` in `stores/appVisibilityStore.ts`.
// Nothing reads them any more; they are removed so a browser that has been
// through several versions of this rail isn't carrying dead keys forever.
//
// Matching on the key SUFFIX rather than a list of literals is what keeps a
// fourth app's slot from being the one nobody remembered to add.
const RESET_MARKER = 'ai-ugc-lab:history-rail:not-persisted-2026-09'
const DEAD_SUFFIXES = [':historyRail', ':projectRail']

function dropDeadSlots(): void {
  try {
    if (localStorage.getItem(RESET_MARKER)) return
    const stale = Object.keys(localStorage).filter((k) => DEAD_SUFFIXES.some((s) => k.endsWith(s)))
    for (const key of stale) localStorage.removeItem(key)
    // Recorded last, so a throw anywhere above leaves the marker unset and the
    // sweep simply runs again on the next load rather than half-applying.
    localStorage.setItem(RESET_MARKER, '1')
  } catch { /* ignore — it runs again next load */ }
}

// At module scope, deliberately: the older marker key is left in place on
// purpose (removing it would let a future `:historyRail` reset re-run), so this
// is the only thing that clears the slots themselves.
dropDeadSlots()
