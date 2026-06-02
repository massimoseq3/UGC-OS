import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Package, UserRound, FileText, Mic, Film, Upload } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { BankType } from '../../utils/constants'
import { BANK_CONFIG } from '../../utils/constants'
import type { Product, Model, Script, VoicePreset, BRoll } from '../../stores/types'
import { saveFromDataUrl } from '../../utils/assetStore'
import BankList, { SortControl } from './BankList'
import { useBankSort } from './bankSort'
import ProductForm from './ProductForm'
import ModelForm from './ModelForm'
import ScriptForm from './ScriptForm'
import VoiceForm from './VoiceForm'
import BRollForm from './BRollForm'
import { isValidImageFile } from './services/imageValidation'
import { saveProductDraft } from './services/saveProductDraft'

const SIDEBAR_ICONS: Record<BankType, React.ElementType> = {
  products: Package,
  models: UserRound,
  scripts: FileText,
  voices: Mic,
  brolls: Film,
}

const BANK_TYPES: BankType[] = ['products', 'models', 'scripts', 'voices', 'brolls']

export default function Finder() {
  const [activeBank, setActiveBank] = useState<BankType>('products')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

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

  // Consume inter-app payload.
  // `activeBank`  → just switch to the bank.
  // `openCreate`  → switch to the bank AND open the create form (no editingId).
  // This is a one-shot reaction to an external store event (and must call the
  // side-effecting consumePayload), so setting state inside the effect is the
  // correct tool here — not a cascading-render smell.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (interAppPayload?.targetApp !== 'finder') return
    if (interAppPayload.targetField === 'activeBank') {
      const bank = interAppPayload.data as BankType
      if (BANK_TYPES.includes(bank)) {
        setActiveBank(bank)
      }
      consumePayload()
    } else if (interAppPayload.targetField === 'openCreate') {
      const bank = interAppPayload.data as BankType
      if (BANK_TYPES.includes(bank)) {
        setActiveBank(bank)
        setEditingId(null)
        setShowForm(true)
      }
      consumePayload()
    }
  }, [interAppPayload, consumePayload])
  /* eslint-enable react-hooks/set-state-in-effect */

  const counts: Record<BankType, number> = {
    products: products.length,
    models: models.length,
    scripts: scripts.length,
    voices: voices.length,
    brolls: brolls.length,
  }

  const [sort, setSort, sortOptions] = useBankSort(activeBank)

  const handleAdd = () => {
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (id: string) => {
    setEditingId(id)
    setShowForm(true)
  }

  const closeForm = () => {
    setEditingId(null)
    setShowForm(false)
  }

  const handleSaveProduct = useCallback(async (data: Omit<Product, 'id' | 'createdAt'>) => {
    const saved: Omit<Product, 'id' | 'createdAt'> = { ...data, confirmed: true }
    if (saved.productImage && saved.productImage.startsWith('data:')) {
      saved.productImage = await saveFromDataUrl(saved.productImage)
    }
    if (editingId) await updateProduct(editingId, saved)
    else await addProduct(saved)
    closeForm()
  }, [editingId, updateProduct, addProduct])

  const trackInFlight = useCallback((id: string, active: boolean) => {
    setInFlightIds((prev) => {
      const next = new Set(prev)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleCancelDuringExtraction = useCallback((file: File, partial: Omit<Product, 'id' | 'createdAt'>) => {
    closeForm()
    saveProductDraft({
      file,
      initial: partial,
      onStart: (id) => trackInFlight(id, true),
      onFinish: (id, ok) => {
        trackInFlight(id, false)
        addToast(ok ? 'Draft product saved' : 'Saved as draft (extraction failed)', ok ? 'success' : 'info')
      },
    })
  }, [trackInFlight, addToast])

  const handleBulkFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(isValidImageFile)
    const rejected = files.length - valid.length
    if (valid.length === 0) {
      addToast('No valid images (need JPG / PNG / WebP under 10 MB)', 'error')
      return
    }
    if (rejected > 0) addToast(`Skipped ${rejected} unsupported file${rejected === 1 ? '' : 's'}`, 'info')

    const results = await Promise.all(valid.map((file) => saveProductDraft({
      file,
      onStart: (id) => trackInFlight(id, true),
      onFinish: (id) => trackInFlight(id, false),
    })))

    const succeeded = results.filter((r) => r.ok).length
    const failed = results.length - succeeded
    const summary = failed === 0
      ? `${succeeded} product${succeeded === 1 ? '' : 's'} extracted`
      : `${succeeded} of ${results.length} extracted, ${failed} failed — review drafts`
    addToast(summary, failed === 0 ? 'success' : 'info')
  }, [addToast, trackInFlight])

  const handleSaveModel = useCallback(async (data: Omit<Model, 'id' | 'createdAt'>) => {
    const saved = { ...data }
    if (saved.characterImage && saved.characterImage.startsWith('data:')) {
      saved.characterImage = await saveFromDataUrl(saved.characterImage)
    }
    if (editingId) await updateModel(editingId, saved)
    else await addModel(saved)
    closeForm()
  }, [editingId, updateModel, addModel])

  const handleSaveScript = async (data: Omit<Script, 'id' | 'createdAt'>) => {
    if (editingId) await updateScript(editingId, data)
    else await addScript(data)
    closeForm()
  }

  const handleSaveVoice = async (data: Omit<VoicePreset, 'id' | 'createdAt'>) => {
    if (editingId) await updateVoice(editingId, data)
    else await addVoice(data)
    closeForm()
  }

  const handleSaveBRoll = useCallback(async (data: Omit<BRoll, 'id' | 'createdAt'>) => {
    const saved = { ...data }
    if (saved.imageUrl && saved.imageUrl.startsWith('data:')) {
      saved.imageUrl = await saveFromDataUrl(saved.imageUrl)
    }
    if (editingId) await updateBRoll(editingId, saved)
    else await addBRoll(saved)
    closeForm()
  }, [editingId, updateBRoll, addBRoll])

  const editingProduct = editingId ? products.find((p) => p.id === editingId) : null
  const editingModel = editingId ? models.find((m) => m.id === editingId) : null
  const editingScript = editingId ? scripts.find((s) => s.id === editingId) : null
  const editingVoice = editingId ? voices.find((v) => v.id === editingId) : null
  const editingBRoll = editingId ? brolls.find((b) => b.id === editingId) : null

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Sidebar — horizontal scrollable pills on mobile, vertical on desktop */}
      <div className="flex md:w-52 shrink-0 flex-row md:flex-col overflow-x-auto md:overflow-x-visible border-b md:border-b-0 md:border-r border-white/5 bg-white/[0.02] py-2 md:py-3 px-2 md:px-0 gap-1 md:gap-0">
        <span className="hidden md:block mb-3 px-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600">
          Banks
        </span>
        {BANK_TYPES.map((bank) => {
          const Icon = SIDEBAR_ICONS[bank]
          const isActive = activeBank === bank
          return (
            <button
              key={bank}
              onClick={() => { setActiveBank(bank); closeForm() }}
              className={`md:mx-2 flex items-center gap-2 md:gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${isActive
                  ? 'bg-white/[0.07] text-zinc-200'
                  : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span className="flex-1 tracking-tight">{BANK_CONFIG[bank].label}</span>
              <span className="text-[11px] tabular-nums text-zinc-600">{counts[bank]}</span>
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-200">
            {BANK_CONFIG[activeBank].label}
          </h2>
          <div className="flex items-center gap-3">
            {sortOptions && counts[activeBank] > 0 && !showForm && (
              <SortControl value={sort} onChange={setSort} options={sortOptions} />
            )}
            {activeBank === 'products' && !showForm && (
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
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Bulk add
                </button>
              </>
            )}
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Content area — list or form */}
        <div className="flex-1 overflow-y-auto p-5">
          {showForm ? (
            <div className={`mx-auto rounded-xl border border-white/5 bg-white/[0.02] p-5 ${activeBank === 'products' ? 'max-w-5xl' : ['models', 'brolls', 'scripts'].includes(activeBank) ? 'max-w-3xl' : 'max-w-md'}`}>
              {activeBank === 'products' && (
                <ProductForm
                  item={editingProduct}
                  onSave={handleSaveProduct}
                  onCancel={closeForm}
                  onCancelDuringExtraction={handleCancelDuringExtraction}
                />
              )}
              {activeBank === 'models' && (
                <ModelForm item={editingModel} onSave={handleSaveModel} onCancel={closeForm} />
              )}
              {activeBank === 'scripts' && (
                <ScriptForm item={editingScript} onSave={handleSaveScript} onCancel={closeForm} />
              )}
              {activeBank === 'voices' && (
                <VoiceForm item={editingVoice} onSave={handleSaveVoice} onCancel={closeForm} />
              )}
              {activeBank === 'brolls' && (
                <BRollForm item={editingBRoll} onSave={handleSaveBRoll} onCancel={closeForm} />
              )}
            </div>
          ) : (
            <BankList
              bankType={activeBank}
              onEdit={handleEdit}
              onAdd={handleAdd}
              sort={sort}
              inFlightProductIds={inFlightIds}
              onBulkProductFiles={handleBulkFiles}
            />
          )}
        </div>
      </div>
    </div>
  )
}
