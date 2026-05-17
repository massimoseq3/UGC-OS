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
  Save,
} from 'lucide-react'
import type { AnalysisResult, Scene } from '../types'
import { useAppStore } from '../../../stores/appStore'
import { useBankStore } from '../../../stores/bankStore'

interface ResultsViewProps {
  result: AnalysisResult
  videoSrc: string
  fileName: string
  onReset: () => void
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
function TranscriptSection({ result }: { result: AnalysisResult }) {
  const { copied, copy } = useCopy()
  const [savingTitle, setSavingTitle] = useState<string | null>(null)
  const addToast = useAppStore((s) => s.addToast)
  const addScript = useBankStore((s) => s.addScript)

  const withoutTimestamps = result.transcript.map((l) => l.text).join('\n')

  const handleSaveToBank = () => {
    if (savingTitle !== null) {
      const title = savingTitle.trim()
      if (!title) return
      addScript({
        title,
        scriptText: withoutTimestamps,
        linkedProductId: '',
        source: 'manual',
      })
      setSavingTitle(null)
      addToast('Transcript saved to Script Bank')
    } else {
      setSavingTitle('')
    }
  }

  return (
    <Section>
      <div className="mb-3 flex items-center justify-between">
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
            <Save className="h-3 w-3" />
            Save to Script Bank
          </button>
        </div>
      </div>

      {savingTitle !== null && (
        <div className="mb-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
          <input
            value={savingTitle}
            onChange={(e) => setSavingTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveToBank(); if (e.key === 'Escape') setSavingTitle(null) }}
            autoFocus
            placeholder="Enter script title..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
          />
          <button
            onClick={handleSaveToBank}
            disabled={!savingTitle.trim()}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-30"
          >
            Save
          </button>
          <button
            onClick={() => setSavingTitle(null)}
            className="rounded-full px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

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

function ReverseEngineeredSection({ result }: { result: AnalysisResult }) {
  const { copied, copy } = useCopy()
  const { reverseEngineeredPrompt } = result
  const scenes = reverseEngineeredPrompt.scenes
  const fullPrompt = useMemo(() => joinScenes(scenes), [scenes])
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const addScript = useBankStore((s) => s.addScript)

  const handleSendToScripts = () => {
    sendToApp({
      targetApp: 'script-architect',
      targetField: 'reverseEngineerPrompt',
      data: {
        scenes,
        totalDurationSeconds: reverseEngineeredPrompt.totalDurationSeconds,
        fullPrompt,
      },
    })
    // Auto-save the source prompt to the Scripts bank so the user has a permanent record.
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16)
    addScript({
      title: `Reverse-engineered ad — ${ts}`,
      scriptText: fullPrompt,
      linkedProductId: '',
      source: 'script-architect',
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
export default function ResultsView({ result, videoSrc, fileName, onReset }: ResultsViewProps) {
  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Left column — pinned video */}
      <div className="flex md:h-full w-full md:w-1/3 shrink-0 flex-col gap-4 border-b md:border-b-0 md:border-r border-white/5 p-4 md:p-5 min-h-0">
        <div className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
          <video
            src={videoSrc}
            className="max-h-full max-w-full object-contain"
            controls
          />
        </div>
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

      {/* Right column — scrollable results */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-5">
          <ScorecardSection result={result} />
          <TranscriptSection result={result} />
          <ReverseEngineeredSection result={result} />
        </div>
      </div>
    </div>
  )
}
