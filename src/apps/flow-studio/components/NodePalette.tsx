import { Plus } from 'lucide-react'
import { NODE_DEFS, PALETTE_GROUPS } from '../nodeDefs'
import { useFlowStore } from '../stores/flowStore'
import type { NodeKind } from '../types'

// Left rail: click a chip to drop that node onto the canvas.
export default function NodePalette() {
  const addNode = useFlowStore((s) => s.addNode)

  const add = (kind: NodeKind) => {
    // Stagger spawn positions by node count so repeated adds don't stack
    // perfectly on top of each other.
    const n = useFlowStore.getState().nodes.length
    addNode(kind, { x: 160 + (n % 5) * 36, y: 100 + (n % 5) * 28 })
  }

  return (
    <div className="pointer-events-auto w-44 space-y-3 rounded-2xl border border-ink/10 bg-surface-1/90 p-3 shadow-xl shadow-black/10 backdrop-blur-xl">
      {PALETTE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-ink-600">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.kinds.map((kind) => {
              const def = NODE_DEFS[kind]
              const Icon = def.icon
              return (
                <button
                  key={kind}
                  onClick={() => add(kind)}
                  title={def.tagline}
                  className="group flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left transition-colors duration-150 hover:bg-ink/5"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${def.accent}26` }}
                  >
                    <Icon className="h-3 w-3" style={{ color: def.accent }} strokeWidth={2} />
                  </span>
                  <span className="flex-1 truncate text-xs text-ink-300 group-hover:text-ink-100">
                    {def.label}
                  </span>
                  <Plus className="h-3 w-3 text-ink-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
