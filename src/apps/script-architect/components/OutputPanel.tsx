import { useMemo, useState } from 'react'
import { Copy, Check, Bookmark, ArrowUpRight, Mic, Film, PenLine, AlertCircle, Sparkles } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { REMIX_ANGLE_LABEL, type RemixAngle, type ScriptMode, type WriteFormat } from '../types'

interface OutputPanelProps {
  variations: string[]
  // Mode that produced the shown variations — drives the card titles, the
  // "spoken vs scenes" send buttons, and the angle labels.
  mode: ScriptMode
  // Live left-panel mode — drives the empty-state + loading copy only.
  liveMode?: ScriptMode
  writeFormat?: WriteFormat
  writeStyleLabel?: string
  linkedProductId: string | null
  isGenerating?: boolean
  error?: string | null
}

const SCENE_REGEX = /(^|\n)--- Scene \d+.*?---/

interface SceneChunk {
  header: string
  body: string
}

function splitScenes(text: string): SceneChunk[] | null {
  if (!SCENE_REGEX.test(text)) return null
  const lines = text.split('\n')
  const chunks: SceneChunk[] = []
  let current: SceneChunk | null = null
  for (const line of lines) {
    if (/^--- Scene \d+.*---$/.test(line.trim())) {
      if (current) chunks.push(current)
      current = { header: line.trim(), body: '' }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current) chunks.push(current)
  return chunks
    .map((c) => ({ ...c, body: c.body.trim() }))
    .filter((c) => c.body.length > 0)
}

interface VariationCardProps {
  text: string
  cardTitle: string
  defaultSaveTitle: string
  linkedProductId: string | null
  mode: ScriptMode
}

function VariationCard({ text, cardTitle, defaultSaveTitle, linkedProductId, mode }: VariationCardProps) {
  const [copied, setCopied] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveTitle, setSaveTitle] = useState(defaultSaveTitle)
  const [saved, setSaved] = useState(false)
  // Sticky "already in the bank" flag — `saved` is only the 3s visual flash.
  // Send-to-app auto-saves use this to avoid writing duplicate bank rows.
  const [savedOnce, setSavedOnce] = useState(false)

  const addScript = useBankStore((s) => s.addScript)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)

  const scenes = useMemo(() => splitScenes(text), [text])

  // A plain spoken script (remix variation, or a write-mode 'script' output)
  // can be read aloud → Voiceovers. A scene blueprint (reverse-engineer, or a
  // write-mode 'scenes' output) is a prompt asset → Playground.
  const isSpokenScript = mode === 'remix' || (mode === 'write' && !scenes)

  const handleCopyAll = async () => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      addToast('Script copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }

  const saveToBank = (title: string) => {
    addScript({
      title,
      scriptText: text,
      linkedProductId: linkedProductId ?? '',
      source: 'script-architect',
      kind: isSpokenScript ? 'remix' : 'reverse-engineer',
    })
    setSavedOnce(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSave = () => {
    const title = saveTitle.trim()
    if (!title) return
    saveToBank(title)
    setShowSaveForm(false)
    addToast('Script saved to bank')
  }

  const handleSendToVoiceStudio = () => {
    const autoSaved = !savedOnce
    if (autoSaved) saveToBank(defaultSaveTitle)
    sendToApp({ targetApp: 'voice-studio', targetField: 'scriptText', data: text })
    addToast(autoSaved ? 'Script saved to bank · sent to Voiceovers' : 'Script sent to Voiceovers')
  }

  const handleSendToBrollStudio = () => {
    const autoSaved = !savedOnce
    if (autoSaved) saveToBank(defaultSaveTitle)
    sendToApp({ targetApp: 'broll-studio', targetField: 'scriptText', data: text })
    addToast(autoSaved ? 'Script saved to bank · sent to B-Roll' : 'Script sent to B-Roll')
  }

  const handleSendToPlayground = () => {
    sendToApp({ targetApp: 'playground', targetField: 'videoPrompt', data: text })
    addToast('Prompt sent to Playground')
  }

  return (
    <div className="flex shrink-0 flex-col rounded-3xl border border-ink/5 bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink/5 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-scripts-500/10 px-3 py-0.5 font-instrument text-[13px] leading-none text-scripts-300">
            {cardTitle}
          </span>
          {scenes && (
            <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[10px] text-ink-500">
              {scenes.length} scene{scenes.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={handleCopyAll}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : scenes ? 'Copy Full Script' : 'Copy'}
        </button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {scenes ? (
          scenes.map((scene, i) => <SceneChunkCard key={i} chunk={scene} />)
        ) : mode === 'reverse-engineer' ? (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed tracking-tight text-ink-100">
            {text}
          </pre>
        ) : (
          // Each source line is its own paragraph: normal line-height within a
          // (wrapped) sentence, a slight gap between sentences. No `font-sans`
          // — that falls back to system-ui; we want the inherited Geist.
          <div className="flex flex-col gap-2 text-sm leading-normal tracking-tight text-ink-100">
            {text.split('\n').map((line, i) =>
              line.trim() === ''
                ? <div key={i} aria-hidden className="h-1.5" />
                : <p key={i}>{line}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-ink/5 p-3">
        {showSaveForm ? (
          <div className="flex gap-2">
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="Script title..."
              autoFocus
              className="flex-1 rounded-full border border-ink/10 bg-transparent px-4 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30"
            />
            <button
              onClick={handleSave}
              disabled={!saveTitle.trim()}
              className="rounded-full bg-scripts-500/15 px-4 py-2 text-xs font-medium text-scripts-400 transition-colors hover:bg-scripts-500/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="rounded-full px-4 py-2 text-xs text-ink-500 transition-colors hover:text-ink-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSaveForm(true)}
              className={`flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-medium tracking-tight transition-colors ${
                saved
                  ? 'border-green-500/20 bg-green-500/10 text-green-400 light:text-green-600'
                  : 'border-ink/15 text-ink-300 hover:bg-ink/[0.06] hover:text-ink-100'
              }`}
            >
              {saved ? (<><Check className="h-3.5 w-3.5" /> Saved</>) : (<><Bookmark className="h-3.5 w-3.5" /> Save to Bank</>)}
            </button>
            {isSpokenScript && (
              <button
                onClick={handleSendToVoiceStudio}
                className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border border-voice-500/20 bg-voice-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-voice-400 transition-colors hover:bg-voice-500/20"
              >
                <Mic className="h-4 w-4" strokeWidth={1.75} />
                Send to Voiceovers
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={handleSendToBrollStudio}
              className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border border-broll-500/20 bg-broll-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-broll-400 transition-colors hover:bg-broll-500/20"
            >
              <Film className="h-4 w-4" strokeWidth={1.75} />
              Send to B-Roll
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            {!isSpokenScript && (
              <button
                onClick={handleSendToPlayground}
                className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-emerald-400 light:text-emerald-600 transition-colors hover:bg-emerald-500/20"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                Send to Playground
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SceneChunkCard({ chunk }: { chunk: SceneChunk }) {
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const handleCopy = async () => {
    const ok = await copyToClipboard(chunk.body)
    if (ok) {
      setCopied(true)
      addToast('Scene copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }
  return (
    <div className="rounded-2xl border border-ink/5 bg-ink/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-instrument text-[13px] leading-none text-scripts-300/80">
          {chunk.header.replace(/^---\s*|\s*---$/g, '')}
        </span>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-ink-600 transition-colors hover:bg-ink/5 hover:text-ink-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Body matches the Write/Remix script output: inherited Geist + white
          (a div, not <pre>, so it doesn't fall back to UA monospace). */}
      <div className="whitespace-pre-wrap rounded-xl bg-surface-0 p-2.5 text-[13px] leading-relaxed tracking-tight text-ink-100">
        {chunk.body}
      </div>
    </div>
  )
}

export default function OutputPanel({ variations, mode, liveMode, writeStyleLabel, linkedProductId, isGenerating, error }: OutputPanelProps) {
  // Resolve the linked product's name so saved scripts get a meaningful
  // default title ("<Product> — Hook-Led Script") instead of a content slice.
  const products = useBankStore((s) => s.products)
  const productName = linkedProductId
    ? products.find((p) => p.id === linkedProductId)?.productName
    : undefined

  // Empty + loading copy follows the live selector (what you're about to make);
  // the cards themselves follow `mode` (what actually produced them).
  const copyMode = liveMode ?? mode

  if (isGenerating) {
    const message = copyMode === 'write'
      ? ['Reading your brief...', 'Writing 3 takes...', 'Making it sound human...', 'Tightening the hooks...']
      : copyMode === 'remix'
        ? ['Building 3 angles...', 'Sending parallel requests...', 'Writing variations...', 'Polishing final drafts...']
        : ['Reading scene blueprint...', 'Mapping product into structure...', 'Rewriting scenes...', 'Preserving structure...']
    return (
      <div className="flex h-full flex-col gap-2 p-5">
        <GenerationProgress isActive color="bg-scripts-500" messages={message} showHelper={false} />
        <div className="flex flex-1 min-h-0 flex-col gap-3 rounded-3xl border border-ink/5 bg-surface-1 p-5">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-[90%]" />
          <div className="skeleton h-4 w-[95%]" />
          <div className="skeleton h-4 w-[70%]" />
          <div className="mt-2 skeleton h-4 w-full" />
          <div className="skeleton h-4 w-[85%]" />
          <div className="skeleton h-4 w-[92%]" />
        </div>
      </div>
    )
  }

  if (variations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <PenLine className="h-8 w-8 text-ink-800" strokeWidth={1.5} />
        <p className="text-sm text-ink-700">
          {copyMode === 'write'
            ? 'Your 3 takes will appear here'
            : copyMode === 'remix' ? 'Your 3 script variations will appear here' : 'Your scene prompts will appear here'}
        </p>
        {error && (
          <div className="mt-2 flex max-w-sm items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
            <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
          </div>
        )}
      </div>
    )
  }

  const angles: RemixAngle[] = ['hook-led', 'pain-point-led', 'curiosity-led']

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-5">
        {variations.map((text, i) => {
          const isRemix = mode === 'remix'
          const isWrite = mode === 'write'
          const angleLabel = isRemix && variations.length === 3 ? REMIX_ANGLE_LABEL[angles[i]] : null
          const cardTitle = isWrite
            ? `Take ${i + 1}${writeStyleLabel ? ` · ${writeStyleLabel}` : ''}`
            : angleLabel
              ? `Variation ${i + 1}: ${angleLabel}`
              : isRemix
                ? `Variation ${i + 1}`
                : 'Scene prompts'
          const defaultSaveTitle = isWrite && productName
            ? `${productName} — ${writeStyleLabel ?? 'New'} Take ${i + 1}`
            : isRemix && productName
              ? `${productName} — ${angleLabel ?? `Variation ${i + 1}`} Script`
              : deriveTitleFromContent(
                  text,
                  mode === 'reverse-engineer' ? 'Reverse-engineered prompts' : 'Untitled script',
                )
          return (
            <VariationCard
              key={i}
              text={text}
              cardTitle={cardTitle}
              defaultSaveTitle={defaultSaveTitle}
              linkedProductId={linkedProductId}
              mode={mode}
            />
          )
        })}
      </div>
    </div>
  )
}

// Derive a human-readable title from reverse-engineered prompt content.
// Strategy: skip scene dividers and label lines, find the first prose
// sentence, take ~6 words, Title Case. Falls back to a sensible default.
function deriveTitleFromContent(text: string, fallback = 'Untitled script'): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Skip scene dividers ("--- Scene 1: HOOK ---") and short ALL-CAPS labels
    // ("HOOK", "VISUAL:", "VOICEOVER:").
    if (/^---/.test(line)) continue
    if (/^[A-Z][A-Z\s:]{0,30}:?$/.test(line)) continue
    // Skip lines that are only a bracketed section label, e.g. "[HOOK]".
    if (/^\[[^\]]+\]\s*$/.test(line)) continue
    // Strip leading markers like "[HOOK]", "Visual:", "Voiceover:", "1.", "- ".
    const cleaned = line
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/^[*\-•]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^(visual|voiceover|action|dialogue|shot|scene|hook|cta)\s*[:-]\s*/i, '')
      .trim()
    if (cleaned.length < 6) continue
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned
    const words = firstSentence.split(/\s+/).slice(0, 7).join(' ')
    const trimmed = words.replace(/[.,;:!?-]+$/, '').trim()
    if (trimmed.length < 4) continue
    // Title case the first letter only; preserve original casing otherwise.
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }
  return fallback
}

// Robust clipboard write with a textarea fallback for older browsers / non-
// secure contexts. Returns true if the copy succeeded.
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
