// The member's own ad, dropped in, in the Ad Analyzer's own look: its upload
// screen (the eye, "Reverse Engineer Any Ad", the dashed zone and what it
// takes), its staged pill with Compress First, and the ad playing — so an Ad
// Analyzer block's window reads as the Ad Analyzer a member already knows. And
// a slimmer drop strip for a field, under the Swipe File picker in Run View
// and Template Setup. What the drop does is yourAd.ts.

import { useRef, type ReactNode } from 'react'
import { Eye, Film, Minimize2, Upload, X } from 'lucide-react'
import type { AdUpload } from '../types'
import { AD_ACCEPT_ATTR, AD_MAX_SIZE_MB, adNeedsCompressing, COMPRESS_FIRST_HINT } from '../../ad-anatomy/services/adUpload'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import Spinner from '../../../components/Spinner'

// The hidden file input every drop zone here opens: one ad at a time, in the
// formats the Ad Analyzer reads.
function AdFileInput({ inputRef, onFile }: { inputRef: React.RefObject<HTMLInputElement | null>; onFile: (file: File | undefined) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={AD_ACCEPT_ATTR}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        onFile(file)
      }}
    />
  )
}

function Problem({ text }: { text: string }) {
  return (
    <p className="w-full max-w-md rounded-lg border border-[#FF5257]/20 bg-[#FF5257]/[0.06] px-4 py-3 text-xs text-[#FF5257]/90">{text}</p>
  )
}

// The Ad Analyzer's upload screen. The drag itself is the window's (the whole
// surface takes the drop, the way the app's panel does); `active` tints the
// zone while a file is over it.
export function AdDropScreen({ busy, problem, active, onFile, children }: {
  busy: boolean
  problem: string | null
  active: boolean
  onFile: (file: File | undefined) => void
  children?: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Eye className="h-8 w-8 text-[#FF5257]/60" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold tracking-tight text-ink-200">Reverse Engineer Any Ad</h2>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex h-56 w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all duration-200 ${
          active ? 'border-[#FF5257]/40 bg-[#FF5257]/5' : 'border-ink/10 bg-ink/[0.02] hover:border-ink/20 hover:bg-ink/[0.04]'
        }`}
      >
        {busy ? <Spinner className="h-6 w-6 text-[#FF5257]" /> : <Upload className={`h-6 w-6 transition-colors ${active ? 'text-[#FF5257]' : 'text-ink-600'}`} />}
        <span className="text-sm text-ink-400">
          {busy ? 'Reading your ad…' : <>Drag & drop your ad, or <span className="text-ink-200 underline underline-offset-2">browse</span></>}
        </span>
        <span className="text-[11px] text-ink-600">MP4, MOV, WebM · max {AD_MAX_SIZE_MB}MB</span>
      </button>
      <AdFileInput inputRef={inputRef} onFile={onFile} />
      {problem && <Problem text={problem} />}
      {children}
    </div>
  )
}

// A dropped ad as the Ad Analyzer stages one: its name, Compress First when
// it's over the upload budget, how long it runs, and × to take it out.
export function AdPill({ upload, onRemove }: { upload: AdUpload; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.03] py-1.5 pl-3 pr-1.5">
      <Film className="h-3.5 w-3.5 shrink-0 text-[#FF5257]/70" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-xs text-ink-300">{upload.name}</span>
      {upload.size !== undefined && adNeedsCompressing({ type: 'video/mp4', size: upload.size }) && (
        <span title={COMPRESS_FIRST_HINT} className="flex shrink-0 items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-medium text-ink-400">
          <Minimize2 className="h-2.5 w-2.5" strokeWidth={2.25} />
          Compress First
        </span>
      )}
      {upload.seconds !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-ink-600">{Math.round(upload.seconds)}s</span>}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-200"
          aria-label={`Remove ${upload.name}`}
          title="Take this ad out"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="w-1.5" />
      )}
    </div>
  )
}

// The ad, ready to analyze: playing on its first frame, the way the Ad
// Analyzer shows the ad it's reading. `poster` matters beyond looks: Safari
// paints nothing on an unplayed <video> without one (see the Ad Analyzer's
// CLAUDE.md).
export function AdPreview({ upload, onRemove, children }: { upload: AdUpload; onRemove?: () => void; children?: ReactNode }) {
  const src = useAssetUrl(upload.ref)
  const poster = useAssetUrl(upload.thumb ?? null)
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
      <div className="relative aspect-[9/16] h-[min(52vh,520px)] overflow-hidden rounded-2xl bg-black">
        {src ? (
          <video src={src} poster={poster} controls playsInline preload="auto" className="h-full w-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-ink-500"><Film className="h-6 w-6" /></span>
        )}
      </div>
      <div className="w-full max-w-sm"><AdPill upload={upload} onRemove={onRemove} /></div>
      {children}
    </div>
  )
}

// A field's way in: a dashed strip under the Swipe File picker that takes a
// drop or a click. `held` says the field holds a dropped ad already, so the
// strip offers to replace it.
export function AdDropStrip({ busy, problem, active, held, onFile, dragHandlers }: {
  busy: boolean
  problem: string | null
  active: boolean
  held: boolean
  onFile: (file: File | undefined) => void
  dragHandlers: React.HTMLAttributes<HTMLDivElement>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-1.5" {...dragHandlers}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-[12px] transition-colors ${
          active ? 'border-[#FF5257]/50 bg-[#FF5257]/[0.06] text-ink-100' : 'border-ink/15 text-ink-400 hover:border-ink/25 hover:text-ink-200'
        }`}
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        <span className="font-medium">{busy ? 'Reading your ad…' : held ? 'Drop Another Ad to Replace It' : 'Or Upload Your Own Ad'}</span>
        {!busy && <span className="text-[11px] text-ink-600">MP4, MOV, WebM</span>}
      </button>
      <AdFileInput inputRef={inputRef} onFile={onFile} />
      {problem && <p className="px-1 text-[11.5px] leading-snug text-[#FF5257]/90">{problem}</p>}
    </div>
  )
}
