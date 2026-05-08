import { useState, useEffect, useCallback } from 'react'
import { Plus, Package, UserRound, FileText, Mic, Film } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { BankType } from '../../utils/constants'
import { BANK_CONFIG } from '../../utils/constants'
import type { Product, Model, Script, VoicePreset, BRoll } from '../../stores/types'
import { saveFromDataUrl } from '../../utils/assetStore'
import BankList from './BankList'
import ProductForm from './ProductForm'
import ModelForm from './ModelForm'
import ScriptForm from './ScriptForm'
import VoiceForm from './VoiceForm'
import BRollForm from './BRollForm'

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

  // Consume inter-app payload (e.g. desktop folder double-click)
  useEffect(() => {
    if (interAppPayload?.targetApp === 'finder' && interAppPayload?.targetField === 'activeBank') {
      const bank = interAppPayload.data as BankType
      if (BANK_TYPES.includes(bank)) {
        setActiveBank(bank)
      }
      consumePayload()
    }
  }, [interAppPayload, consumePayload])

  const counts: Record<BankType, number> = {
    products: products.length,
    models: models.length,
    scripts: scripts.length,
    voices: voices.length,
    brolls: brolls.length,
  }

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
    const saved = { ...data }
    if (saved.productImage && saved.productImage.startsWith('data:')) {
      saved.productImage = await saveFromDataUrl(saved.productImage)
    }
    if (editingId) updateProduct(editingId, saved)
    else addProduct(saved)
    closeForm()
  }, [editingId, updateProduct, addProduct])

  const handleSaveModel = useCallback(async (data: Omit<Model, 'id' | 'createdAt'>) => {
    const saved = { ...data }
    if (saved.characterImage && saved.characterImage.startsWith('data:')) {
      saved.characterImage = await saveFromDataUrl(saved.characterImage)
    }
    if (editingId) updateModel(editingId, saved)
    else addModel(saved)
    closeForm()
  }, [editingId, updateModel, addModel])

  const handleSaveScript = (data: Omit<Script, 'id' | 'createdAt'>) => {
    if (editingId) updateScript(editingId, data)
    else addScript(data)
    closeForm()
  }

  const handleSaveVoice = (data: Omit<VoicePreset, 'id' | 'createdAt'>) => {
    if (editingId) updateVoice(editingId, data)
    else addVoice(data)
    closeForm()
  }

  const handleSaveBRoll = useCallback(async (data: Omit<BRoll, 'id' | 'createdAt'>) => {
    const saved = { ...data }
    if (saved.imageUrl && saved.imageUrl.startsWith('data:')) {
      saved.imageUrl = await saveFromDataUrl(saved.imageUrl)
    }
    if (editingId) updateBRoll(editingId, saved)
    else addBRoll(saved)
    closeForm()
  }, [editingId, updateBRoll, addBRoll])

  const editingProduct = editingId ? products.find((p) => p.id === editingId) : null
  const editingModel = editingId ? models.find((m) => m.id === editingId) : null
  const editingScript = editingId ? scripts.find((s) => s.id === editingId) : null
  const editingVoice = editingId ? voices.find((v) => v.id === editingId) : null
  const editingBRoll = editingId ? brolls.find((b) => b.id === editingId) : null

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar — horizontal scrollable pills on mobile, vertical on desktop */}
      <div className="flex lg:w-52 shrink-0 flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible border-b lg:border-b-0 lg:border-r border-white/5 bg-white/[0.02] py-2 lg:py-3 px-2 lg:px-0 gap-1 lg:gap-0">
        <span className="hidden lg:block mb-3 px-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600">
          Banks
        </span>
        {BANK_TYPES.map((bank) => {
          const Icon = SIDEBAR_ICONS[bank]
          const isActive = activeBank === bank
          return (
            <button
              key={bank}
              onClick={() => { setActiveBank(bank); closeForm() }}
              className={`lg:mx-2 flex items-center gap-2 lg:gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${isActive
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
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {/* Content area — list or form */}
        <div className="flex-1 overflow-y-auto p-5">
          {showForm ? (
            <div className={`mx-auto rounded-xl border border-white/5 bg-white/[0.02] p-5 ${['products', 'models', 'brolls', 'scripts'].includes(activeBank) ? 'max-w-3xl' : 'max-w-md'}`}>
              {activeBank === 'products' && (
                <ProductForm item={editingProduct} onSave={handleSaveProduct} onCancel={closeForm} />
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
            <BankList bankType={activeBank} onEdit={handleEdit} onAdd={handleAdd} />
          )}
        </div>
      </div>
    </div>
  )
}
