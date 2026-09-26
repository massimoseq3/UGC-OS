import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, UserRound, Upload, LayoutGrid, Search, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useIsAppVisible } from '../../stores/appVisibilityStore'
import type { BankType } from '../../utils/constants'
import { BANK_CONFIG } from '../../utils/constants'
import type { Product } from '../../stores/types'
import BankList, { SortControl } from './BankList'
import BankSidebar from './BankSidebar'
import SegmentedToggle from '../../components/SegmentedToggle'
import { useBankSort } from './bankSort'
import ProductForm from './ProductForm'
import ModelForm, { type ModelDraft } from './ModelForm'
import ScriptForm, { type ScriptDraft } from './ScriptForm'
import VoiceForm, { type VoiceDraft } from './VoiceForm'
import BRollForm, { type BRollDraft } from './BRollForm'
import StyleForm, { type StyleDraft } from './StyleForm'
import { partitionImageFiles } from './services/imageValidation'
import { saveProductDraft, adoptDetachedExtraction } from './services/saveProductDraft'
import { persistProductImages, persistImage, newImageMemo, type ImageMemo } from './services/productImages'
import type { ProductExtraction } from './services/extractProductInfo'

const BANK_TYPES: BankType[] = ['products', 'models', 'scripts', 'voices', 'brolls', 'styles', 'swipes']

// The Swipe File is Outliers' own bank — every row in it is filed from that
// app, and its empty state says so. A member who has switched Outliers off in
// Settings therefore loses the tab too: left in, it is a tab pointing at an app
// that isn't there. Switching Outliers back on brings the tab and its rows back
// untouched — nothing here deletes a swipe.
const BANK_OWNER_APP: Partial<Record<BankType, string>> = { swipes: 'discover' }

// Everything ONE open product form accumulates: the row its autosaves write
// into, and the photos it has already persisted. (The other five forms keep
// both in their own saver — see useBankAutosave — which is the shape this
// would take if the product form were written today.)
//
// It's a single object swapped out wholesale rather than two refs cleared in
// place, because an autosave that is already in flight has to keep writing into
// the form it started in. Closing the form flushes it, and the unmount flush
// lands later still — both resolve AFTER the close handler has reset the
// scratch. Reading the row id back out at that point returned null, the save
// decided this product didn't exist yet, and added it a SECOND time. Two rows,
// one blob: deleting either copy purged the shared photo (and its Supabase
// `assets` row, so R2 couldn't give it back), leaving the survivor on the
// package placeholder for good. Capturing the object before the first `await`
// keeps a late flush pointed at its own row.
interface FormScratch {
  // The row this form's autosave created, held as the in-flight PROMISE — a
  // submit racing an autosave then waits on the one add instead of racing it to
  // a second row.
  rowId: Promise<string> | null
  images: ImageMemo
}

const newFormScratch = (): FormScratch => ({ rowId: null, images: newImageMemo() })

// Influencers bank sub-filter. An entry is a "sheet" when `sheetImage` is set,
// otherwise a portrait. Local-only UI state — not persisted.
export type ModelFilter = 'all' | 'portraits' | 'sheets'
// Short labels + icons (not "Influencer Sheets") so the row never clips. Below
// `lg` the two icon segments drop their words entirely (see the header): with
// them, the toggle beside search, sort and Add pushed Add off the end of the
// row between 768 and ~1000px, and onto a fourth header row on a phone.
const MODEL_FILTER_OPTIONS: { value: ModelFilter; label: string; icon?: React.ElementType }[] = [
  { value: 'all', label: 'All' },
  { value: 'portraits', label: 'Portraits', icon: UserRound },
  { value: 'sheets', label: 'Sheets', icon: LayoutGrid },
]

export default function Finder() {
  const [selectedBank, setActiveBank] = useState<BankType>('products')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  // Influencers bank sub-filter (All / Portraits / Influencer Sheets).
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all')
  // The toolbar search. Cleared on every bank switch: a query carried across
  // tabs lands on an empty grid whose tab reads "24", which looks like a bug.
  const [query, setQuery] = useState('')

  const isVisible = useIsAppVisible()
  const bankTypes = BANK_TYPES.filter((bank) => {
    const owner = BANK_OWNER_APP[bank]
    return !owner || isVisible(owner)
  })
  // Derived rather than corrected in an effect: a tab can disappear under us
  // (Settings is a modal over this app), and falling back in render means the
  // list below is never asked for a bank whose tab isn't on screen.
  const activeBank = bankTypes.includes(selectedBank) ? selectedBank : 'products'

  const consumePayload = useAppStore((s) => s.consumePayload)
  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const addToast = useAppStore((s) => s.addToast)

  // Ids of products currently waiting on background extraction. Local only —
  // resets on page refresh by design (interrupted extractions stay as orange-dot drafts).
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set())
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const styles = useBankStore((s) => s.styles)
  const swipes = useBankStore((s) => s.swipes)
  const addProduct = useBankStore((s) => s.addProduct)
  const updateProduct = useBankStore((s) => s.updateProduct)
  const addModel = useBankStore((s) => s.addModel)
  const updateModel = useBankStore((s) => s.updateModel)
  const addScript = useBankStore((s) => s.addScript)
  const updateScript = useBankStore((s) => s.updateScript)
  const addVoice = useBankStore((s) => s.addVoice)
  const updateVoice = useBankStore((s) => s.updateVoice)
  const addBRoll = useBankStore((s) => s.addBRoll)
  const updateBRoll = useBankStore((s) => s.updateBRoll)
  const addStyle = useBankStore((s) => s.addStyle)
  const updateStyle = useBankStore((s) => s.updateStyle)

  const counts: Record<BankType, number> = {
    products: products.length,
    models: models.length,
    scripts: scripts.length,
    voices: voices.length,
    brolls: brolls.length,
    styles: styles.length,
    swipes: swipes.length,
  }

  const [sort, setSort, sortOptions] = useBankSort(activeBank)

  // Bumped to force the open Product form to re-seed from its row — see
  // `handleDetachExtraction` — and by every "new product" path, so a fresh form
  // is a fresh mount. Read through a ref there so the callback stays stable
  // while a background read is running.
  const [formSeed, setFormSeed] = useState(0)
  const editingIdRef = useRef<string | null>(editingId)
  useEffect(() => { editingIdRef.current = editingId }, [editingId])

  // The open form's scratch (see FormScratch above). The row id it carries is
  // deliberately NOT `editingId`: promoting it would swap a real `item` under
  // the open form and reset the fields out from under whoever is typing.
  const scratchRef = useRef<FormScratch>(newFormScratch())

  // A draft handed back by a "wasn't saved" toast's Reopen: the form it came
  // from closed by a bank switch, Add or an inter-app jump while a required
  // field was still blocking its save (`useBankAutosave`'s `onAbandon`). It
  // seeds the ONE form opened by that Reopen and is dropped by anything else
  // that opens or closes a form.
  const [restored, setRestored] = useState<{ bank: BankType; id: string | null; draft: unknown } | null>(null)

  // Everything that WRITES this ref stays above the memoized callbacks that
  // read it — the compiler won't allow a value captured by a hook to be
  // modified afterwards, and none of these need memoizing anyway.

  // Start a new form. The outgoing object is REPLACED, never emptied, so a save
  // still in flight for the old form keeps the row and the photos it began with.
  const forgetFormScratch = () => {
    scratchRef.current = newFormScratch()
  }

  // Both of these start a fresh row: pressing Add (or opening another product)
  // with a form already open must not keep writing into the last one.
  //
  // Add also bumps the form's key: with a NEW product already open, `editingId`
  // is null before and after, so the form stayed mounted holding the last
  // product's fields and its next save wrote a second copy of it.
  const handleAdd = () => {
    setEditingId(null)
    forgetFormScratch()
    setRestored(null)
    setFormSeed((n) => n + 1)
    setShowForm(true)
  }

  const handleEdit = (id: string) => {
    setEditingId(id)
    forgetFormScratch()
    setRestored(null)
    setShowForm(true)
  }

  // Autosave. Runs on a debounce from the form and on the way out of it, so
  // dropping an extra angle and clicking away can never lose the work. A
  // product that doesn't exist yet is created as an unconfirmed draft (the same
  // orange-dot state a bulk-added photo lands in) and confirmed by Save.
  // Returns the row as persisted, so the form can adopt the asset refs and stop
  // re-uploading the same data URI on every pass.
  const handleAutosaveProduct = async (data: Omit<Product, 'id' | 'createdAt'>) => {
    // Read before the first await — this call belongs to the form that started
    // it, whatever the member has opened by the time it resolves.
    const scratch = scratchRef.current
    const saved = await persistProductImages(data, scratch.images)
    const existing = editingId ?? (scratch.rowId ? await scratch.rowId : null)
    if (existing) {
      await updateProduct(existing, saved, { silent: true })
      // The id goes back with the row: a read the form hands off on its way out
      // needs to know which product to write into, and the form is the only one
      // that knows whether its own save had landed yet.
      return { ...saved, id: existing }
    }
    // Claim the slot with the promise itself, with no await in between, so a
    // second pass can only ever wait on this add.
    scratch.rowId = addProduct({ ...saved, confirmed: false }, { silent: true })
    return { ...saved, id: await scratch.rowId }
  }

  // Memoized — captured by the useCallback save handlers below, so it must
  // be referentially stable for the React Compiler to keep their memoization.
  const closeForm = useCallback(() => {
    setEditingId(null)
    forgetFormScratch()
    setRestored(null)
    setShowForm(false)
  }, [])

  // Consume inter-app payload.
  // `activeBank`  → switch to the bank, exactly as the rail does (`selectBank`).
  // `openCreate`  → switch to the bank AND open a fresh create form (`handleAdd`).
  // This is a one-shot reaction to an external store event (and must call the
  // side-effecting consumePayload), so setting state inside the effect is the
  // correct tool here — not a cascading-render smell.
  //
  // Both close whatever form is open and clear the search, like the in-app
  // paths. A form left open on another bank's row used to survive the switch as
  // a blank Product form still carrying that row's id, so every save "updated"
  // a product that doesn't exist and the new one was silently thrown away.
  // Sits below `closeForm` because it resets the scratch through it — see the
  // note above `forgetFormScratch` on where scratch writes have to live.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (interAppPayload?.targetApp !== 'finder') return
    if (interAppPayload.targetField === 'activeBank') {
      const bank = interAppPayload.data as BankType
      if (BANK_TYPES.includes(bank)) {
        setActiveBank(bank)
        setQuery('')
        closeForm()
      }
      consumePayload()
    } else if (interAppPayload.targetField === 'openCreate') {
      const bank = interAppPayload.data as BankType
      if (BANK_TYPES.includes(bank)) {
        setActiveBank(bank)
        setQuery('')
        closeForm()
        setFormSeed((n) => n + 1)
        setShowForm(true)
      }
      consumePayload()
    }
  }, [interAppPayload, consumePayload, closeForm])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveProduct = useCallback(async (data: Omit<Product, 'id' | 'createdAt'>) => {
    const scratch = scratchRef.current
    const saved = { ...(await persistProductImages(data, scratch.images)), confirmed: true }
    // Waits on the autosave's row when one is mid-flight — Add Product used to
    // read past it and write a second copy of the product it was confirming.
    const id = editingId ?? (scratch.rowId ? await scratch.rowId : null)
    if (id) await updateProduct(id, saved)
    else await addProduct(saved)
    closeForm()
  }, [editingId, updateProduct, addProduct, closeForm])

  const trackInFlight = useCallback((id: string, active: boolean) => {
    setInFlightIds((prev) => {
      const next = new Set(prev)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  // A read that outlived its form — the member dropped a photo and then closed
  // the form or switched bank tab. The RUNNING call is handed over rather than
  // restarted, so leaving costs nothing and bills nothing; `rowId` resolves once
  // the form has flushed whatever it still owed the bank.
  const handleDetachExtraction = useCallback((job: Promise<ProductExtraction>, rowId: Promise<string | null>) => {
    void adoptDetachedExtraction({
      job,
      rowId,
      onStart: (id) => trackInFlight(id, true),
      onFinish: (id, ok, message) => {
        if (id) trackInFlight(id, false)
        addToast(message, ok ? 'success' : 'error')
        // If the member came back and opened this very product while the read
        // was still running, the form on screen is holding the row as it was
        // BEFORE the fields landed — and its next keystroke would autosave that
        // stale copy straight over them. Re-seed it from the row instead.
        if (ok && id && id === editingIdRef.current) setFormSeed((n) => n + 1)
      },
    })
  }, [trackInFlight, addToast])

  const handleBulkFiles = useCallback(async (files: File[]) => {
    // Names the format that bounced (AVIF, HEIC, …) rather than a bare count —
    // "skipped 3 files" doesn't tell anyone what to re-save them as.
    const { accepted: valid, rejection } = partitionImageFiles(files)
    if (rejection) addToast(rejection, valid.length === 0 ? 'error' : 'info')
    if (valid.length === 0) return

    const results = await Promise.all(valid.map((file) => saveProductDraft({
      file,
      onStart: (id) => trackInFlight(id, true),
      onFinish: (id) => trackInFlight(id, false),
    })))

    const succeeded = results.filter((r) => r.ok).length
    const failed = results.length - succeeded
    if (failed === 0) {
      addToast(`${succeeded} product${succeeded === 1 ? '' : 's'} extracted`, 'success')
      return
    }
    // One photo dropped and one photo failed: say WHY. A bare count is the right
    // shape for a batch and useless for a single drop, which is most of them —
    // it sends a member off re-cropping a photo when their key was the problem.
    const single = results.length === 1 ? results[0].reason : null
    addToast(
      single ?? `${succeeded} of ${results.length} extracted, ${failed} failed. Review drafts`,
      single ? 'error' : 'info',
    )
  }, [addToast, trackInFlight])

  // The other five forms autosave through `useBankAutosave`, which keeps the
  // row id and the photo memo in the FORM, so these only write: into the row
  // the form names, or a new one when it names none (its required fields have
  // just been filled). Silent, like the product autosave — a toast per pause in
  // typing is noise, and the form's own "Saved" is where the member looks.
  const autosaveModel = async (draft: ModelDraft, id: string | null, images: ImageMemo) => {
    const stored = { ...draft, characterImage: await persistImage(draft.characterImage, images) }
    if (id) await updateModel(id, stored, { silent: true })
    return { id: id ?? await addModel(stored, { silent: true }), stored }
  }

  const autosaveScript = async (draft: ScriptDraft, id: string | null) => {
    if (id) await updateScript(id, draft, { silent: true })
    return { id: id ?? await addScript(draft, { silent: true }), stored: draft }
  }

  const autosaveVoice = async (draft: VoiceDraft, id: string | null) => {
    if (id) await updateVoice(id, draft, { silent: true })
    return { id: id ?? await addVoice(draft, { silent: true }), stored: draft }
  }

  const autosaveBRoll = async (draft: BRollDraft, id: string | null, images: ImageMemo) => {
    const stored = { ...draft, imageUrl: await persistImage(draft.imageUrl, images) }
    if (id) await updateBRoll(id, stored, { silent: true })
    return { id: id ?? await addBRoll(stored, { silent: true }), stored }
  }

  const autosaveStyle = async (draft: StyleDraft, id: string | null) => {
    if (id) await updateStyle(id, draft, { silent: true })
    return { id: id ?? await addStyle(draft, { silent: true }), stored: draft }
  }

  // A form went away with changes it couldn't save. Say so, and offer them
  // back: Reopen lands on the same bank with the same row (or a new one) and
  // the form exactly as it was left. Finder stays mounted for the session, so
  // the toast's button can still reach it from anywhere in the app.
  const handleAbandoned = (bank: BankType) => (draft: unknown, id: string | null, message: string) => {
    addToast(message, 'info', {
      label: 'Reopen',
      run: () => {
        useAppStore.getState().openApp('finder')
        setActiveBank(bank)
        setQuery('')
        setEditingId(id)
        forgetFormScratch()
        setRestored({ bank, id, draft })
        setFormSeed((n) => n + 1)
        setShowForm(true)
      },
    })
  }
  // The seed for the form on screen, if it is the one a Reopen opened.
  const seedFor = (bank: BankType) =>
    restored && restored.bank === bank && restored.id === editingId ? restored.draft : undefined

  const editingProduct = editingId ? products.find((p) => p.id === editingId) : null
  const editingModel = editingId ? models.find((m) => m.id === editingId) : null
  const editingScript = editingId ? scripts.find((s) => s.id === editingId) : null
  const editingVoice = editingId ? voices.find((v) => v.id === editingId) : null
  const editingBRoll = editingId ? brolls.find((b) => b.id === editingId) : null
  const editingStyle = editingId ? styles.find((s) => s.id === editingId) : null
  const formKey = `${editingId ?? 'new'}:${formSeed}`

  // Products & Influencers pin the left column and scroll only the right side
  // on desktop, instead of scrolling the whole page.
  const fixedFormLayout = showForm && (activeBank === 'products' || activeBank === 'models')

  const selectBank = (bank: BankType) => { setActiveBank(bank); setQuery(''); closeForm() }

  // Search, the Characters filter and sort only mean something over a grid.
  const showLenses = counts[activeBank] > 0 && !showForm
  const showBulkAdd = activeBank === 'products' && !showForm
  // No Add on the Swipe File: every row in it is filed from Outliers and there
  // is no form to open, so the button used to blank the pane and strand you.
  const showAdd = activeBank !== 'swipes'

  return (
    // Sidebar + column, Finder's own shape. The banks moved off the top row and
    // down the left in September 2026: the strip and the toolbar were fighting
    // over one 57px line, and with search and the view switcher on it the last
    // tab scrolled off the end at 1440px. Below `md` there is no sidebar and the
    // tab strip is still the switcher.
    <div className="flex h-full">
      <BankSidebar
        banks={bankTypes}
        active={activeBank}
        counts={counts}
        onSelect={selectBank}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header — one 57px band from `md` up: the bank's name on the left (the
            sidebar says which one is selected; this says it in words, and gives
            the row a left edge), then search, then the buttons. On a phone it's
            three rows — the tab strip, the buttons, then search — because the
            seven tabs plus Sort plus Add can't share 390px, and squeezing them
            left the switcher as a sliver reading "P…".

            Between `md` and `lg` the sidebar has already taken 204px of the
            window and the band can't also hold the name: with it, Characters'
            row (search, filter, sort, Add) ran ~230px past a 768px window and
            Add was clipped off the end. There the name gives way — the sidebar
            row is lit and says it in words too — and search stretches from the
            left edge instead, which keeps the row's edge where it was. */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-ink/5 px-3 py-2 md:h-[57px] md:flex-row md:items-center md:gap-3 md:px-5 md:py-0">
          <h2 className="hidden shrink-0 text-[15px] font-medium tracking-tight text-ink-100 lg:block">
            {BANK_CONFIG[activeBank].label}
          </h2>
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide scroll-fade-r md:hidden">
            <SegmentedToggle<BankType>
              fitContent
              className="h-10 !p-1"
              value={activeBank}
              onChange={selectBank}
              options={bankTypes.map((bank) => ({
                value: bank,
                label: BANK_CONFIG[bank].label,
                icon: BANK_CONFIG[bank].icon,
                badge: counts[bank] > 0 ? counts[bank] : undefined,
              }))}
            />
          </div>
          {/* The two lenses that narrow the grid: search, and Characters'
              portrait / sheet split beside it (BankPicker's order — search, then
              what narrows it). On a phone they take the last row together
              (`order-last`), which is what keeps Characters to three header
              rows: sharing the button row, the filter pushed Add onto a fourth.
              Above `md` search stretches, but only to 240px from `lg`, where
              the name holds the left edge — it was a fixed 140px, sized for
              the tab strip this row used to share, and clipped a two-word query. */}
          {showLenses && (
            <div className="flex min-w-0 items-center gap-2 max-md:order-last md:flex-1 md:justify-end md:gap-3">
              <div className="relative min-w-0 flex-1 md:min-w-[120px] lg:max-w-[240px]">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // Just "Search": the header already names the bank being
                  // searched, and the field is at its narrowest at `md`.
                  placeholder="Search"
                  className="h-10 w-full rounded-full border border-ink/10 bg-ink/[0.04] pl-9 pr-8 text-[13px] font-medium tracking-tight text-ink-200 outline-none transition-colors placeholder:font-normal placeholder:text-ink-500 focus:border-ink/20"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    title="Clear search"
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/[0.08] hover:text-ink-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Characters sub-filter, sized to match the bank toggle (h-10
                  !p-1). Two copies rather than a label hidden by a class: a
                  hidden label still leaves its segment's gap behind, which sits
                  the glyph visibly off-centre. Words from `lg`, glyphs below. */}
              {activeBank === 'models' && (
                <>
                  <div className="shrink-0 lg:hidden">
                    <SegmentedToggle<ModelFilter>
                      fitContent
                      accent="influencers"
                      className="h-10 !p-1"
                      value={modelFilter}
                      onChange={setModelFilter}
                      options={MODEL_FILTER_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.icon ? '' : o.label,
                        ariaLabel: o.icon ? o.label : undefined,
                        icon: o.icon,
                      }))}
                    />
                  </div>
                  <div className="hidden shrink-0 lg:block">
                    <SegmentedToggle<ModelFilter>
                      fitContent
                      accent="influencers"
                      className="h-10 !p-1"
                      value={modelFilter}
                      onChange={setModelFilter}
                      options={MODEL_FILTER_OPTIONS}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {(showLenses || showBulkAdd || showAdd) && (
            <div className="flex shrink-0 items-center justify-end gap-2 md:ml-auto md:gap-3">
              {sortOptions && showLenses && (
                <SortControl value={sort} onChange={setSort} options={sortOptions} />
              )}
              {showBulkAdd && (
                <>
                  <input
                    ref={bulkInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      if (files.length > 0) handleBulkFiles(files)
                    }}
                  />
                  <button
                    onClick={() => bulkInputRef.current?.click()}
                    // The grid itself takes the same drop — say so where the
                    // pointer already is, since nothing on a full grid does.
                    title="Bulk add · or drop product photos straight onto the grid"
                    className="flex h-10 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.04] px-3.5 text-[13px] font-medium tracking-tight text-ink-300 transition-colors hover:bg-ink/[0.08] md:px-5"
                  >
                    <Upload className="h-4 w-4" />
                    {/* Icon-only on phones — the label crowded the toolbar. */}
                    <span className="hidden sm:inline">Bulk Add</span>
                  </button>
                </>
              )}
              {showAdd && (
                <button
                  onClick={handleAdd}
                  className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-medium tracking-tight text-ink-900 transition-colors hover:bg-ink-100"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content area — list or form. Forms render unboxed so they get the
            full width of the section. Products/Influencers use a fixed-left /
            scroll-right layout on desktop so the image stays put while the
            details scroll (no whole-page scroll). */}
        <div className={`flex-1 overflow-y-auto p-5 ${fixedFormLayout ? 'lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden' : ''}`}>
          {showForm ? (
            <div className={`mx-auto ${['products', 'models', 'brolls', 'scripts', 'styles'].includes(activeBank) ? 'max-w-5xl' : 'max-w-md'} ${fixedFormLayout ? 'w-full lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : ''}`}>
              {activeBank === 'products' && (
                <ProductForm
                  // Remount when the form is pointed at a different row (or at a
                  // new product): its fields are local state, and without this
                  // pressing Add with a form already open kept the last
                  // product's values — which autosave would then write to a row
                  // of its own. `editingId` doesn't change while autosaving, so
                  // typing never remounts the form.
                  key={formKey}
                  item={editingProduct}
                  onSave={handleSaveProduct}
                  onAutosave={handleAutosaveProduct}
                  onCancel={closeForm}
                  onDetachExtraction={handleDetachExtraction}
                />
              )}
              {/* Keyed like the product form, for the same reason: each holds
                  its fields — and now its row — in local state, so pointing it
                  at another row (or pressing Add with one open) has to be a
                  fresh mount, never a re-seed under the typist. */}
              {activeBank === 'models' && (
                <ModelForm
                  key={formKey}
                  item={editingModel}
                  seed={seedFor('models') as ModelDraft | undefined}
                  onAutosave={autosaveModel}
                  onAbandoned={handleAbandoned('models')}
                  onClose={closeForm}
                />
              )}
              {activeBank === 'scripts' && (
                <ScriptForm
                  key={formKey}
                  item={editingScript}
                  seed={seedFor('scripts') as ScriptDraft | undefined}
                  onAutosave={autosaveScript}
                  onAbandoned={handleAbandoned('scripts')}
                  onClose={closeForm}
                />
              )}
              {activeBank === 'voices' && (
                <VoiceForm
                  key={formKey}
                  item={editingVoice}
                  seed={seedFor('voices') as VoiceDraft | undefined}
                  onAutosave={autosaveVoice}
                  onAbandoned={handleAbandoned('voices')}
                  onClose={closeForm}
                />
              )}
              {activeBank === 'brolls' && (
                <BRollForm
                  key={formKey}
                  item={editingBRoll}
                  seed={seedFor('brolls') as BRollDraft | undefined}
                  onAutosave={autosaveBRoll}
                  onAbandoned={handleAbandoned('brolls')}
                  onClose={closeForm}
                />
              )}
              {activeBank === 'styles' && (
                <StyleForm
                  key={formKey}
                  item={editingStyle}
                  seed={seedFor('styles') as StyleDraft | undefined}
                  onAutosave={autosaveStyle}
                  onAbandoned={handleAbandoned('styles')}
                  onClose={closeForm}
                />
              )}
            </div>
          ) : (
            <BankList
              bankType={activeBank}
              onEdit={handleEdit}
              onAdd={handleAdd}
              sort={sort}
              query={query}
              modelFilter={modelFilter}
              inFlightProductIds={inFlightIds}
              onBulkProductFiles={handleBulkFiles}
            />
          )}
        </div>
      </div>
    </div>
  )
}
