import { useMemo, useState } from 'react'
import {
  RotateCcw,
  Copy,
  Check,
  Send,
  BarChart3,
  FileText,
  Bot,
  Film,
  Bookmark,
} from 'lucide-react'
import type { AnalysisResult, Scene } from '../types'
import { useAppStore } from '../../../stores/appStore'
import { useBankStore } from '../../../stores/bankStore'

interface ResultsViewProps {
  result: AnalysisResult
  // Set when the analysis came from a fresh upload; the asset:// blob URL.
  videoSrc: string | null
  // Set when the user restored from History; we don't keep the source video,
  // only the saved first-frame still.
  restoredThumbUrl?: string | null
  fileName: string
  onReset: () => void
}

// Pull a 3-6 word descriptor out of the file name if the LLM didn't return
// adTitle. Kept here for the save flows since legacy results don't have it.
function deriveFallbackTitle(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const cleaned = stem.replace(/[_-]+/g, ' ').trim()
  return cleaned || 'Untitled ad'
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // Fallback for non-secure contexts or browsers blocking the async API.
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return { copied, copy }
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-[#FB2B37]/80" strokeWidth={1.5} />
      <h3 className="text-sm font-semibold tracking-tight text-zinc-200">{title}</h3>
    </div>
  )
}

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-5 ${className}`}>
      {children}
    </div>
  )
}

/* ─── 1. Scorecard ─── */
function scoreColor(score: number) {
  if (score >= 9) return { text: 'text-cyan-400', border: 'border-cyan-400/20', bg: 'bg-cyan-400/10' }
  if (score >= 7) return { text: 'text-green-500', border: 'border-green-500/20', bg: 'bg-green-500/10' }
  if (score >= 5) return { text: 'text-amber-500', border: 'border-amber-500/20', bg: 'bg-amber-500/10' }
  return { text: 'text-[#FB2B37]', border: 'border-[#FB2B37]/20', bg: 'bg-[#FB2B37]/10' }
}

function ScorecardSection({ result }: { result: AnalysisResult }) {
  const { scorecard } = result
  return (
    <Section>
      <SectionHeader icon={BarChart3} title="Scorecard" />
      <div className="flex flex-col md:flex-row gap-5">
        <div className="flex flex-1 flex-col gap-2">
          {scorecard.scores.map((s) => {
            const color = scoreColor(s.score)
            const isOverall = s.label === 'Overall Execution'
            return (
              <div key={s.label}>
                {isOverall && <div className="mb-2 mt-1 h-px w-full bg-white/10" />}
                <div className="flex items-center gap-3">
                  <span className={`w-10 shrink-0 rounded-md py-1 text-center text-sm font-semibold tabular-nums tracking-tight ${color.bg} ${color.text}`}>
                    {s.score}
                  </span>
                  <span className={`text-sm ${isOverall ? 'font-bold text-zinc-200' : 'text-zinc-400'}`}>{s.label}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex-1 rounded-lg bg-white/[0.03] px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Analyst&apos;s Note</span>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{scorecard.analystNote}</p>
        </div>
      </div>
    </Section>
  )
}

/* ─── 2. Transcript ─── */
function TranscriptSection({ result, fileName }: { result: AnalysisResult; fileName: string }) {
  const { copied, copy } = useCopy()
  const addToast = useAppStore((s) => s.addToast)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addScript = useBankStore((s) => s.addScript)

  const withoutTimestamps = result.transcript.map((l) => l.text).join('\n')
  const adTitle = result.adTitle?.trim() || deriveFallbackTitle(fileName)
  const scriptTitle = `${adTitle} — Transcript`

  const handleSaveToBank = () => {
    addScript({
      title: scriptTitle,
      scriptText: withoutTimestamps,
      linkedProductId: '',
      source: 'manual',
    })
    addToast(`Saved "${scriptTitle}" to Script Bank`)
  }

  const handleSendToScripts = () => {
    addScript({
      title: scriptTitle,
      scriptText: withoutTimestamps,
      linkedProductId: '',
      source: 'manual',
    })
    sendToApp({
      targetApp: 'script-architect',
      targetField: 'winningTranscript',
      data: withoutTimestamps,
    })
    addToast('Sent to Scripts + saved to bank')
  }

  return (
    <Section>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <SectionHeader icon={FileText} title="Transcript" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => copy(withoutTimestamps)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleSaveToBank}
            className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <Bookmark className="h-3 w-3" />
            Save to Script Bank
          </button>
          <button
            onClick={handleSendToScripts}
            className="flex items-center gap-1 rounded-full bg-[#FB2B37]/10 px-2.5 py-1 text-[11px] font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
          >
            <Send className="h-3 w-3" />
            Send to Scripts
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {result.transcript.map((line, i) => (
          <div key={i} className="flex gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-white/[0.03]">
            <span className="shrink-0 tabular-nums text-[11px] text-zinc-700">{line.timestamp}</span>
            <span className="text-sm text-zinc-400">{line.text}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ─── 3. Reverse-Engineered Prompt ─── */

function joinScenes(scenes: Scene[]): string {
  if (scenes.length === 1) return scenes[0].prompt
  return scenes
    .map((s) => `--- Scene ${s.index}: ${s.label} (${s.startTime}-${s.endTime}) ---\n${s.prompt}`)
    .join('\n\n')
}

function SceneCard({ scene }: { scene: Scene }) {
  const { copied, copy } = useCopy()
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-[#FB2B37]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FB2B37]">
            Scene {scene.index}
          </span>
          <span className="truncate text-xs font-medium text-zinc-300">{scene.label}</span>
          <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 tabular-nums text-[10px] text-zinc-500">
            {scene.startTime}–{scene.endTime} · {scene.durationSeconds}s
          </span>
        </div>
        <button
          onClick={() => copy(scene.prompt)}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-sans text-xs leading-relaxed text-zinc-400">
        {scene.prompt}
      </pre>
    </div>
  )
}

function ReverseEngineeredSection({ result, fileName }: { result: AnalysisResult; fileName: string }) {
  const { copied, copy } = useCopy()
  const { reverseEngineeredPrompt } = result
  const scenes = reverseEngineeredPrompt.scenes
  const fullPrompt = useMemo(() => joinScenes(scenes), [scenes])
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const addScript = useBankStore((s) => s.addScript)

  const adTitle = result.adTitle?.trim() || deriveFallbackTitle(fileName)
  const scriptTitle = `${adTitle} — Prompt`

  const handleSaveToBank = () => {
    addScript({
      title: scriptTitle,
      scriptText: fullPrompt,
      linkedProductId: '',
      source: 'script-architect',
      kind: 'reverse-engineer',
    })
    addToast(`Saved "${scriptTitle}" to Script Bank`)
  }

  const handleSendToScripts = () => {
    addScript({
      title: scriptTitle,
      scriptText: fullPrompt,
      linkedProductId: '',
      source: 'script-architect',
      kind: 'reverse-engineer',
    })
    sendToApp({
      targetApp: 'script-architect',
      targetField: 'reverseEngineerPrompt',
      data: {
        scenes,
        totalDurationSeconds: reverseEngineeredPrompt.totalDurationSeconds,
        fullPrompt,
      },
    })
    addToast('Sent to Scripts + saved to bank')
  }

  return (
    <Section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeader icon={Bot} title="Reverse-Engineered Prompt" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => copy(fullPrompt)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : scenes.length > 1 ? 'Copy All' : 'Copy Prompt'}
          </button>
          <button
            onClick={handleSaveToBank}
            className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <Bookmark className="h-3 w-3" />
            Save to Script Bank
          </button>
          <button
            onClick={handleSendToScripts}
            className="flex items-center gap-1 rounded-full bg-[#FB2B37]/10 px-2.5 py-1 text-[11px] font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
          >
            <Send className="h-3 w-3" />
            Send to Scripts
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
        <span className="rounded-full bg-white/5 px-2.5 py-0.5">
          Total: {reverseEngineeredPrompt.totalDurationSeconds}s
        </span>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5">
          {scenes.length === 1 ? '1 scene' : `${scenes.length} scenes (≤15s each)`}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {scenes.map((scene) => (
          <SceneCard key={scene.index} scene={scene} />
        ))}
      </div>
    </Section>
  )
}

/* ─── Main ResultsView ─── */
export default function ResultsView({ result, videoSrc, restoredThumbUrl, fileName, onReset }: ResultsViewProps) {
  // Hide the left media column entirely when neither a video nor a saved
  // still is available (e.g. restored from a history row whose thumbnail
  // capture had failed). Results panels then take the full width.
  const hasMedia = !!videoSrc || !!restoredThumbUrl

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Left column — pinned video or restored still */}
      {hasMedia && (
        <div className="flex md:h-full w-full md:w-1/3 shrink-0 flex-col gap-4 border-b md:border-b-0 md:border-r border-white/5 p-4 md:p-5 min-h-0">
          {/* Media sizes to its own aspect ratio so there are no letterbox
              black bars. The flex parent centers it within whatever vertical
              space is left after the caption / filename / button. */}
          <div className="flex flex-1 min-h-0 w-full items-center justify-center">
            {videoSrc ? (
              <video
                src={videoSrc}
                className="block max-h-full max-w-full rounded-xl border border-white/10"
                controls
              />
            ) : restoredThumbUrl ? (
              <img
                src={restoredThumbUrl}
                alt="First frame of the analyzed ad"
                className="block max-h-full max-w-full rounded-xl border border-white/10"
              />
            ) : null}
          </div>
          {/* When the live source is gone, make it explicit that this is the
              saved still — not a broken or missing video. */}
          {!videoSrc && restoredThumbUrl && (
            <p className="-mt-2 shrink-0 text-center text-[11px] italic text-zinc-500">
              Still frame — source ad not retained
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 min-w-0">
            <Film className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <span className="truncate text-xs text-zinc-500">{fileName}</span>
          </div>
          <button
            onClick={onReset}
            className="flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#FB2B37]/20 bg-[#FB2B37]/10 px-4 py-2.5 text-sm font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Analyze Another
          </button>
        </div>
      )}

      {/* Right column — scrollable results */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* When the left column is hidden, surface the Reset action above the
            results so the user can always get back to a fresh upload. */}
        {!hasMedia && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Film className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <span className="truncate text-xs text-zinc-500">{fileName || 'Untitled analysis'}</span>
            </div>
            <button
              onClick={onReset}
              className="flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#FB2B37]/20 bg-[#FB2B37]/10 px-3.5 py-1.5 text-xs font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
            >
              <RotateCcw className="h-3 w-3" />
              Analyze Another
            </button>
          </div>
        )}
        <div className="flex flex-col gap-5">
          <ScorecardSection result={result} />
          <TranscriptSection result={result} fileName={fileName} />
          <ReverseEngineeredSection result={result} fileName={fileName} />
        </div>
      </div>
    </div>
  )
}
