import { useState } from 'react'
import { Volume2, Save, Check, Trash2, Play } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import type { VoiceHistoryItem } from '../../../stores/types'
import { seedColor } from './VoicePickerView'

interface HistoryViewProps {
  items: VoiceHistoryItem[]
  activeId: string | null
  onSelect: (item: VoiceHistoryItem) => void
  onDelete: (id: string) => void
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function HistoryView({ items, activeId, onSelect, onDelete }: HistoryViewProps) {
  const [saveFormId, setSaveFormId] = useState<string | null>(null)
  const [saveLabel, setSaveLabel] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const addVoice = useBankStore((s) => s.addVoice)

  const handleSavePreset = (item: VoiceHistoryItem) => {
    if (!saveLabel.trim()) return
    addVoice({
      label: saveLabel.trim(),
      voiceId: item.voiceId,
      voiceName: item.voiceName,
      gender: item.gender,
      stability: item.stability,
      similarityBoost: item.similarityBoost,
      style: item.style,
      speed: item.speed,
      linkedModelId: '',
    })
    setSaveFormId(null)
    setSaveLabel('')
    setSavedId(item.id)
    setTimeout(() => setSavedId(null), 3000)
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <Volume2 className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-600">No voiceovers yet</p>
        <p className="text-center text-xs text-zinc-700">Your generated voiceovers will land here.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive = activeId === item.id
            const isSaved = savedId === item.id
            const inSaveForm = saveFormId === item.id

            return (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className={`group cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-indigo-500/30 bg-indigo-500/5'
                    : 'border-transparent hover:border-white/10 hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                    style={{ background: seedColor(item.voiceId) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] leading-snug text-zinc-200">
                      {item.scriptPreview}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <span className="font-medium text-zinc-400">{item.voiceName}</span>
                      <span>·</span>
                      <span>{formatRelative(item.createdAt)}</span>
                    </div>
                  </div>
                  {isActive && (
                    <Play className="mt-1 h-3 w-3 shrink-0 text-indigo-400" />
                  )}
                </div>

                {/* Actions row — only when active or hovered */}
                <div
                  className={`mt-2 flex items-center gap-1.5 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {inSaveForm ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(item) }}
                        placeholder="Preset name..."
                        autoFocus
                        className="w-28 rounded-full border border-white/10 bg-transparent px-2.5 py-1 text-[10px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/30"
                      />
                      <button
                        onClick={() => handleSavePreset(item)}
                        disabled={!saveLabel.trim()}
                        className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setSaveFormId(null); setSaveLabel('') }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSaveFormId(item.id) }}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                        isSaved ? 'text-green-400' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                      }`}
                    >
                      {isSaved ? (
                        <><Check className="h-3 w-3" /> Saved</>
                      ) : (
                        <><Save className="h-3 w-3" /> Save preset</>
                      )}
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
