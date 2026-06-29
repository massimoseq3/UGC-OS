import { useRef, useState } from 'react'
import { X, Plus, Mic, Film, UserRound } from 'lucide-react'
import BankPicker from '../../../components/BankPicker'
import { readMediaDuration } from '../../../utils/media'
import { fileToDataUri } from '../../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../../utils/assetStore'
import { useOmniVoiceStore, type OmniVoice } from '../../../stores/omniVoiceStore'
import { useAppStore } from '../../../stores/appStore'
import type { Model } from '../../../stores/types'
import type { PromptRef } from './PromptPanel'
import OmniVoiceDesigner from './OmniVoiceDesigner'

// Gemini Omni's extra inputs: persistent characters (from the Influencers
// bank), designed voices, and one trimmed source video clip. All Omni inputs
// share a 7-slot quota with the reference images:
//   images ×1  +  clip ×2  +  characters ×1  ≤ 7
// The quota readout lives here; the parent passes how many image refs are
// attached so the math covers the whole generation.

const MAX_CHARACTERS = 3
const MAX_VOICES = 3
const MAX_CLIP_WINDOW_S = 10

function omniQuotaUsed(refs: PromptRef[]): number {
  const images = refs.filter((r) => r.slot === 'ref' || r.slot === 'start' || r.slot === 'end').length
  const characters = refs.filter((r) => r.slot === 'omni-character').length
  const clip = refs.some((r) => r.slot === 'omni-clip') ? 2 : 0
  return images + characters + clip
}

interface OmniInputsSectionProps {
  refs: PromptRef[]
  onChangeRefs: (next: PromptRef[]) => void
}

export default function OmniInputsSection({ refs, onChangeRefs }: OmniInputsSectionProps) {
  const voices = useOmniVoiceStore((s) => s.voices)
  const removeVoice = useOmniVoiceStore((s) => s.removeVoice)
  const addToast = useAppStore((s) => s.addToast)

  const [characterPickerOpen, setCharacterPickerOpen] = useState(false)
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false)
  const [designerOpen, setDesignerOpen] = useState(false)
  const clipInputRef = useRef<HTMLInputElement>(null)

  const characterRefs = refs.filter((r) => r.slot === 'omni-character')
  const voiceRefs = refs.filter((r) => r.slot === 'omni-voice')
  const clipRef = refs.find((r) => r.slot === 'omni-clip')

  const quotaUsed = omniQuotaUsed(refs)

  function addCharacters(items: Model[]) {
    void (async () => {
      const additions: PromptRef[] = []
      for (const item of items) {
        if (characterRefs.length + additions.length >= MAX_CHARACTERS) break
        if (characterRefs.some((r) => r.bankModelId === item.id)) continue
        if (quotaUsed + additions.length >= 7) {
          addToast('Omni input quota reached (7 slots) — remove an image or the clip first.', 'error')
          break
        }
        // Convert the bank image to a renderable data URI for the chip.
        let url = item.characterImage
        if (isAssetRef(url)) {
          const asset = await getAsBase64(url)
          if (!asset) continue
          url = `data:${asset.mimeType};base64,${asset.base64}`
        }
        additions.push({ url, label: item.name, source: 'character', slot: 'omni-character', bankModelId: item.id })
      }
      if (additions.length > 0) onChangeRefs([...refs, ...additions])
    })()
  }

  function attachVoice(voice: OmniVoice) {
    if (voiceRefs.length >= MAX_VOICES) return
    if (voiceRefs.some((r) => r.omniId === voice.kieAudioId)) return
    onChangeRefs([...refs, { url: '', label: voice.name, source: 'upload', slot: 'omni-voice', omniId: voice.kieAudioId }])
  }

  async function handleClipFile(file: File | null) {
    if (!file) return
    if (quotaUsed + 2 > 7) {
      addToast('The source clip needs 2 free slots — remove images or influencers first.', 'error')
      return
    }
    const dataUri = await fileToDataUri(file)
    let duration: number | undefined
    try {
      duration = await readMediaDuration(dataUri, 'video')
    } catch { /* let kie validate */ }
    if (duration && duration > 30) {
      addToast(`Source clips can't exceed 30s — this one is ${Math.ceil(duration)}s.`, 'error')
      return
    }
    const ends = Math.min(MAX_CLIP_WINDOW_S, duration ?? MAX_CLIP_WINDOW_S)
    onChangeRefs([
      ...refs.filter((r) => r.slot !== 'omni-clip'),
      { url: dataUri, label: file.name, source: 'upload', slot: 'omni-clip', clipStart: 0, clipEnds: Math.round(ends * 10) / 10, durationSeconds: duration },
    ])
  }

  function patchClip(patch: Partial<PromptRef>) {
    onChangeRefs(refs.map((r) => (r.slot === 'omni-clip' ? { ...r, ...patch } : r)))
  }

  function removeRef(target: PromptRef) {
    onChangeRefs(refs.filter((r) => r !== target))
  }

  return (
    <div className="space-y-4">
      {/* Characters + Voices share one row so both stay above the fold.
          Boxed dashed cards mirror the Reference Images / Audio / Video slots
          — the "going forward" input aesthetic. Selected items list as chips
          beneath each card. */}
      <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0">
        <OmniAddCard
          icon={UserRound}
          label="Characters"
          count={characterRefs.length}
          max={MAX_CHARACTERS}
          full={characterRefs.length >= MAX_CHARACTERS}
          onClick={() => setCharacterPickerOpen(true)}
        />
        {characterRefs.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {characterRefs.map((r) => (
              <div key={r.bankModelId} className="flex h-9 items-center gap-2 rounded-full border border-playground-500/25 bg-playground-500/10 pl-1.5 pr-1.5 text-[12px] text-playground-200">
                <img src={r.url} alt="" className="h-6 w-6 rounded-full object-cover" />
                <span className="max-w-[120px] truncate">{r.label}</span>
                <button
                  onClick={() => removeRef(r)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-playground-300 transition-colors hover:bg-ink/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voices */}
      <div className="min-w-0">
        <div className="relative">
          <OmniAddCard
            icon={Mic}
            label="Voices"
            count={voiceRefs.length}
            max={MAX_VOICES}
            optional
            full={voiceRefs.length >= MAX_VOICES}
            onClick={() => setVoiceMenuOpen((v) => !v)}
          />
          {voiceMenuOpen && voiceRefs.length < MAX_VOICES && (
            <div className="absolute right-0 top-[6.5rem] z-20 w-60 rounded-2xl border border-ink/10 bg-surface-2 p-1.5 shadow-xl">
                  {voices.length > 0 && (
                    <div className="max-h-44 overflow-y-auto">
                      {voices.map((v) => (
                        <div key={v.kieAudioId} className="group flex items-center gap-1">
                          <button
                            onClick={() => { attachVoice(v); setVoiceMenuOpen(false) }}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/5 hover:text-ink-100"
                          >
                            <Mic className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                            <span className="truncate">{v.name}</span>
                          </button>
                          <button
                            onClick={() => removeVoice(v.kieAudioId)}
                            title="Delete voice"
                            className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink/10 hover:text-ink-300 group-hover:flex"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setDesignerOpen(true); setVoiceMenuOpen(false) }}
                    className="mt-0.5 flex w-full items-center gap-2 rounded-full border-t border-ink/5 px-2.5 py-2 text-left text-[12px] font-medium text-playground-300 transition-colors hover:bg-ink/5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Design new voice…</span>
                  </button>
                </div>
              )}
        </div>
        {voiceRefs.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {voiceRefs.map((r) => (
              <div key={r.omniId} className="flex h-9 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] pl-3 pr-1.5 text-[12px] text-ink-300">
                <Mic className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                <span className="max-w-[120px] truncate">{r.label}</span>
                <button
                  onClick={() => removeRef(r)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Source clip — boxed card when empty, chip + trim controls when set. */}
      <div>
        {clipRef ? (
          <div className="space-y-2">
            <div className="flex h-9 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] pl-3 pr-1.5 text-[12px] text-ink-300">
              <Film className="h-3.5 w-3.5 shrink-0 text-ink-500" />
              <span className="max-w-[180px] truncate">{clipRef.label}</span>
              {clipRef.durationSeconds != null && (
                <span className="text-[10px] text-ink-600">{Math.round(clipRef.durationSeconds)}s</span>
              )}
              <button
                onClick={() => removeRef(clipRef)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-200"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-ink-400">
              <span>Use</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={clipRef.clipStart ?? 0}
                onChange={(e) => {
                  const start = Math.max(0, Number(e.target.value) || 0)
                  const ends = Math.min(clipRef.clipEnds ?? start + MAX_CLIP_WINDOW_S, start + MAX_CLIP_WINDOW_S)
                  patchClip({ clipStart: start, clipEnds: Math.max(ends, start + 0.5) })
                }}
                className="w-16 rounded-lg border border-ink/10 bg-ink/[0.03] px-2 py-1 text-center text-ink-200 outline-none focus:border-ink/20"
              />
              <span>to</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={clipRef.clipEnds ?? MAX_CLIP_WINDOW_S}
                onChange={(e) => {
                  const start = clipRef.clipStart ?? 0
                  let ends = Number(e.target.value) || 0
                  ends = Math.min(ends, start + MAX_CLIP_WINDOW_S)
                  if (clipRef.durationSeconds) ends = Math.min(ends, clipRef.durationSeconds)
                  patchClip({ clipEnds: Math.max(ends, start + 0.5) })
                }}
                className="w-16 rounded-lg border border-ink/10 bg-ink/[0.03] px-2 py-1 text-center text-ink-200 outline-none focus:border-ink/20"
              />
              <span>seconds</span>
            </div>
          </div>
        ) : (
          <OmniAddCard
            icon={Film}
            label="Source clip"
            optional
            helper={`Uses 2 slots · trim ≤ ${MAX_CLIP_WINDOW_S}s`}
            onClick={() => clipInputRef.current?.click()}
          />
        )}
        <input
          ref={clipInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            void handleClipFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </div>

      {/* Quota readout */}
      <p className="text-[11px] text-ink-600">
        Input quota: <span className={quotaUsed > 7 ? 'font-medium text-red-300 light:text-red-700' : 'text-ink-400'}>{quotaUsed}/7</span>
        {' '}— images ×1, clip ×2, influencers ×1
      </p>

      <BankPicker
        bankType="models"
        isOpen={characterPickerOpen}
        onClose={() => setCharacterPickerOpen(false)}
        onSelect={() => { /* unused in multi-select mode */ }}
        multiSelect
        onSelectMany={(items) => addCharacters(items as Model[])}
      />

      <OmniVoiceDesigner
        open={designerOpen}
        onClose={() => setDesignerOpen(false)}
        onCreated={attachVoice}
      />
    </div>
  )
}

// Boxed dashed add-card — matches the Reference Images / Audio / Video slots so
// every Playground input reads the same. Optional chip top-left, count chip
// top-right, centered icon + label, optional helper subtitle.
function OmniAddCard({
  icon: Icon,
  label,
  count,
  max,
  optional = false,
  helper,
  full = false,
  onClick,
}: {
  icon: typeof UserRound
  label: string
  count?: number
  max?: number
  optional?: boolean
  helper?: string
  full?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => { if (!full) onClick() }}
      disabled={full}
      className={`group relative flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 bg-ink/[0.02] transition-colors ${
        full ? 'cursor-not-allowed opacity-50' : 'hover:border-ink/25 hover:bg-ink/[0.04]'
      }`}
    >
      {optional && (
        <span className="absolute left-2 top-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[9px] font-medium capitalize tracking-wide text-ink-500">
          Optional
        </span>
      )}
      {count != null && max != null && (
        <span className="absolute right-2 top-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[9px] font-medium tabular-nums tracking-wide text-ink-500">
          {count}/{max}
        </span>
      )}
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-ink/[0.03] text-ink-400 transition-colors group-hover:text-ink-200">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[12px] font-normal text-ink-500">{label}</span>
      {helper && <span className="px-3 text-center text-[10px] leading-tight text-ink-600">{helper}</span>}
    </button>
  )
}
