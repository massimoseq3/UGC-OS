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
import LineageModal from './components/LineageModal'
import { loadGallery } from './templates/gallery'
import type { LineageBank } from '../../stores/types'
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
  const openLineage = useFlowStore((s) => s.openLineage)
  const openSetup = useFlowStore((s) => s.openSetup)

  // A pinned flow's dock tile opens it as an app, in Run View; an app tile's
  // How It Was Made or Save as Flow opens that window over whatever Flow
  // shows. Keyed on the payload as well as the app: both are pressed while
  // Flow is already open as often as not, and then only the payload changes.
  const payload = useAppStore((s) => s.interAppPayload)
  useEffect(() => {
    if (activeApp !== 'flow' || payload?.targetApp !== 'flow') return
    if (payload.targetField === 'openFlow') {
      useAppStore.getState().consumePayload()
      const data = payload.data as { flowId?: string; view?: 'edit' | 'run' }
      if (!data.flowId) return
      openFlow(data.flowId)
      setView(data.view ?? 'run')
    } else if (payload.targetField === 'lineage') {
      useAppStore.getState().consumePayload()
      const data = payload.data as { bank?: LineageBank; id?: string; view?: 'how' | 'save' }
      if (data.bank && data.id) openLineage({ bank: data.bank, id: data.id }, data.view ?? 'how')
    } else if (payload.targetField === 'openTemplate') {
      // A share link: that gallery template's setup, over Flow Home.
      useAppStore.getState().consumePayload()
      const slug = (payload.data as { slug?: string }).slug
      if (!slug) return
      void loadGallery().then((entries) => {
        const entry = entries.find((e) => e.slug === slug)
        if (!entry) {
          useAppStore.getState().addToast("That template isn't in the gallery any more. Flow Home has the current ones.", 'info')
          return
        }
        openFlow(null)
        openSetup({ kind: 'gallery', entry })
      })
    }
  }, [activeApp, payload, openFlow, setView, openLineage, openSetup])

  // A run the last page load left going picks up where it was, whether or
  // not the flow it belongs to is the one on screen.
  useEffect(() => {
    void resumeRuns()
  }, [])

  useEffect(() => {
    if (openId && !doc && rowLoaded) ensureDoc(openId)
  }, [openId, doc, rowLoaded, ensureDoc])

  return (
    <>
      {openId && doc ? <Editor flowId={openId} /> : <FlowHome />}
      <LineageModal />
    </>
  )
}
