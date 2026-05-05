import { useState } from 'react'
import { Copy, Check, Save, ChevronDown, ChevronUp, UserRound, Loader2, Braces, Download, AlertCircle, X } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import type { GenerationResult } from '../services/generateCharacter'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import GenerationProgress from '../../../components/GenerationProgress'
import ModelPicker from '../../../components/ModelPicker'
import CostPreview from '../../../components/CostPreview'
import { getDefaultModel } from '../../../utils/models'

interface OutputPanelProps {
  result: GenerationResult | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onCancel: () => void
  canGenerate: boolean
  aspectRatio: string
}

export default function OutputPanel({ result, isGenerating, error, onGenerate, onCancel, canGenerate, aspectRatio }: OutputPanelProps) {
  const [copied, setCopied] = useState(false)
  const [jsonExpanded, setJsonExpanded] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  const addModel = useBankStore((s) => s.addModel)

  const persistedModel = useSettingsStore((s) =>
    s.getAppModel('character-studio:image:text-to-image'),
  )
  const selectedModelId =
    persistedModel ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  const resolvedImageUrl = useAssetUrl(result?.imageUrl)

  const isPortrait = aspectRatio.includes('9:16')

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result.jsonPrompt, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    if (!saveName.trim() || !result) return
    addModel({
      characterImage: result.imageUrl,
      name: saveName.trim(),
      notes: '',
      jsonProfile: result.jsonPrompt as unknown as Record<string, unknown>,
      source: 'character-studio',
    })
    setShowSaveForm(false)
    setSaveName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Loading state with progress bar
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <div className={`skeleton w-full max-w-sm rounded-xl ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`} />
        <div className="w-full max-w-sm">
          <GenerationProgress
            isActive
            color="bg-sky-500"
            messages={['Building character prompt...', 'Sending to Gemini API...', 'Generating image...', 'Rendering final image...']}
          />
          <button
            onClick={onCancel}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Empty state — no result yet
  if (!result) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <UserRound className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-700">Configure parameters and generate</p>
          <p className="text-xs text-zinc-800">Your character visualization will appear here</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}

        {/* Generate button always visible */}
        <div className="space-y-3 border-t border-white/5 p-4">
          <ModelPicker appId="character-studio" task="image" mode="text-to-image" />
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-sky-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserRound className="h-4 w-4" />
            <span>Generate UGC Character</span>
          </button>
          <div className="flex justify-center">
            <CostPreview modelId={selectedModelId} params={{ imageCount: 1 }} />
          </div>
        </div>
      </div>
    )
  }

  // Result state — image fits within panel, no scrolling
  return (
    <div className="flex h-full flex-col">
      {/* Image + actions area — fills available space */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {/* Image container — takes available height, image fits inside */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className={`group relative overflow-hidden rounded-xl border border-white/10 bg-black ${isPortrait ? 'h-full max-h-full' : 'w-full'}`}>
            <img
              src={resolvedImageUrl}
              alt="Generated character"
              className={`${isPortrait ? 'h-full' : 'w-full'} object-contain`}
            />
            {/* Download overlay on hover */}
            <button
              onClick={() => {
                if (!resolvedImageUrl) return
                const a = document.createElement('a')
                a.href = resolvedImageUrl
                a.download = `character-${Date.now()}.png`
                a.click()
              }}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/80 hover:text-white"
              title="Download image"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Actions below image — compact, no scroll */}
        <div className="mt-3 flex flex-col gap-2">
          {/* Collapsible JSON Prompt */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02]">
            <button
              onClick={() => setJsonExpanded(!jsonExpanded)}
              className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2">
                <Braces className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[11px] font-medium text-zinc-300">JSON Prompt</span>
              </div>
              <div className="flex items-center gap-2">
                {jsonExpanded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy() }}
                    className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
                  >
                    {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                )}
                {jsonExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
                )}
              </div>
            </button>
            {jsonExpanded && (
              <div className="border-t border-white/5 px-3 py-2">
                <pre className="max-h-48 overflow-y-auto rounded-lg bg-black/30 p-2 text-[10px] leading-relaxed text-zinc-400">
                  {JSON.stringify(result.jsonPrompt, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Save to Model Bank */}
          {showSaveForm ? (
            <div className="flex gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder='e.g. "Sarah - Bedroom Setup"'
                autoFocus
                className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-sky-500/30"
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="rounded-full bg-sky-500/15 px-5 py-3 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setSaveName('') }}
                className="rounded-full px-5 py-3 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              className={`flex w-full items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[13px] font-medium tracking-tight transition-colors ${saved
                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                : 'border-white/15 text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
                }`}
            >
              {saved ? (
                <><Check className="h-4 w-4" /> Saved to Model Bank</>
              ) : (
                <><Save className="h-4 w-4" /> Save to Model Bank</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Generate button — pinned to bottom */}
      <div className="space-y-2 border-t border-white/5 p-3">
        <ModelPicker appId="character-studio" task="image" mode="text-to-image" />
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-sky-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <UserRound className="h-4 w-4" />
              <span>Generate UGC Character</span>
            </>
          )}
        </button>
        <div className="flex justify-center">
          <CostPreview modelId={selectedModelId} params={{ imageCount: 1 }} />
        </div>
      </div>
    </div>
  )
}
