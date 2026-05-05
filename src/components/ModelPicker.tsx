import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import {
  listModels,
  getDefaultModel,
  TAG_STYLES,
  type Task,
  type Mode,
  type ModelEntry,
} from '../utils/models'
import { useSettingsStore } from '../stores/settingsStore'

interface ModelPickerProps {
  appId: string
  task: Task
  mode?: Mode
  value?: string
  onChange?: (modelId: string) => void
  label?: string
}

export default function ModelPicker({ appId, task, mode, value, onChange, label = 'Model' }: ModelPickerProps) {
  const setAppModel = useSettingsStore((s) => s.setAppModel)
  const getAppModel = useSettingsStore((s) => s.getAppModel)
  const persistedKey = `${appId}:${task}${mode ? `:${mode}` : ''}`

  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{selected?.displayName ?? 'Select model'}</span>
          {selected && (
            <span className="hidden truncate text-[11px] text-zinc-500 sm:inline">{selected.provider}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-[#0A0A0A] py-1 shadow-2xl">
          {models.map((m) => (
            <ModelRow key={m.id} model={m} active={m.id === resolved} onClick={() => pick(m.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

interface ModelRowProps {
  model: ModelEntry
  active: boolean
  onClick: () => void
}

function ModelRow({ model, active, onClick }: ModelRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">{model.displayName}</span>
          <span className="truncate text-[11px] text-zinc-500">{model.provider}</span>
        </div>
        {model.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {model.tags.map((tag) => {
              const style = TAG_STYLES[tag]
              return (
                <span
                  key={tag}
                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${style.className}`}
                >
                  {style.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
      {active && <Check className="h-4 w-4 shrink-0 text-zinc-300" />}
    </button>
  )
}
