// The Characters block, generating: the Characters app's own form — Physical
// and Scene & Pose, every field and preset, reference photos with DNA
// extraction, Portrait or Character Sheet and 1 to 4 faces — with its
// Generate turned into Run Block and a model that belongs to this block.

import { useState } from 'react'
import type { FlowBlock } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import type { LiveRun } from '../../run/runtime'
import ControlsPanel from '../../../character-studio/components/ControlsPanel'
import { createEmptyProfile, type CharacterProfile, type TabId } from '../../../character-studio/types'
import { extractCharacterProfile } from '../../../character-studio/runner'
import { humanizeError } from '../../../../utils/friendlyError'
import { isRecordingActive } from '../../../../stores/recordingStore'
import { useAppStore } from '../../../../stores/appStore'
import type { ImageResolution } from '../../../../utils/models'
import type { RunRequest } from '../Editor'

export default function CharactersPanel({ block, run, onRun }: { block: FlowBlock; run: LiveRun | undefined; onRun: (req: RunRequest) => void }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const addToast = useAppStore((s) => s.addToast)
  const [tab, setTab] = useState<TabId>('physical')
  const [analyzing, setAnalyzing] = useState(0)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const s = block.settings
  const profile: CharacterProfile = { ...createEmptyProfile(), ...((s.profile as CharacterProfile | undefined) ?? {}) }
  const count = Math.min(4, Math.max(1, Number(s.count) || 1))
  const state = run?.status === 'running' ? run.blocks[block.id] : undefined

  const setProfile = (next: CharacterProfile) => patchSettings(block.id, { profile: next }, { coalesce: `profile:${block.id}` })

  // A reference photo → the whole form, read by the same vision call the
  // Characters app makes.
  const onPhotoDrop = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    if (isRecordingActive()) {
      addToast('Recording Mode is on, so the photo was not analyzed.', 'info')
      return
    }
    setExtractError(null)
    setAnalyzing(1)
    try {
      const extracted = await extractCharacterProfile(file)
      setProfile({ ...profile, ...extracted })
      setThumb(URL.createObjectURL(file))
    } catch (err) {
      setExtractError(humanizeError(err, 'That photo could not be read. Try another.'))
    }
    setAnalyzing(0)
  }

  return (
    <ControlsPanel
      profile={profile}
      onProfileChange={setProfile}
      activeTab={tab}
      onActiveTabChange={setTab}
      analyzingCount={analyzing}
      extractError={extractError}
      referenceApplied={!!thumb}
      extractedThumb={thumb}
      onPhotoDrop={(files) => void onPhotoDrop(files)}
      onResetExtract={() => {
        setThumb(null)
        setExtractError(null)
      }}
      onOpenLibrary={() => addToast('Your reference library lives in Characters. Drop a photo here to read it into this form.', 'info')}
      onClear={() => setProfile(createEmptyProfile())}
      error={state?.status === 'error' ? state.reason ?? null : null}
      onGenerate={() => onRun({ only: block.id })}
      canGenerate
      resolution={(s.resolution as ImageResolution) ?? '1K'}
      onResolutionChange={(v) => patchSettings(block.id, { resolution: v })}
      sheetMode={s.kind === 'sheet'}
      onSheetModeChange={(sheet) => patchSettings(block.id, { kind: sheet ? 'sheet' : 'portrait' })}
      batchCount={count}
      onBatchCountChange={(n) => patchSettings(block.id, { count: n })}
      inFlightCount={state?.status === 'running' ? state.total - state.finished : 0}
      modelId={s.modelId as string | undefined}
      onModelChange={(id) => patchSettings(block.id, { modelId: id })}
      actionLabel={count === 1 ? 'Run Block' : `Run Block · ${count} Faces`}
    />
  )
}
