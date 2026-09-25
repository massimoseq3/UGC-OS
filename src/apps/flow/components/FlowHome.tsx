// Flow Home: "Start a Flow". Describe what you want in the bar under the
// title, pick a template from the channel, or turn something already made
// into a flow — and only then your own flows and a blank canvas, last. A
// member who has never seen a node editor should be able to run a template
// without opening one.

import { useEffect, useRef, useState } from 'react'
import { Check, FileUp, Link2, Pin, Plus, Youtube } from 'lucide-react'
import type { FlowGraph } from '../types'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useFlowStore } from '../store/flowStore'
import { useFlowRunStore } from '../run/runtime'
import { TileDeleteButton } from '../../../components/tileActions'
import Spinner from '../../../components/Spinner'
import DropOverlay from '../../../components/DropOverlay'
import { formatRelative } from '../../../utils/history'
import { humanizeError } from '../../../utils/friendlyError'
import { loadGallery, loadGalleryTemplate, type GalleryEntry } from '../templates/gallery'
import { readTemplateFile } from '../templates/io'
import TemplateSetup from './TemplateSetup'
import DescribeIt from './DescribeIt'
import FromYourWork from './FromYourWork'
import FlowDiagram from './FlowDiagram'
import { publicTemplateUrl } from '../share'
import { creditsLabel } from '../hooks/useFlowPlan'
import { DISPLAY_FONT } from '../../dashboard/widgetStyles'

export default function FlowHome() {
  const flows = useBankStore((s) => s.flows)
  const openFlow = useFlowStore((s) => s.openFlow)
  const createFlow = useFlowStore((s) => s.createFlow)
  const addToast = useAppStore((s) => s.addToast)
  const [gallery, setGallery] = useState<GalleryEntry[] | null>(null)
  const [covers, setCovers] = useState<Record<string, FlowGraph>>({})
  const setup = useFlowStore((s) => s.setup)
  const openSetup = useFlowStore((s) => s.openSetup)
  const closeSetup = useFlowStore((s) => s.closeSetup)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The gallery, then each template's own file for its cover diagram — a
  // handful of small static files, shipped with the build.
  useEffect(() => {
    let live = true
    loadGallery().then(
      (entries) => {
        if (!live) return
        setGallery(entries)
        for (const e of entries) {
          loadGalleryTemplate(e.slug).then(
            (t) => { if (live) setCovers((c) => ({ ...c, [e.slug]: { blocks: t.file.blocks, wires: t.file.wires } })) },
            () => undefined,
          )
        }
      },
      () => { if (live) setGallery([]) },
    )
    return () => { live = false }
  }, [])

  const sorted = [...flows].sort((a, b) => b.updatedAt - a.updatedAt)

  const importFile = async (file: File) => {
    const template = await readTemplateFile(file).catch((err: unknown) => {
      addToast(humanizeError(err, "That file isn't a flow UGC OS can open."), 'error')
      return null
    })
    if (template) openSetup({ kind: 'file', template })
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col px-5 pb-16 pt-9">
          <header className="mb-6 text-center">
            <h1 className="text-[40px] font-normal italic leading-[1.05] tracking-tighter text-ink-50 md:text-[56px]" style={DISPLAY_FONT}>
              Start a Flow
            </h1>
            <p className="mt-2.5 text-[13.5px] text-ink-400">
              Pick a template from the channel, describe what you want, or turn something you already made into a flow.
            </p>
          </header>

          <div className="mx-auto mb-8 w-full max-w-[860px]">
            <DescribeIt />
          </div>

          <SectionLabel title="Templates From the Channel" hint="Each one has a video that builds it" />
          {gallery === null ? (
            <div className="flex h-40 items-center justify-center text-ink-500"><Spinner className="h-5 w-5" /></div>
          ) : gallery.length === 0 ? (
            <p className="mb-8 text-sm text-ink-500">No templates yet. They arrive with the videos they're made in.</p>
          ) : (
            <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((entry) => (
                <TemplateCard key={entry.slug} entry={entry} cover={covers[entry.slug]} onUse={() => openSetup({ kind: 'gallery', entry })} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section className="min-w-0">
              <SectionLabel
                title="Your Flows"
                right={
                  <>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      title="Import a .ugcflow file, or drop one anywhere on this page"
                      className="flex h-7 items-center gap-1.5 rounded-full border border-ink/10 px-3 text-[12px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      Import
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
                  </>
                }
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {sorted.map((f) => (
                  <FlowCard key={f.id} flowId={f.id} name={f.name} graph={{ blocks: Array.isArray(f.blocks) ? f.blocks : [], wires: Array.isArray(f.wires) ? f.wires : [] } as FlowGraph} pinned={!!f.pinned} updatedAt={f.updatedAt} />
                ))}
                <button
                  type="button"
                  onClick={() => openFlow(createFlow())}
                  className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-ink/15 bg-ink/[0.015] px-4 text-center transition-colors hover:border-flow-500/45 hover:bg-flow-500/[0.04]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink-300">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-semibold text-ink-100">Start From Scratch</span>
                  <span className="text-[11.5px] text-ink-500">An empty canvas</span>
                </button>
              </div>
            </section>

            <section className="min-w-0">
              <SectionLabel title="Make a Flow From Your Work" hint="Made one by hand? Save it as a flow." />
              <FromYourWork />
            </section>
          </div>
        </div>
      </div>

      {dragging && <DropOverlay icon={FileUp} label="Import This Flow" accent="flow" className="z-30" />}
      {setup && <TemplateSetup source={setup} onClose={closeSetup} />}
    </div>
  )
}

function SectionLabel({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-ink/[0.06] px-2.5 text-[11px] font-semibold text-ink-200">{title}</span>
      {hint && <span className="truncate text-[12.5px] text-ink-500">{hint}</span>}
      {right && <span className="ml-auto flex shrink-0 items-center gap-2">{right}</span>}
    </div>
  )
}

// The graph-paper stage a cover diagram sits on — the canvas it came from.
function Cover({ graph, height }: { graph?: FlowGraph; height: string }) {
  return (
    <div className={`relative overflow-hidden border-b border-ink/5 bg-surface-0 ${height}`}>
      <div aria-hidden className="stage-grid pointer-events-none absolute inset-0" />
      {graph ? (
        <FlowDiagram graph={graph} className="absolute inset-0 h-full w-full p-2" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-600"><Spinner className="h-4 w-4" /></div>
      )}
    </div>
  )
}

function TemplateCard({ entry, cover, onUse }: { entry: GalleryEntry; cover?: FlowGraph; onUse: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border border-ink/[0.07] bg-ink/[0.025] transition-colors hover:border-ink/[0.16]">
      {entry.cover ? (
        <div className="relative h-[150px] overflow-hidden border-b border-ink/5">
          <img src={entry.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <Cover graph={cover} height="h-[150px]" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <span className="text-[14px] font-semibold tracking-tight text-ink-100">{entry.name}</span>
        <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-400">{entry.description}</p>
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          {entry.videoUrl && (
            <a href={entry.videoUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-red-300 transition-colors hover:text-red-200 light:text-red-600" title="The video this template is built in">
              <Youtube className="h-3.5 w-3.5" />
              Watch
            </a>
          )}
          <span className="truncate text-[11.5px] text-ink-500">
            {entry.blocks} {entry.blocks === 1 ? 'block' : 'blocks'}{entry.estimate ? ` · ${creditsLabel(entry.estimate)}` : ''}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onUse}
            className="glass-fill glass-fill-soft flex h-[34px] flex-1 items-center justify-center rounded-full border border-white/15 bg-flow-500 px-4 text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] btn-soft-shadow transition-all hover:brightness-110"
          >
            Use Template
          </button>
          <CopyLinkButton slug={entry.slug} />
        </div>
      </div>
    </div>
  )
}

function FlowCard({ flowId, name, graph, pinned, updatedAt }: { flowId: string; name: string; graph: FlowGraph; pinned: boolean; updatedAt: number }) {
  const openFlow = useFlowStore((s) => s.openFlow)
  const removeFlow = useFlowStore((s) => s.removeFlow)
  const setPinned = useFlowStore((s) => s.setPinned)
  const running = useFlowRunStore((s) => s.runs[flowId]?.status === 'running')
  const ranTimes = useFlowRunStore((s) => s.log[flowId]?.length ?? 0)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openFlow(flowId)}
      onKeyDown={(e) => { if (e.key === 'Enter') openFlow(flowId) }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-ink/[0.07] bg-ink/[0.025] transition-colors hover:border-ink/[0.16]"
    >
      <Cover graph={graph} height="h-[110px]" />
      <div className="flex flex-col gap-0.5 px-3.5 pb-3 pt-2.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold tracking-tight text-ink-100">{name}</span>
          {pinned && <Pin className="h-3 w-3 shrink-0 text-flow-400" />}
        </span>
        <span className="truncate text-[11.5px] text-ink-500">
          {running ? (
            <span className="text-flow-300">Running now</span>
          ) : pinned ? (
            'Pinned to your dock'
          ) : (
            `Edited ${formatRelative(updatedAt)}${ranTimes ? ` · ran ${ranTimes} ${ranTimes === 1 ? 'time' : 'times'}` : ''}`
          )}
        </span>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          title={pinned ? 'Unpin From the Dock' : 'Pin to the Dock'}
          onClick={() => setPinned(flowId, !pinned)}
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 ${pinned ? '' : 'opacity-0 group-hover:opacity-100 touch:opacity-100'}`}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
        <span className="opacity-0 transition-opacity group-hover:opacity-100 touch:opacity-100">
          <TileDeleteButton variant="chrome" size="sm" title="Delete Flow" onDelete={() => removeFlow(flowId)} />
        </span>
      </div>
    </div>
  )
}

// The template's public page, for a YouTube description or a Skool post: it
// reads for anyone, and a member's Open in UGC OS lands in Template Setup.
function CopyLinkButton({ slug }: { slug: string }) {
  const addToast = useAppStore((s) => s.addToast)
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy Link · a page anyone can open, with Open in UGC OS for members"
      onClick={() => {
        navigator.clipboard.writeText(publicTemplateUrl(slug)).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => addToast("Couldn't copy the link. Your browser blocked the clipboard.", 'error'),
        )
      }}
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-100"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-flow-300" /> : <Link2 className="h-3.5 w-3.5" />}
    </button>
  )
}
