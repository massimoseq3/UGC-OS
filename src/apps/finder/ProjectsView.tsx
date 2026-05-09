import { useMemo, useState } from 'react'
import { ArrowLeft, FolderOpen, Plus, Pencil, Trash2, Layers, Package, UserRound, FileText, Mic, Film, Video } from 'lucide-react'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import type { Project, BRoll, Model, Product, Script, VideoHistoryItem, VoicePreset } from '../../stores/types'

// Self-contained Projects browser. Two modes via internal state:
//   - list: grid of project cards with quick member counts + create form
//   - detail: members grouped by type, with edit/delete on the project itself.
export default function ProjectsView() {
  const projects = useBankStore((s) => s.projects)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = projects.find((p) => p.id === selectedId) ?? null

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => setSelectedId(null)} />
  }
  return <ProjectList onOpen={(id) => setSelectedId(id)} />
}

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useBankStore((s) => s.projects)
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const addProject = useBankStore((s) => s.addProject)
  const deleteProject = useBankStore((s) => s.deleteProject)
  const setActiveProject = useSettingsStore((s) => s.setActiveProject)
  const activeProjectId = useSettingsStore((s) => s.activeProjectId)

  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    const tally = (items: Array<{ projectIds?: string[] }>) => {
      for (const item of items) {
        for (const pid of item.projectIds ?? []) {
          map[pid] = (map[pid] ?? 0) + 1
        }
      }
    }
    tally(products); tally(models); tally(scripts); tally(voices); tally(brolls); tally(videoHistory)
    return map
  }, [products, models, scripts, voices, brolls, videoHistory])

  const handleCreate = () => {
    const name = draftName.trim()
    if (!name) return
    addProject({ name })
    setDraftName('')
    setCreating(false)
  }

  if (projects.length === 0 && !creating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Layers className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <div>
          <p className="text-sm text-zinc-400">No projects yet</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-600">
            Projects group products, characters, scripts, voices, and B-Rolls into a single workspace.
            Set an active project from the header to auto-tag new generations.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-4 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Create your first project
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {creating && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <FolderOpen className="h-4 w-4 text-emerald-400" />
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setDraftName('') }
            }}
            placeholder="Project name…"
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500/40"
          />
          <button
            onClick={handleCreate}
            disabled={!draftName.trim()}
            className="rounded-md bg-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-40"
          >
            Create
          </button>
          <button
            onClick={() => { setCreating(false); setDraftName('') }}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.04]"
          >
            Cancel
          </button>
        </div>
      )}

      {!creating && (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 self-start rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </button>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId
          return (
            <div
              key={p.id}
              className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white/[0.02] p-4 transition-all ${
                isActive ? 'border-emerald-500/40 ring-1 ring-emerald-500/30' : 'border-white/10 hover:border-white/20'
              }`}
              onClick={() => onOpen(p.id)}
            >
              <div className="flex items-start gap-3">
                <FolderOpen className="mt-0.5 h-5 w-5 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-zinc-100">{p.name}</h3>
                    {isActive && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {(counts[p.id] ?? 0)} {(counts[p.id] ?? 0) === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveProject(isActive ? null : p.id)
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                      : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  {isActive ? 'Deactivate' : 'Set active'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete project "${p.name}"? Items stay in their banks but lose this tag.`)) {
                      deleteProject(p.id)
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  title="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const updateProject = useBankStore((s) => s.updateProject)
  const deleteProject = useBankStore((s) => s.deleteProject)
  const removeItemFromProject = useBankStore((s) => s.removeItemFromProject)
  const setActiveProject = useSettingsStore((s) => s.setActiveProject)
  const activeProjectId = useSettingsStore((s) => s.activeProjectId)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)

  const filter = <T extends { projectIds?: string[] }>(items: T[]): T[] =>
    items.filter((i) => i.projectIds?.includes(project.id))

  const memberProducts = filter(products)
  const memberModels = filter(models)
  const memberScripts = filter(scripts)
  const memberVoices = filter(voices)
  const memberBrolls = filter(brolls)
  const memberVideos = filter(videoHistory)

  const totalMembers = memberProducts.length + memberModels.length + memberScripts.length + memberVoices.length + memberBrolls.length + memberVideos.length
  const isActive = project.id === activeProjectId

  const handleRename = () => {
    const name = draftName.trim()
    if (name && name !== project.name) {
      updateProject(project.id, { name })
    }
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <FolderOpen className="h-5 w-5 text-emerald-400" />
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') { setEditing(false); setDraftName(project.name) }
            }}
            className="rounded-md border border-emerald-500/30 bg-black/40 px-2 py-1 text-base font-semibold text-zinc-100 outline-none"
          />
        ) : (
          <h2 className="text-base font-semibold tracking-tight text-zinc-100">{project.name}</h2>
        )}
        {isActive && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
            Active
          </span>
        )}
        <span className="text-[11px] text-zinc-500">{totalMembers} {totalMembers === 1 ? 'item' : 'items'}</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setActiveProject(isActive ? null : project.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
            }`}
          >
            {isActive ? 'Deactivate' : 'Set active'}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete project "${project.name}"? Items stay in their banks but lose this tag.`)) {
                deleteProject(project.id)
                onBack()
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {totalMembers === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Layers className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-500">No items in this project yet</p>
          <p className="max-w-sm text-xs leading-relaxed text-zinc-600">
            Set this project active from the header switcher — every new product, character, script,
            voice, or B-Roll you create will be auto-tagged into it.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <Section icon={<Package className="h-4 w-4 text-amber-400" />} title="Products" count={memberProducts.length}>
            {memberProducts.map((p) => (
              <ProductRow key={p.id} item={p} onUntag={() => removeItemFromProject('products', p.id, project.id)} />
            ))}
          </Section>
          <Section icon={<UserRound className="h-4 w-4 text-sky-400" />} title="Characters" count={memberModels.length}>
            {memberModels.map((m) => (
              <CharacterRow key={m.id} item={m} onUntag={() => removeItemFromProject('models', m.id, project.id)} />
            ))}
          </Section>
          <Section icon={<FileText className="h-4 w-4 text-blue-400" />} title="Scripts" count={memberScripts.length}>
            {memberScripts.map((s) => (
              <ScriptRow key={s.id} item={s} onUntag={() => removeItemFromProject('scripts', s.id, project.id)} />
            ))}
          </Section>
          <Section icon={<Mic className="h-4 w-4 text-indigo-400" />} title="Voices" count={memberVoices.length}>
            {memberVoices.map((v) => (
              <VoiceRow key={v.id} item={v} onUntag={() => removeItemFromProject('voices', v.id, project.id)} />
            ))}
          </Section>
          <Section icon={<Film className="h-4 w-4 text-orange-400" />} title="B-Rolls" count={memberBrolls.length}>
            {memberBrolls.map((b) => (
              <BRollRow key={b.id} item={b} onUntag={() => removeItemFromProject('brolls', b.id, project.id)} />
            ))}
          </Section>
          <Section icon={<Video className="h-4 w-4 text-fuchsia-400" />} title="Video generations" count={memberVideos.length}>
            {memberVideos.map((v) => (
              <VideoHistoryRow key={v.id} item={v} onUntag={() => removeItemFromProject('videoHistory', v.id, project.id)} />
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
        <span className="text-[10px] text-zinc-600">{count}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

interface RowProps {
  thumb?: string
  title: string
  subtitle?: string
  onUntag: () => void
}

function MemberRow({ thumb, title, subtitle, onUntag }: RowProps) {
  const url = useAssetUrl(thumb)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40">
        {url ? <img src={url} className="h-full w-full object-cover" /> : <Layers className="h-4 w-4 text-zinc-700" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-zinc-200">{title}</p>
        {subtitle && <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>}
      </div>
      <button
        onClick={onUntag}
        title="Remove from project"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

function ProductRow({ item, onUntag }: { item: Product; onUntag: () => void }) {
  return <MemberRow thumb={item.productImage} title={item.productName} subtitle={item.targetMarket} onUntag={onUntag} />
}
function CharacterRow({ item, onUntag }: { item: Model; onUntag: () => void }) {
  return <MemberRow thumb={item.characterImage} title={item.name} subtitle={item.notes} onUntag={onUntag} />
}
function ScriptRow({ item, onUntag }: { item: Script; onUntag: () => void }) {
  return <MemberRow title={item.title} subtitle={item.scriptText.slice(0, 80)} onUntag={onUntag} />
}
function VoiceRow({ item, onUntag }: { item: VoicePreset; onUntag: () => void }) {
  return <MemberRow title={item.label} subtitle={item.voiceName} onUntag={onUntag} />
}
function BRollRow({ item, onUntag }: { item: BRoll; onUntag: () => void }) {
  return <MemberRow thumb={item.imageUrl} title={item.prompt.slice(0, 60) || '(no prompt)'} subtitle={item.videos?.length ? `${item.videos.length} video${item.videos.length === 1 ? '' : 's'}` : undefined} onUntag={onUntag} />
}
function VideoHistoryRow({ item, onUntag }: { item: VideoHistoryItem; onUntag: () => void }) {
  return <MemberRow title={item.prompt.slice(0, 60) || '(no prompt)'} subtitle={`${item.aspectRatio} · ${item.modelId}`} onUntag={onUntag} />
}
