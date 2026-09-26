import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore, localBanksReady } from '../../stores/bankStore'

// The four first-run steps the Dashboard's Next Steps card walks a new member
// through, and whether each is done. Every flag is DERIVED from what the member
// already has — never stamped — so deleting the last product brings its step
// back, and a member who did the work somewhere else (a character saved from
// Playground's history, a script written in Flow) finds it ticked.
//
// Lives apart from the card because Dashboard needs the same answer for layout
// (the stagger slot and the short-window logo cut-off both move while the card
// is up), and a file exporting a component and a hook loses Fast Refresh.

export type NextStepId = 'key' | 'product' | 'character' | 'script'
export type NextStepsDone = Record<NextStepId, boolean>

// The banks load from IndexedDB a beat after the first paint. Until they have,
// every bank reads empty, so a member with everything done would watch the
// card rise on every load and vanish again — on the page they land on. Read
// once at module scope so a remount of the Dashboard after load doesn't spend
// a frame re-learning it.
let banksLoaded = false
void localBanksReady.then(() => { banksLoaded = true })

/** The four steps' done flags, or null when the card has nothing to show. */
export function useNextSteps(): NextStepsDone | null {
  const [ready, setReady] = useState(() => banksLoaded)
  useEffect(() => {
    if (ready) return
    let live = true
    void localBanksReady.then(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [ready])

  const key = useSettingsStore((s) => s.kieApiKey.trim().length > 0)
  const product = useBankStore((s) => s.products.length > 0)
  // A character counts whether it was generated (history) or only saved to the
  // bank — either way the member has a face to cast.
  const character = useBankStore((s) => s.models.length > 0 || s.characterHistory.length > 0)
  const script = useBankStore((s) => s.scripts.length > 0 || s.scriptHistory.length > 0)

  if (key && product && character && script) return null
  // A missing key is knowable at once (it's a synchronous localStorage read),
  // and it blocks everything else — so that case never waits on the banks.
  if (!ready && key) return null
  return { key, product, character, script }
}
