import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Check, Plus } from 'lucide-react'
import { useBankStore } from '../stores/bankStore'

interface ProjectTagPopoverProps {
  // Currently-tagged project ids on the underlying item.
  projectIds: string[] | undefined
  // Toggle membership for a given project. Caller wires these to whichever
  // bank slice owns the item (videoHistory, brolls, etc.).
  onAdd: (projectId: string) => void
  onRemove: (projectId: string) => void
  // Dismiss the popover (click outside / Escape / picking a project does NOT
  // auto-close — multi-toggle in one open is supported, and many UIs benefit
  // from that. Caller decides how to anchor it).
  onClose: () => void
  // Tailwind classes for absolute positioning relative to the trigger button.
  // E.g. "absolute right-0 top-full mt-1" or "absolute right-1.5 top-9".
  anchorClassName?: string
}

// Generic project-tagging popover used by both the B-Roll Videos history grid
// (per-tile) and the Preview pane (Save to Project button). Renders the user's
// projects with toggle-on-click membership + an inline "create new project"
// row at the bottom; new projects are tagged immediately on creation.
export default function ProjectTagPopover({
  projectIds,
  onAdd,
  onRemove,
  onClose,
  anchorClassName = 'absolute right-0 top-full z-30 mt-1',
}: ProjectTagPopoverProps) {
  const projects = useBankStore((s) => s.projects)
  const addProject = useBankStore((s) => s.addProject)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const memberOf = new Set(projectIds ?? [])

  const handleCreate = async () => {
    const name = draftName.trim()
    if (!name) return
    const id = await addProject({ name })
    onAdd(id)
    setDraftName('')
    setCreating(false)
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={`${anchorClassName} w-[min(224px,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl`}
    >
      <div className="border-b border-white/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Add to project
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {projects.map((p) => {
          const isMember = memberOf.has(p.id)
          return (
            <button
              key={p.id}
              onClick={() => {
                if (isMember) onRemove(p.id)
                else onAdd(p.id)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                isMember ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {isMember && <Check className="h-3 w-3 shrink-0" />}
            </button>
          )
        })}
        {projects.length === 0 && !creating && (
          <p className="px-2 py-2 text-center text-[10px] text-zinc-500">No projects yet</p>
        )}
      </div>
      <div className="border-t border-white/5 p-1.5">
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
              placeholder="New project…"
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-white/30"
            />
            <button
              onClick={handleCreate}
              disabled={!draftName.trim()}
              className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <Plus className="h-3 w-3" />
            New project
          </button>
        )}
      </div>
    </div>
  )
}
