import { useState, useEffect, useRef } from 'react'
import { X, Search, Plus, FolderOpen } from 'lucide-react'
import type { BankType } from '../utils/constants'
import { BANK_CONFIG } from '../utils/constants'
import { useBankStore } from '../stores/bankStore'
import { useAppStore } from '../stores/appStore'
import type { Product, Model, Script, VoicePreset } from '../stores/types'
import BankItemCard from './BankItemCard'
import { useIsDesktop } from '../hooks/useBreakpoint'

type BankItem = Product | Model | Script | VoicePreset

interface BankPickerProps {
  bankType: BankType
  isOpen: boolean
  onSelect: (item: BankItem) => void
  onClose: () => void
}

function getItemName(bankType: BankType, item: BankItem): string {
  switch (bankType) {
    case 'products': return (item as Product).productName
    case 'models': return (item as Model).name
    case 'scripts': return (item as Script).title
    case 'voices': return (item as VoicePreset).label
    case 'brolls': return (item as { prompt?: string }).prompt ?? 'B-Roll'
  }
}

export default function BankPicker({ bankType, isOpen, onSelect, onClose }: BankPickerProps) {
  const [search, setSearch] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAddName, setQuickAddName] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const addProduct = useBankStore((s) => s.addProduct)
  const addModel = useBankStore((s) => s.addModel)
  const addScript = useBankStore((s) => s.addScript)
  const addVoice = useBankStore((s) => s.addVoice)
  const openApp = useAppStore((s) => s.openApp)
  const sendToApp = useAppStore((s) => s.sendToApp)

  const items: BankItem[] =
    bankType === 'products' ? products :
    bankType === 'models' ? models :
    bankType === 'scripts' ? scripts :
    voices

  const filtered = search.trim()
    ? items.filter((item) =>
        getItemName(bankType, item).toLowerCase().includes(search.toLowerCase())
      )
    : items

  const isEmpty = items.length === 0

  // Focus search on open, auto-expand quick-add if bank is empty
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setQuickAddName('')
      setShowQuickAdd(isEmpty)
      if (!isEmpty) {
        setTimeout(() => searchRef.current?.focus(), 100)
      }
    }
  }, [isOpen, isEmpty])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const handleSelect = (item: BankItem) => {
    onSelect(item)
    onClose()
  }

  const handleQuickAdd = () => {
    if (!quickAddName.trim()) return

    const name = quickAddName.trim()
    let newItem: BankItem | null = null

    if (bankType === 'products') {
      addProduct({ productImage: '', productName: name, productDescription: '', targetMarket: '', painPoints: '', usps: '', benefits: '', offer: '', cta: '' })
      // Get the latest item (just added)
      newItem = useBankStore.getState().products[useBankStore.getState().products.length - 1]
    } else if (bankType === 'models') {
      addModel({ characterImage: '', name, notes: '', jsonProfile: null, source: 'manual-import' })
      newItem = useBankStore.getState().models[useBankStore.getState().models.length - 1]
    } else if (bankType === 'scripts') {
      addScript({ title: name, scriptText: '', linkedProductId: '', source: 'manual' })
      newItem = useBankStore.getState().scripts[useBankStore.getState().scripts.length - 1]
    } else {
      addVoice({ label: name, voiceId: '', voiceName: '', gender: 'Female', stability: 0.5, linkedModelId: '' })
      newItem = useBankStore.getState().voices[useBankStore.getState().voices.length - 1]
    }

    if (newItem) {
      onSelect(newItem)
    }
    onClose()
  }

  const handleManageInFinder = () => {
    onClose()
    sendToApp({ targetApp: 'finder', targetField: 'activeBank', data: bankType })
    openApp('finder')
  }

  const label = BANK_CONFIG[bankType].label

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed z-50 flex flex-col border-white/5 bg-[#0a0a0a]/95 backdrop-blur-2xl transition-transform duration-300 ease-out ${
          isDesktop
            ? `right-0 top-9 bottom-20 w-[380px] border-l ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
            : `inset-x-0 bottom-0 top-12 border-t rounded-t-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
        }`}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
            Select {label.replace(/s$/, '')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 lg:p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search — full width on mobile */}
        <div className="border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="text-sm text-zinc-600">
                {search ? 'No matches found' : `No ${label.toLowerCase()} yet`}
              </span>
              <span className="text-xs text-zinc-700">
                {search ? 'Try a different search' : 'Add one below to get started'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((item) => (
                <BankItemCard
                  key={item.id}
                  bankType={bankType}
                  item={item}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — quick add + manage in finder */}
        <div className="border-t border-white/5 px-4 py-3">
          {showQuickAdd ? (
            <div className="flex flex-col gap-2">
              <input
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd() }}
                placeholder={`${label.replace(/s$/, '')} name...`}
                autoFocus
                className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleQuickAdd}
                  disabled={!quickAddName.trim()}
                  className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/15 disabled:opacity-40"
                >
                  Create & Select
                </button>
                <button
                  onClick={() => { setShowQuickAdd(false); setQuickAddName('') }}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 p-3 text-sm text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300"
            >
              <Plus className="h-4 w-4" />
              Add New {label.replace(/s$/, '')}
            </button>
          )}

          <button
            onClick={handleManageInFinder}
            className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
          >
            <FolderOpen className="h-3 w-3" />
            Manage in Bank
          </button>
        </div>
      </div>
    </>
  )
}
