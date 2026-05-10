import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Star } from 'lucide-react'
import {
  listModels,
  getDefaultModel,
  estimateCredits,
  formatCredits,
  type Task,
  type Mode,
  type ModelEntry,
  type CostEstimateParams,
} from '../utils/models'
import { useSettingsStore } from '../stores/settingsStore'
import ProviderLogo from './ProviderLogo'

interface ModelPickerProps {
  appId: string
  task: Task
  mode?: Mode
  value?: string
  onChange?: (modelId: string) => void
  // Used to compute credits-per-generation estimate shown inline.
  costParams?: CostEstimateParams
}

export default function ModelPicker({ appId, task, mode, value, onChange, costParams }: ModelPickerProps) {
  const setAppModel = useSettingsStore((s) => s.setAppModel)
  const getAppModel = useSettingsStore((s) => s.getAppModel)
  const persistedKey = `${appId}:${task}${mode ? `:${mode}` : ''}`

  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const models = listModels({ task, mode })
  const fallback = getDefaultModel(appId, task, mode)
  const persisted = getAppModel(persistedKey)
  const resolved = value ?? persisted ?? fallback?.id
  const selected = models.find((m) => m.id === resolved)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function pick(modelId: string) {
    setAppModel(persistedKey, modelId)
    onChange?.(modelId)
    setOpen(false)
  }

  if (models.length === 0) {
    return (
      <div className="text-[11px] text-zinc-600">
        No models available for {task}{mode ? ` / ${mode}` : ''}.
      </div>
    )
  }

  const selectedCredits = selected ? estimateCredits(selected.id, costParams) : null

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top
            // Dropdown is up to ~360px tall. Flip up if there's not enough room below.
            setOpenUpward(spaceBelow < 360 && spaceAbove > spaceBelow)
          }
          setOpen((v) => !v)
        }}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        {selected ? (
          <>
            <ProviderLogo provider={selected.provider} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-zinc-100">{selected.displayName}</span>
                {selected.tags.includes('recommended') && (
                  <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
                )}
              </div>
              <span className="truncate text-[10px] text-zinc-500">{selected.provider}</span>
            </div>
            {selectedCredits != null && (
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{formatCredits(selectedCredits)}</span>
            )}
          </>
        ) : (
          <span className="flex-1 truncate text-sm text-zinc-400">Select model</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className="max-h-[min(360px,60vh)] overflow-y-auto p-1">
            {models.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                active={m.id === resolved}
                costParams={costParams}
                onClick={() => pick(m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ModelRowProps {
  model: ModelEntry
  active: boolean
  costParams?: CostEstimateParams
  onClick: () => void
}

function ModelRow({ model, active, costParams, onClick }: ModelRowProps) {
  const credits = estimateCredits(model.id, costParams)
  const creditsLabel = formatCredits(credits)
  const isRecommended = model.tags.includes('recommended')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <ProviderLogo provider={model.provider} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-zinc-100">{model.displayName}</span>
          {isRecommended && (
            <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
          )}
        </div>
        <span className="truncate text-[10px] text-zinc-500">{model.provider}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {creditsLabel && (
          <span className="text-[11px] tabular-nums text-zinc-400">{creditsLabel}</span>
        )}
        {active ? (
          <Check className="h-4 w-4 text-sky-400" />
        ) : (
          <span className="h-4 w-4" />
        )}
      </div>
    </button>
  )
}
