import { useCallback, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Eraser, Loader2, Play, RotateCcw } from 'lucide-react'

import FlowNodeCard from './components/FlowNode'
import NodePalette from './components/NodePalette'
import NodeSheet from './components/NodeSheet'
import TemplateChooser from './components/TemplateChooser'
import { useFlowStore } from './stores/flowStore'
import { runFlow, estimateFlowCredits, MissingApiKeyError } from './services/runFlow'
import { useAppStore } from '../../stores/appStore'
import { useThemeStore } from '../../stores/themeStore'
import { formatCredits } from '../../utils/models'
import { humanizeError } from '../../utils/friendlyError'

const NODE_TYPES: NodeTypes = { flowNode: FlowNodeCard }

function FlowCanvas() {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const isValidConnection = useFlowStore((s) => s.isValidConnection)
  const setSheetNode = useFlowStore((s) => s.setSheetNode)
  const scratch = useFlowStore((s) => s.scratch)
  const running = useFlowStore((s) => s.running)
  const setRunning = useFlowStore((s) => s.setRunning)
  const clearOutputs = useFlowStore((s) => s.clearOutputs)
  const resetFlow = useFlowStore((s) => s.resetFlow)
  const addToast = useAppStore((s) => s.addToast)
  const theme = useThemeStore((s) => s.resolved)
  const [confirmReset, setConfirmReset] = useState(false)

  const estimate = useMemo(() => estimateFlowCredits(nodes), [nodes])
  const estimateText = formatCredits(estimate)
  const showChooser = nodes.length === 0 && !scratch

  const handleRun = useCallback(async () => {
    if (running || nodes.length === 0) return
    setRunning(true)
    try {
      const { ok, failed } = await runFlow()
      if (ok) addToast('Flow finished — every step is done.', 'success')
      else addToast(`Flow finished with ${failed} failed step${failed === 1 ? '' : 's'}.`, 'error')
    } catch (err) {
      addToast(
        err instanceof MissingApiKeyError ? err.message : humanizeError(err, 'The flow could not start.'),
        'error',
      )
    } finally {
      setRunning(false)
    }
  }, [running, nodes.length, setRunning, addToast])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => setSheetNode(node.id)}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        deleteKeyCode={['Backspace', 'Delete']}
        className="!bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} className="opacity-40" />
      </ReactFlow>

      {/* Floating chrome — inside the app frame, never body-portaled */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-4">
        {!showChooser && <NodePalette />}
        {!showChooser && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-ink/10 bg-surface-1/90 py-1.5 pl-4 pr-1.5 shadow-xl shadow-black/10 backdrop-blur-xl">
            {estimateText && (
              <span className="whitespace-nowrap text-[11px] text-ink-500">≈ {estimateText}</span>
            )}
            <button
              onClick={clearOutputs}
              title="Clear results (keeps the steps)"
              className="rounded-full p-2 text-ink-500 transition-colors duration-150 hover:bg-ink/5 hover:text-ink-200"
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true)
                  setTimeout(() => setConfirmReset(false), 3000)
                  return
                }
                setConfirmReset(false)
                resetFlow()
              }}
              title={confirmReset ? 'Click again to confirm' : 'Start over (pick a new recipe)'}
              className={`rounded-full p-2 transition-colors duration-150 hover:bg-ink/5 ${
                confirmReset ? 'text-red-400 light:text-red-600' : 'text-ink-500 hover:text-ink-200'
              }`}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={handleRun}
              disabled={running || nodes.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity duration-150 hover:opacity-85 disabled:opacity-40"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? 'Running…' : 'Run flow'}
            </button>
          </div>
        )}
      </div>

      {showChooser && <TemplateChooser />}
      <NodeSheet />
    </div>
  )
}

export default function FlowStudio() {
  return (
    <div className="h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  )
}
