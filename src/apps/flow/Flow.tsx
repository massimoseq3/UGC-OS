// Flow: the apps as blocks on a canvas, wired into one run.
//
// Two screens: Flow Home (templates first, then your flows) and the flow
// itself. The open flow survives a reload.

import { useEffect } from 'react'
import { useFlowStore } from './store/flowStore'
import { useAppStore } from '../../stores/appStore'
import { resumeRuns } from './run/runtime'
import { useBankStore } from '../../stores/bankStore'
import FlowHome from './components/FlowHome'
import Editor from './components/Editor'
import '@xyflow/react/dist/style.css'
import './flow.css'

export default function Flow() {
  const openId = useFlowStore((s) => s.openId)
  const doc = useFlowStore((s) => (s.openId ? s.docs[s.openId] : undefined))
  const ensureDoc = useFlowStore((s) => s.ensureDoc)
  // The banks load after the page does, so a flow reopened on a reload is
  // picked up the moment its row lands.
  const rowLoaded = useBankStore((s) => !!openId && s.flows.some((f) => f.id === openId))
  const activeApp = useAppStore((s) => s.activeApp)
  const openFlow = useFlowStore((s) => s.openFlow)
  const setView = useFlowStore((s) => s.setView)

  // A pinned flow's dock tile opens it as an app, in Run View.
  useEffect(() => {
    if (activeApp !== 'flow') return
    const payload = useAppStore.getState().interAppPayload
    if (payload?.targetApp !== 'flow' || payload.targetField !== 'openFlow') return
    useAppStore.getState().consumePayload()
    const data = payload.data as { flowId?: string; view?: 'edit' | 'run' }
    if (!data.flowId) return
    openFlow(data.flowId)
    setView(data.view ?? 'run')
  }, [activeApp, openFlow, setView])

  // A run the last page load left going picks up where it was, whether or
  // not the flow it belongs to is the one on screen.
  useEffect(() => {
    void resumeRuns()
  }, [])

  useEffect(() => {
    if (openId && !doc && rowLoaded) ensureDoc(openId)
  }, [openId, doc, rowLoaded, ensureDoc])

  if (openId && doc) return <Editor flowId={openId} />
  return <FlowHome />
}
