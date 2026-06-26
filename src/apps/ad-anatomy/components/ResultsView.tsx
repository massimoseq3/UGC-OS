import { useMemo, useState } from 'react'
import {
  Copy,
  Check,
  PenLine,
  ArrowUpRight,
  BarChart3,
  FileText,
  Clapperboard,
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

function SectionHeader({ icon: Icon, title, iconClass = 'text-[#FF5257]/80' }: { icon: React.ElementType; title: string; iconClass?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className={`h-4 w-4 ${iconClass}`} strokeWidth={1.5} />
      <h3 className="text-sm font-semibold tracking-tight text-ink-200">{title}</h3>
    </div>
  )
}

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink/5 bg-ink/[0.02] p-5 ${className}`}>
      {children}
    </div>
  )
}

/* ─── 1. Scorecard ─── */
function scoreColor(score: number) {
  if (score >= 9) return { text: 'text-cyan-400 light:text-cyan-600', border: 'border-cyan-400/20', bg: 'bg-cyan-400/10' }
  if (score >= 7) return { text: 'text-green-500', border: 'border-green-500/20', bg: 'bg-green-500/10' }
  if (score >= 5) return { text: 'text-amber-500', border: 'border-amber-500/20', bg: 'bg-amber-500/10' }
  return { text: 'text-[#FF5257]', border: 'border-[#FF5257]/20', bg: 'bg-[#FF5257]/10' }
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
                {isOverall && <div className="mb-2 mt-1 h-px w-full bg-ink/10" />}
                <div className="flex items-center gap-3 rounded-full px-1.5 py-1 transition-colors hover:bg-ink/[0.04]">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums tracking-tight ${color.bg} ${color.text}`}>
                    {s.score}
                  </span>
                  <span className={`text-sm ${isOverall ? 'font-bold text-ink-200' : 'text-ink-400'}`}>{s.label}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex-1 rounded-lg bg-ink/[0.03] px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-widest text-ink-600">Analyst&apos;s Note</span>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{scorecard.analystNote}</p>
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
        <button
          onClick={() => copy(withoutTimestamps)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {result.transcript.map((line, i) => (
          <div key={i} className="flex gap-3 rounded-full px-3 py-1.5 transition-colors hover:bg-ink/[0.03]">
            <span className="shrink-0 tabular-nums text-[11px] text-ink-700">{line.timestamp}</span>
            <span className="text-sm text-ink-400">{line.text}</span>
          </div>
        ))}
      </div>

      <ScriptActionRow onSave={handleSaveToBank} onSend={handleSendToScripts} />
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
    <div className="rounded-lg border border-ink/5 bg-ink/[0.02] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-fuchsia-300 light:text-fuchsia-700">
            Scene {scene.index}
          </span>
          <span className="truncate text-xs font-medium text-ink-300">{scene.label}</span>
          <span className="shrink-0 rounded bg-ink/5 px-2 py-0.5 tabular-nums text-[10px] text-ink-500">
            {scene.startTime}–{scene.endTime} · {scene.durationSeconds}s
          </span>
        </div>
        <button
          onClick={() => copy(scene.prompt)}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-ink-600 transition-colors hover:bg-ink/5 hover:text-ink-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-surface-0 p-3 font-sans text-xs leading-relaxed text-ink-400">
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
        <SectionHeader icon={Clapperboard} title="Reverse-Engineered Scenes" iconClass="text-fuchsia-400/90 light:text-fuchsia-700" />
        <button
          onClick={() => copy(fullPrompt)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : scenes.length > 1 ? 'Copy All' : 'Copy Prompt'}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-ink-500">
        <span className="rounded-full bg-ink/5 px-2.5 py-0.5">
          Total: {reverseEngineeredPrompt.totalDurationSeconds}s
        </span>
        <span className="rounded-full bg-ink/5 px-2.5 py-0.5">
          {scenes.length === 1 ? '1 scene' : `${scenes.length} scenes (≤15s each)`}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {scenes.map((scene) => (
          <SceneCard key={scene.index} scene={scene} />
        ))}
      </div>

      <ScriptActionRow onSave={handleSaveToBank} onSend={handleSendToScripts} />
    </Section>
  )
}

// Shared bottom action row for the Transcript + Scenes sections — the larger,
// Scripts-styled "Save to Script Bank" (neutral) + "Send to Scripts" (orange
// scripts accent, with a trailing arrow) buttons, matching the Scripts app.
function ScriptActionRow({ onSave, onSend }: { onSave: () => void; onSend: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        onClick={onSave}
        className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-[12px] font-medium tracking-tight text-ink-300 transition-colors hover:bg-ink/[0.06] hover:text-ink-100"
      >
        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
        Save to Script Bank
      </button>
      <button
        onClick={onSend}
        className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-full border border-scripts-500/20 bg-scripts-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-scripts-400 transition-colors hover:bg-scripts-500/20"
      >
        <PenLine className="h-4 w-4" strokeWidth={1.75} />
        Send to Scripts
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

/* ─── Main ResultsView ─── */
export default function ResultsView({ result, videoSrc, restoredThumbUrl, fileName }: ResultsViewProps) {
  // Hide the left media column entirely when neither a video nor a saved
  // still is available (e.g. restored from a history row whose thumbnail
  // capture had failed). Results panels then take the full width.
  const hasMedia = !!videoSrc || !!restoredThumbUrl

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Left column — pinned video or restored still */}
      {hasMedia && (
        <div className="flex md:h-full w-full md:w-1/3 shrink-0 flex-col gap-4 border-b md:border-b-0 md:border-r border-ink/5 p-4 md:p-5 min-h-0">
          {/* Media sizes to its own aspect ratio so there are no letterbox
              black bars. The flex parent centers it within whatever vertical
              space is left after the caption / filename / button. */}
          <div className="flex flex-1 min-h-0 w-full items-center justify-center">
            {videoSrc ? (
              <video
                src={videoSrc}
                className="block max-h-full max-w-full rounded-xl border border-ink/10 transition-all card-soft-shadow"
                controls
              />
            ) : restoredThumbUrl ? (
              <img
                src={restoredThumbUrl}
                alt="First frame of the analyzed ad"
                className="block max-h-full max-w-full rounded-xl border border-ink/10 transition-all card-soft-shadow"
              />
            ) : null}
          </div>
          {/* When the live source is gone, make it explicit that this is the
              saved still — not a broken or missing video. */}
          {!videoSrc && restoredThumbUrl && (
            <p className="-mt-2 shrink-0 text-center text-[11px] italic text-ink-500">
              Still frame — source ad not retained
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-ink/[0.03] px-3 py-2 min-w-0">
            <Film className="h-3.5 w-3.5 shrink-0 text-ink-600" />
            <span className="truncate text-xs text-ink-500">{fileName}</span>
          </div>
        </div>
      )}

      {/* Right column — scrollable results */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* When the left column is hidden, surface the Reset action above the
            results so the user can always get back to a fresh upload. */}
        {!hasMedia && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-ink/5 bg-ink/[0.02] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Film className="h-3.5 w-3.5 shrink-0 text-ink-600" />
              <span className="truncate text-xs text-ink-500">{fileName || 'Untitled analysis'}</span>
            </div>
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
