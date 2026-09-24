// Flow Home: templates first, then describing a flow in words, then the
// member's own flows. A blank canvas is the last thing offered, never the
// first — a member who has never seen a node editor should be able to run a
// template without opening one.

import { useEffect, useRef, useState } from 'react'
import { FileUp, Pin, Plus, Sparkles, Workflow } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useFlowStore } from '../store/flowStore'
import { useFlowRunStore } from '../run/runtime'
import { TileDeleteButton } from '../../../components/tileActions'
import DayPill from '../../../components/DayPill'
import Spinner from '../../../components/Spinner'
import DropOverlay from '../../../components/DropOverlay'
import { formatRelative } from '../../../utils/history'
import { humanizeError } from '../../../utils/friendlyError'
import { loadGallery, type GalleryEntry } from '../templates/gallery'
import { readTemplateFile } from '../templates/io'
import TemplateSetup, { type SetupSource } from './TemplateSetup'
import DescribeIt from './DescribeIt'
import { creditsLabel } from '../hooks/useFlowPlan'
import { GlassTile } from '../../../components/AppGlassTile'

export default function FlowHome() {
  const flows = useBankStore((s) => s.flows)
  const openFlow = useFlowStore((s) => s.openFlow)
  const createFlow = useFlowStore((s) => s.createFlow)
  const removeFlow = useFlowStore((s) => s.removeFlow)
  const setPinned = useFlowStore((s) => s.setPinned)
  const runs = useFlowRunStore((s) => s.runs)
  const addToast = useAppStore((s) => s.addToast)
  const [gallery, setGallery] = useState<GalleryEntry[] | null>(null)
  const [setup, setSetup] = useState<SetupSource | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    loadGallery().then((entries) => { if (live) setGallery(entries) }, () => { if (live) setGallery([]) })
    return () => { live = false }
  }, [])

  const sorted = [...flows].sort((a, b) => b.updatedAt - a.updatedAt)

  const importFile = async (file: File) => {
    try {
      const template = await readTemplateFile(file)
      setSetup({ kind: 'file', template })
    } catch (err) {
      addToast(humanizeError(err, "That file isn't a flow UGC OS can open."), 'error')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void importFile(file)
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex h-[57px] shrink-0 items-center gap-3 border-b border-ink/5 px-5">
        <Workflow className="h-4 w-4 text-flow-400" strokeWidth={2} />
        <span className="text-sm font-semibold tracking-tight text-ink-100">Flow</span>
        <span className="rounded-full bg-flow-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-flow-300">Experimental</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3.5 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
          >
            <FileUp className="h-3.5 w-3.5" />
            Import Flow
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".ugcflow,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8">
          <section>
            <SectionTitle title="Templates From the Channel" hint="Each one runs as a short form: pick your product and character, press Run." />
            {gallery === null ? (
              <div className="flex h-40 items-center justify-center text-ink-500"><Spinner className="h-5 w-5" /></div>
            ) : gallery.length === 0 ? (
              <p className="text-sm text-ink-500">No templates yet. They arrive with the videos they're made in.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.map((entry) => (
                  <TemplateCard key={entry.slug} entry={entry} onUse={() => setSetup({ kind: 'gallery', entry })} />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle title="Describe It" hint="Say what you want made. Flow lays out the blocks, you check the plan, nothing runs until you do." />
            <DescribeIt />
          </section>

          <section>
            <SectionTitle title="Your Flows" />
            {sorted.length === 0 ? (
              <p className="text-sm text-ink-500">Flows you build or import land here.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {sorted.map((f) => {
                  const running = runs[f.id]?.status === 'running'
                  const blocks = Array.isArray(f.blocks) ? f.blocks.length : 0
                  return (
                    <div
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openFlow(f.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openFlow(f.id) }}
                      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-ink/5 bg-ink/[0.02] px-4 py-3 transition-colors hover:border-ink/10 hover:bg-ink/[0.04]"
                    >
                      <GlassTile icon={Workflow} accent="#0891B2" size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-ink-100">{f.name}</span>
                          {f.pinned && <Pin className="h-3 w-3 shrink-0 text-flow-400" />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
                          {running ? (
                            <span className="flex items-center gap-1.5 text-flow-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flow-400" />Running</span>
                          ) : (
                            <span>{blocks} {blocks === 1 ? 'block' : 'blocks'} · edited {formatRelative(f.updatedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title={f.pinned ? 'Unpin From the Dock' : 'Pin to the Dock'}
                          onClick={() => setPinned(f.id, !f.pinned)}
                          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${f.pinned ? 'text-flow-300 hover:bg-flow-500/10' : 'text-ink-500 opacity-0 hover:bg-ink/5 hover:text-ink-200 group-hover:opacity-100 touch:opacity-100'}`}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        <TileDeleteButton variant="chrome" size="sm" title="Delete Flow" onDelete={() => removeFlow(f.id)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <SectionTitle title="Make a Flow From Your Work" hint="Open any finished result in its app and press Save as Flow: Flow traces what made it and lays it out as blocks." />
          </section>

          <div className="flex justify-center pb-6">
            <button
              type="button"
              onClick={() => openFlow(createFlow())}
              className="flex items-center gap-2 rounded-full border border-dashed border-ink/15 px-5 py-2.5 text-sm font-medium text-ink-300 transition-colors hover:border-flow-500/50 hover:text-flow-300"
            >
              <Plus className="h-4 w-4" />
              Start From Scratch
            </button>
          </div>
        </div>
      </div>

      {dragging && <DropOverlay icon={FileUp} label="Import This Flow" accent="flow" className="z-30" />}
      {setup && <TemplateSetup source={setup} onClose={() => setSetup(null)} />}
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <DayPill label={title} className="mb-2 mt-0" />
      {hint && <p className="text-center text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

function TemplateCard({ entry, onUse }: { entry: GalleryEntry; onUse: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-ink/5 bg-ink/[0.02]">
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-flow-500/25 via-surface-1 to-surface-0">
        {entry.cover ? (
          <img src={entry.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center"><Sparkles className="h-8 w-8 text-flow-300/60" /></div>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
          {entry.blocks} {entry.blocks === 1 ? 'block' : 'blocks'}{entry.estimate ? ` · ${creditsLabel(entry.estimate)}` : ''}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[13px] font-semibold text-ink-100">{entry.name}</span>
        <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-ink-400">{entry.description}</p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onUse}
            className="glass-fill glass-fill-soft flex-1 rounded-full border border-white/15 bg-flow-500 px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] btn-soft-shadow transition-all hover:brightness-110"
          >
            Use Template
          </button>
          {entry.videoUrl && (
            <a
              href={entry.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-ink/10 px-3 py-2 text-xs text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
            >
              Watch the Video
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
