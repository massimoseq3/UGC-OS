import { useEffect, useRef, useState } from 'react'
import { FolderOpen, ChevronDown, Plus, Check, Layers } from 'lucide-react'
import { useBankStore } from '../stores/bankStore'
import { useSettingsStore } from '../stores/settingsStore'

// Header chip + dropdown for picking the "active project". When set, every
// new bank item the user creates auto-tags into it (see
// `autoProjectIds` in bankStore.ts). "All projects" clears the active
// project; new items aren't auto-tagged.
export default function ProjectSwitcher() {
  const projects = useBankStore((s) => s.projects)
  const addProject = useBankStore((s) => s.addProject)
  const activeProjectId = useSettingsStore((s) => s.activeProjectId)
  const setActiveProject = useSettingsStore((s) => s.setActiveProject)

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setDraftName('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const active = projects.find((p) => p.id === activeProjectId) ?? null

  const handleCreate = () => {
    const name = draftName.trim()
    if (!name) return
    const id = addProject({ name })
    setActiveProject(id)
    setCreating(false)
    setDraftName('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]"
        title={active ? `Active project: ${active.name}` : 'No active project'}
      >
        {active ? (
          <FolderOpen className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Layers className="h-3.5 w-3.5 text-zinc-400" />
        )}
        <span className="max-w-[140px] truncate">{active ? active.name : 'All projects'}</span>
        <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/5 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Active project
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            <SwitcherRow
              icon={<Layers className="h-3.5 w-3.5 text-zinc-400" />}
              label="All projects"
              hint="No auto-tag on new items"
              active={!activeProjectId}
              onClick={() => { setActiveProject(null); setOpen(false) }}
            />

            {projects.map((p) => (
              <SwitcherRow
                key={p.id}
                icon={<FolderOpen className="h-3.5 w-3.5 text-emerald-400" />}
                label={p.name}
                active={p.id === activeProjectId}
                onClick={() => { setActiveProject(p.id); setOpen(false) }}
              />
            ))}

            {projects.length === 0 && (
              <p className="px-3 py-3 text-center text-[11px] text-zinc-500">
                No projects yet — create one to organize work.
              </p>
            )}
          </div>

          <div className="border-t border-white/5 p-2">
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreating(false); setDraftName('') }
                  }}
                  placeholder="Project name…"
                  className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500/40"
                />
                <button
                  onClick={handleCreate}
                  disabled={!draftName.trim()}
                  className="flex h-7 items-center rounded-md bg-emerald-500/20 px-2 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.04]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New project</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SwitcherRow({
  icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        active ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.04]'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="hidden text-[10px] text-zinc-600 sm:inline">{hint}</span>}
      {active && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
    </button>
  )
}
