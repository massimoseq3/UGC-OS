import { useState } from 'react'
import {
  RotateCcw,
  Copy,
  Check,
  Send,
  BarChart3,
  FileText,
  Anchor,
  Map,
  Brain,
  Eye,
  Lightbulb,
  Bot,
  Film,
  Save,
} from 'lucide-react'
import type { AnalysisResult } from '../types'
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
  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Score list — left */}
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
        {/* Analyst's Note — right */}
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
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const addScript = useBankStore((s) => s.addScript)

  const withoutTimestamps = result.transcript.map((l) => l.text).join('\n')

  const handleSendToScriptArchitect = () => {
    sendToApp({
      targetApp: 'script-architect',
      targetField: 'winningTranscript',
      data: withoutTimestamps,
    })
    addToast('Transcript sent to Scripts')
  }

  const handleSaveToBank = () => {
    if (savingTitle !== null) {
      // Confirm save
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
        <div className="flex items-center gap-1.5 flex-wrap">
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
          <button
            onClick={handleSendToScriptArchitect}
            className="flex items-center gap-1 rounded-full bg-[#FB2B37]/10 px-2.5 py-1 text-[11px] font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
          >
            <Send className="h-3 w-3" />
            Send to Scripts
          </button>
        </div>
      </div>

      {/* Save title input */}
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

/* ─── 3. Hook Breakdown ─── */
function HookSection({ result }: { result: AnalysisResult }) {
  const { hookBreakdown } = result
  return (
    <Section>
      <SectionHeader icon={Anchor} title="Hook Breakdown" />
      <div className="flex flex-col gap-4">
        {/* Large italic hook text with green left border */}
        <div className="border-l-2 border-emerald-400/40 pl-4 py-1">
          <p className="text-lg font-medium italic leading-relaxed text-zinc-200" style={{ fontFamily: 'Georgia, serif' }}>
            &ldquo;{hookBreakdown.hookText}&rdquo;
          </p>
        </div>
        {/* Two columns: Technique + Why It Works */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Technique</span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{hookBreakdown.technique}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Why It Works</span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{hookBreakdown.whyItWorks}</p>
          </div>
        </div>
        {/* Highlighted "How to Adapt" card */}
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-widest text-emerald-400/60">How to Adapt</span>
          <p className="mt-1.5 text-sm font-medium text-zinc-300">{hookBreakdown.adaptableTemplate}</p>
        </div>
      </div>
    </Section>
  )
}

/* ─── 4. Structure Map ─── */
function StructureSection({ result }: { result: AnalysisResult }) {
  const { structureMap } = result
  return (
    <Section>
      <SectionHeader icon={Map} title="Structure Map" />
      <div className="mb-4 flex gap-4">
        <Pill label="Runtime" value={structureMap.runtime} />
        <Pill label="Pacing" value={structureMap.pacing} />
      </div>
      <div className="overflow-hidden rounded-lg border border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.03]">
              <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Time</th>
              <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Beat</th>
              <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Description</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-zinc-600">Dur.</th>
            </tr>
          </thead>
          <tbody>
            {structureMap.beats.map((beat, i) => (
              <tr key={i} className="border-b border-white/[0.03] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-zinc-600">{beat.timestamp}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-zinc-300">{beat.beat}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{beat.description}</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-600">{beat.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

/* ─── 5. Psychology & Persuasion ─── */
function PsychologySection({ result }: { result: AnalysisResult }) {
  const { psychology } = result
  return (
    <Section>
      <SectionHeader icon={Brain} title="Psychology & Persuasion" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Primary Levers</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {psychology.primaryLevers.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FB2B37]/50" />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Targeting Signals</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {psychology.targetingSignals.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/50" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

/* ─── 6. Visual Playbook ─── */
function VisualFrameCard({ frame }: { frame: { timestamp: string; description: string; prompt: string } }) {
  const { copied, copy } = useCopy()
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/5 px-2 py-0.5 tabular-nums text-[10px] text-zinc-600">{frame.timestamp}</span>
          <span className="text-xs font-medium text-zinc-300">{frame.description}</span>
        </div>
        <button
          onClick={() => copy(frame.prompt)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="rounded-lg bg-black/30 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-700">Image Prompt</span>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{frame.prompt}</p>
      </div>
    </div>
  )
}

function VisualSection({ result }: { result: AnalysisResult }) {
  return (
    <Section>
      <SectionHeader icon={Eye} title="Visual Playbook" />
      <div className="flex flex-col gap-3">
        {result.visualPlaybook.map((frame, i) => (
          <VisualFrameCard key={i} frame={frame} />
        ))}
      </div>
    </Section>
  )
}

/* ─── 7. Opportunities for Improvement ─── */
function ImprovementsSection({ result }: { result: AnalysisResult }) {
  return (
    <Section>
      <SectionHeader icon={Lightbulb} title="Opportunities for Improvement" />
      <div className="flex flex-col gap-3">
        {result.improvements.map((imp, i) => (
          <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-md bg-[#FB2B37]/10 px-3 py-2 border border-[#FB2B37]/20">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FB2B37]" />
              <p className="text-sm font-medium text-[#FB2B37] leading-tight">{imp.weakness}</p>
            </div>
            <div className="rounded-md bg-green-500/5 border border-green-500/10 px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-widest text-green-500/60">Fix</span>
              <p className="mt-0.5 text-xs text-zinc-400">{imp.fix}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ─── 8. AI Reconstruction Prompt ─── */
function ReconstructionSection({ result }: { result: AnalysisResult }) {
  const { copied, copy } = useCopy()

  return (
    <Section>
      <div className="mb-3 flex items-center justify-between">
        <SectionHeader icon={Bot} title="AI Reconstruction Prompt" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => copy(result.reconstructionPrompt)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy Prompt'}
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs leading-relaxed text-zinc-500">
        {result.reconstructionPrompt}
      </pre>

    </Section>
  )
}

/* ─── Helpers ─── */

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">{label}</span>
      <p className="mt-0.5 text-sm text-zinc-300">{value}</p>
    </div>
  )
}

/* ─── Main ResultsView ─── */
export default function ResultsView({ result, videoSrc, fileName, onReset }: ResultsViewProps) {
  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Left column — pinned video */}
      <div className="flex lg:h-full w-full lg:w-1/3 shrink-0 flex-col gap-4 border-b lg:border-b-0 lg:border-r border-white/5 p-4 lg:p-5 min-h-0">
        <div className="flex-1 min-h-0 max-h-48 lg:max-h-none w-full overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
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
          <HookSection result={result} />
          <StructureSection result={result} />
          <PsychologySection result={result} />
          <VisualSection result={result} />
          <ImprovementsSection result={result} />
          <ReconstructionSection result={result} />
        </div>
      </div>
    </div>
  )
}
