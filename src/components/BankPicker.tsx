import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Plus, FolderOpen, Check } from 'lucide-react'
import type { BankType } from '../utils/constants'
import { BANK_CONFIG } from '../utils/constants'
import { useBankStore } from '../stores/bankStore'
import { useAppStore } from '../stores/appStore'
import type { Product, Model, Script, VoicePreset, BRoll } from '../stores/types'
import BankItemCard from './BankItemCard'
import { useIsDesktop } from '../hooks/useBreakpoint'

type BankItem = Product | Model | Script | VoicePreset | BRoll

interface BankPickerProps {
  bankType: BankType
  isOpen: boolean
  onSelect: (item: BankItem) => void
  onClose: () => void
  // Optional extra filter beyond search (e.g. only brolls with `imageUrl`).
  filter?: (item: BankItem) => boolean
  // Multi-select mode — accumulates selections, returns the array on confirm.
  multiSelect?: boolean
  onSelectMany?: (items: BankItem[]) => void
  // When provided, the picker renders an inline tab strip so the user can
  // switch between banks without closing. `bankType` becomes the *initial*
  // active tab. The tabs array's order is the tab strip's order. Each tab
  // can carry its own optional filter (used today to keep brolls with
  // `imageUrl` only when surfacing them as image refs).
  tabs?: Array<BankType | { type: BankType; filter?: (item: BankItem) => boolean }>
}

function getItemName(bankType: BankType, item: BankItem): string {
  switch (bankType) {
    case 'products': return (item as Product).productName
    case 'models': return (item as Model).name
    case 'scripts': return (item as Script).title
    case 'voices': return (item as VoicePreset).label
    case 'brolls': return (item as BRoll).prompt ?? 'B-Roll'
    default: return ''
  }
}

export default function BankPicker({
  bankType,
  isOpen,
  onSelect,
  onClose,
  filter,
  multiSelect = false,
  onSelectMany,
  tabs,
}: BankPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // When `tabs` is provided, the active bank is local state initialised to
  // the caller's `bankType`. Otherwise the active bank is just `bankType`.
  const [activeTab, setActiveTab] = useState<BankType>(bankType)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  // Normalize the tabs prop into a stable shape.
  const normalizedTabs = tabs?.map((t) =>
    typeof t === 'string' ? { type: t, filter: undefined } : t
  )
  const currentBankType: BankType = normalizedTabs ? activeTab : bankType
  const currentTabFilter = normalizedTabs?.find((t) => t.type === currentBankType)?.filter

  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const openApp = useAppStore((s) => s.openApp)
  const sendToApp = useAppStore((s) => s.sendToApp)

  const items: BankItem[] =
    currentBankType === 'products' ? products :
    currentBankType === 'models' ? models :
    currentBankType === 'scripts' ? scripts :
    currentBankType === 'voices' ? voices :
    brolls

  // Apply the per-tab filter (when in tab-mode) ahead of the caller's
  // general filter so the caller-supplied filter stays in charge.
  const itemsAfterTabFilter = currentTabFilter ? items.filter(currentTabFilter) : items
  const itemsAfterFilter = filter ? itemsAfterTabFilter.filter(filter) : itemsAfterTabFilter

  const filtered = search.trim()
    ? itemsAfterFilter.filter((item) =>
        getItemName(bankType, item).toLowerCase().includes(search.toLowerCase())
      )
    : itemsAfterFilter

  // Brolls don't have a Finder-form create path (no useful empty record to
  // create) — they come from generation flows. Other bank types let the
  // user jump to Bank with the create form pre-opened.
  const supportsCreate = currentBankType !== 'brolls'

  // Reset transient state and pick the initial tab when the picker opens.
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIds([])
      setActiveTab(bankType)
      const initialItems =
        bankType === 'products' ? products :
        bankType === 'models' ? models :
        bankType === 'scripts' ? scripts :
        bankType === 'voices' ? voices :
        brolls
      if (initialItems.length > 0) {
        setTimeout(() => searchRef.current?.focus(), 100)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bankType])

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
    if (multiSelect) {
      setSelectedIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      )
      return
    }
    onSelect(item)
    onClose()
  }

  const handleConfirmMulti = () => {
    if (!onSelectMany || selectedIds.length === 0) return
    const picked = filtered.filter((it) => selectedIds.includes(it.id))
    onSelectMany(picked)
    onClose()
  }

  // Jump to the Bank app with the create form for this bank pre-opened.
  // Finder consumes `openCreate` (see Finder.tsx) to switch bank + open form.
  const handleAddNew = () => {
    onClose()
    sendToApp({ targetApp: 'finder', targetField: 'openCreate', data: currentBankType })
    openApp('finder')
  }

  const handleManageInFinder = () => {
    onClose()
    sendToApp({ targetApp: 'finder', targetField: 'activeBank', data: currentBankType })
    openApp('finder')
  }

  const label = BANK_CONFIG[currentBankType].label

  // Render through a portal so the picker is parented at document root,
  // not inside whichever caller mounts it. This sidesteps the
  // backdrop-filter / transform containing-block trap (callers with those
  // styles otherwise pin our `position: fixed` to themselves).
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  const picker = (
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
            ? `right-0 top-14 bottom-0 w-[380px] border-l ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
            : `inset-x-0 bottom-0 top-14 border-t rounded-t-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
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
            Select {normalizedTabs ? 'from bank' : label.replace(/s$/, '')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 lg:p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Optional bank-switch tabs. Underline indicator, same style as
            VoiceStudio's Settings/History tab strip. */}
        {normalizedTabs && (
          <div className="flex items-center gap-1 border-b border-white/5 px-3">
            {normalizedTabs.map((t) => {
              const active = t.type === currentBankType
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => { setActiveTab(t.type); setSearch(''); setSelectedIds([]) }}
                  className={`relative flex items-center gap-1.5 px-3 pb-2 pt-3 text-[13px] font-medium tracking-tight transition-colors ${
                    active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{BANK_CONFIG[t.type].label}</span>
                  <span
                    className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
                      active ? 'bg-zinc-100' : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        )}

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
              {filtered.map((item) => {
                const isSelected = multiSelect && selectedIds.includes(item.id)
                return (
                  <div key={item.id} className="relative">
                    <BankItemCard
                      bankType={currentBankType}
                      item={item}
                      onClick={() => handleSelect(item)}
                      selected={isSelected}
                    />
                    {isSelected && (
                      <div className="pointer-events-none absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — add new (jumps to Bank with create form) + manage */}
        <div className="border-t border-white/5 px-4 py-3">
          {multiSelect ? (
            <button
              onClick={handleConfirmMulti}
              disabled={selectedIds.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add {selectedIds.length || ''} {selectedIds.length === 1 ? 'item' : 'items'}
            </button>
          ) : !supportsCreate ? (
            <button
              onClick={handleManageInFinder}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <FolderOpen className="h-3 w-3" />
              Manage in Bank
            </button>
          ) : (
            <>
              <button
                onClick={handleAddNew}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
              >
                <Plus className="h-4 w-4" />
                Add New {label.replace(/s$/, '')}
              </button>
              <button
                onClick={handleManageInFinder}
                className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                <FolderOpen className="h-3 w-3" />
                Manage in Bank
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(picker, portalTarget)
}
