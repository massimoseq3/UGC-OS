import { useEffect, useState } from 'react'
import { newImageMemo, type ImageMemo } from './services/productImages'

// The Bank's one save model, for the five forms that aren't Products:
// Characters, Scripts, Voices, B-Rolls and Visual Styles. It is `ProductForm`'s
// autosave with the same rules — a write 700ms after the last change, another
// on the way out (the ✕, Done, a bank switch, a dock switch all unmount the
// form), nothing written when nothing changed, never two writes in flight for
// one form, and photos persisted once however many passes see them. Those five
// used to need an explicit Save while Products saved itself, and their ✕
// silently threw the edit away: one Bank, two meanings for the same ✕.
//
// What differs from Products is WHEN a new row appears. A product becomes an
// unconfirmed draft (`confirmed: false`, the orange dot) on its first keystroke,
// because Products carries a draft flag the pickers understand. None of the
// other five banks does, and a half-filled script or a nameless character
// would sit in every picker looking exactly like a finished one — so here a new
// row is created the moment its REQUIRED fields are filled (`canSave`), which
// is the same test that made a row pickable before. Until then the form says
// inline what's missing, and its ✕ asks twice before discarding. Every OTHER
// way out — a bank switch, Add, a jump in from another app — calls `onAbandon`
// with what was on screen, and Finder turns that into a toast whose Reopen puts
// it back (`restored`), so no exit loses work without saying so.
//
// The row id and the photo memo live in the form's OWN saver, not in Finder's
// shared scratch: a pass that lands after the form has closed (the unmount
// flush, or a change made while a save was in the air) still writes into the
// row it started in, whatever the member has opened since.

export type AutosaveState = 'idle' | 'saving' | 'saved'

// ProductForm's pace — long enough that a sentence is one write, short enough
// that clicking away can't outrun it (and the way out flushes anyway).
const AUTOSAVE_DELAY = 700

export interface BankAutosaveOptions<T> {
  // The row being edited, or null for a new one (its first write creates it).
  rowId: string | null
  // Whether what's on screen may be written: its required fields are filled.
  canSave: (value: T) => boolean
  // Write `value` into row `id` — or create the row when `id` is null — and
  // hand back the id it went into plus the value AS STORED (photos swapped for
  // asset refs). `images` is this form's memo for `persistImage`.
  persist: (value: T, id: string | null, images: ImageMemo) => Promise<{ id: string; stored: T }>
  // Adopt the stored value's refs into the form's state, where the form still
  // holds the photo that was sent — so the next pass sends the ref, not the
  // bytes again.
  onStored?: (sent: T, stored: T) => void
  // The form went away by some other road than its own ✕ or Done while a
  // required field was blocking changes it holds. Called once, with what was
  // on screen and the row it belongs to (null if it never got one).
  onAbandon?: (value: T, rowId: string | null) => void
  // Reopened from that toast: what the form opens with has never been
  // written, so it starts unsaved and touched whatever it looks like.
  restored?: boolean
}

const signatureOf = (value: unknown) => JSON.stringify(value)

// The saver is a plain closure rather than a set of refs: every piece of it is
// mutable and read after the form is gone, and none of it is ever rendered.
// Exported for its tests; forms use the hook below.
export function createSaver<T>(
  initial: T,
  rowId: string | null,
  restored: boolean,
  report: (state: AutosaveState, rowId: string | null) => void,
) {
  let latest = initial
  let options: BankAutosaveOptions<T> | null = null
  let savedSig = restored ? '' : signatureOf(initial)
  let id = rowId
  let running: Promise<void> | null = null
  let mounted = false
  let discarded = false
  const images = newImageMemo()

  const pass = async () => {
    const opts = options
    const snapshot = latest
    if (!opts || signatureOf(snapshot) === savedSig || !opts.canSave(snapshot)) return
    report('saving', id)
    try {
      const result = await opts.persist(snapshot, id, images)
      id = result.id
      savedSig = signatureOf(result.stored)
      // Nothing typed while that write was in the air: hold the stored value
      // ourselves as well, or a flush before the form re-renders would compare
      // the photo's bytes against its ref and write the same row again.
      if (latest === snapshot) latest = result.stored
      opts.onStored?.(snapshot, result.stored)
      report('saved', id)
    } catch (err) {
      console.warn('[Bank] autosave failed', err)
      report('idle', id)
    }
  }

  // One pass at a time. A flush that arrives mid-save waits for it and then
  // runs its own — which is how the last edit before a close still lands.
  const flush = (): Promise<void> => {
    if (running) return running.then(flush)
    running = pass().then(() => { running = null })
    return running
  }

  return {
    flush,
    sync: (value: T, opts: BankAutosaveOptions<T>) => {
      latest = value
      options = opts
    },
    // The armed ✕: the member chose to throw these changes away.
    discard: () => { discarded = true },
    enter: () => { mounted = true },
    // Whatever ends the form, the pending edit is written — and what couldn't
    // be is reported. That check waits a tick: StrictMode unmounts and
    // remounts every component once in development, and a form that is still
    // on screen hasn't been abandoned.
    leave: () => {
      mounted = false
      void flush()
      setTimeout(() => {
        const opts = options
        if (mounted || discarded || !opts?.onAbandon) return
        if (signatureOf(latest) !== savedSig && !opts.canSave(latest)) opts.onAbandon(latest, id)
      }, 0)
    },
  }
}

export function useBankAutosave<T>(value: T, options: BankAutosaveOptions<T>) {
  const [status, setStatus] = useState<{ state: AutosaveState; rowId: string | null }>({
    state: 'idle',
    rowId: options.rowId,
  })
  const [saver] = useState(() =>
    createSaver(value, options.rowId, !!options.restored, (state, rowId) => setStatus({ state, rowId })),
  )
  const signature = signatureOf(value)
  const [openingSignature] = useState(signature)

  // Handed over after every commit, never during render: the saver reads the
  // latest form and handlers whenever it runs, including after the unmount.
  useEffect(() => { saver.sync(value, options) })

  useEffect(() => {
    const timer = setTimeout(() => { void saver.flush() }, AUTOSAVE_DELAY)
    return () => clearTimeout(timer)
  }, [signature, saver])

  // Whatever ends the form — the ✕, Done, a bank switch, Add — the pending
  // edit goes with it (see `leave`).
  useEffect(() => {
    saver.enter()
    return () => saver.leave()
  }, [saver])

  return {
    state: status.state,
    // The row this form writes into, once there is one. A new form keeps its
    // "New …" title after its first save, but anything that needs the row
    // (B-Roll's Animate in Playground) can have it straight away.
    rowId: status.rowId,
    // The member has changed something since the form opened.
    touched: !!options.restored || signature !== openingSignature,
    flush: saver.flush,
    discard: saver.discard,
  }
}
