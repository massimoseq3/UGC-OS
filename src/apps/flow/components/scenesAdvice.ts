// Scene Clips films a script scene by scene only when the script HAS scenes,
// and whether it will is decided upstream, in how Scripts is set up — which
// a member new to the canvas can't be expected to know. This reads the wiring
// and says, before anything is spent, when the script coming in will arrive
// as one block of prose, with the one change that fixes it.

import type { FlowBlock, FlowDoc } from '../types'
import { useFlowStore } from '../store/flowStore'

export interface ScenesAdvice {
  text: string
  fix: string
  apply: () => void
}

export function scenesAdvice(doc: FlowDoc, block: FlowBlock): ScenesAdvice | null {
  if (block.kind !== 'scenes' || block.settings.shape === 'one') return null
  const into = doc.wires.find((w) => w.to === block.id && w.toPort === 'script')
  const scripts = into ? doc.blocks.find((b) => b.id === into.from && b.kind === 'scripts') : undefined
  if (!scripts || scripts.source === 'bank' || scripts.source === 'history') return null
  const s = scripts.settings
  const store = useFlowStore.getState()
  const source = doc.wires.find((w) => w.to === scripts.id && w.toPort === 'source')
  const from = source ? doc.blocks.find((b) => b.id === source.from) : undefined
  if (s.mode === 'remix' && from?.kind === 'analyzer' && source?.fromPort === 'transcript') {
    return {
      text: "Scripts is remixing the ad's transcript, which comes back as one script with no scenes, so it would be filmed as one clip.",
      fix: 'Use the Ad’s Scene Prompts',
      apply: () => {
        store.removeWire(source.id)
        store.connect({ from: from.id, fromPort: 'scenes', to: scripts.id, toPort: 'source' })
      },
    }
  }
  // Hooks are one line each, filmed as one clip apiece on purpose.
  if (s.mode !== 'remix' && s.writeFormat === 'script') {
    return {
      text: 'Scripts writes plain scripts here, with no scenes, so each would be filmed as one clip.',
      fix: 'Write It as Scenes',
      apply: () => store.patchSettings(scripts.id, { writeFormat: 'scenes' }),
    }
  }
  return null
}
