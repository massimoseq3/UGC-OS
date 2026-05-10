import { useState } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import { useBankStore } from '../stores/bankStore'
import ProjectTagPopover from '../apps/video-studio/components/ProjectTagPopover'

type Bank = 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

interface AddToProjectButtonProps {
  bank: Bank
  // When set, toggling persists immediately via the bank store. When undefined
  // (new item, not yet saved), changes go through onLocalChange and the caller
  // submits projectIds with the create payload.
  itemId?: string
  projectIds: string[]
  onLocalChange?: (next: string[]) => void
}

export default function AddToProjectButton({ bank, itemId, projectIds, onLocalChange }: AddToProjectButtonProps) {
  const [open, setOpen] = useState(false)
  const projects = useBankStore((s) => s.projects)
  const addItemToProject = useBankStore((s) => s.addItemToProject)
  const removeItemFromProject = useBankStore((s) => s.removeItemFromProject)

  const memberProjects = projects.filter((p) => projectIds.includes(p.id))
  const count = memberProjects.length

  const handleAdd = (pid: string) => {
    if (itemId) addItemToProject(bank, itemId, pid)
    else if (onLocalChange) onLocalChange([...projectIds, pid])
  }

  const handleRemove = (pid: string) => {
    if (itemId) removeItemFromProject(bank, itemId, pid)
    else if (onLocalChange) onLocalChange(projectIds.filter((id) => id !== pid))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
          count > 0
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
            : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]'
        }`}
      >
        <FolderOpen className="h-3 w-3" />
        {count === 0 ? (
          <>
            <Plus className="h-3 w-3 opacity-60" />
            <span>Add to project</span>
          </>
        ) : count === 1 ? (
          <span className="max-w-[140px] truncate">In: {memberProjects[0].name}</span>
        ) : (
          <span>In {count} projects</span>
        )}
      </button>
      {open && (
        <ProjectTagPopover
          projectIds={projectIds}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onClose={() => setOpen(false)}
          anchorClassName="absolute right-0 top-full z-30 mt-1"
        />
      )}
    </div>
  )
}
