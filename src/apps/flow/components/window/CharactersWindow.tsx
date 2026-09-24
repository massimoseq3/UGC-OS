// Characters, as a block. The left column is the Characters app's own form —
// Physical and Scene & Pose, every field and preset, a reference photo read
// into the form, Portrait or Character Sheet and 1 to 4 faces — with its
// Generate running this block, on a model that belongs to the block. The
// right is the faces, slot by slot, as they're made.

import { useState } from 'react'
import { Eye, EyeOff, UserRound, X } from 'lucide-react'
import type { FlowValue } from '../../types'
import { liveItems } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import ControlsPanel from '../../../character-studio/components/ControlsPanel'
import { createEmptyProfile, type CharacterProfile, type TabId } from '../../../character-studio/types'
import { extractCharacterProfile } from '../../../character-studio/runner'
import { humanizeError } from '../../../../utils/friendlyError'
import { isRecordingActive } from '../../../../stores/recordingStore'
import { useAppStore } from '../../../../stores/appStore'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import GridCanvas from '../../../../components/GridCanvas'
import { PendingMedia } from '../../../../components/GeneratingMedia'
import type { ImageResolution } from '../../../../utils/models'
import { InputsBand, NothingYet, RunChip } from './parts'
import { blockRuns, type WindowProps } from './runs'

export default function CharactersWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const toggleItem = useFlowStore((s) => s.toggleItem)
  const deleteItem = useFlowStore((s) => s.deleteItem)
  const addToast = useAppStore((s) => s.addToast)
  const [tab, setTab] = useState<TabId>('physical')
  const [analyzing, setAnalyzing] = useState(0)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const s = block.settings
  const profile: CharacterProfile = { ...createEmptyProfile(), ...((s.profile as CharacterProfile | undefined) ?? {}) }
  const count = Math.min(4, Math.max(1, Number(s.count) || 1))
  const state = run?.status === 'running' ? run.blocks[block.id] : undefined
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const slots = liveItems(block)
  const sheet = s.kind === 'sheet'

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
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
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
          sheetMode={sheet}
          onSheetModeChange={(next) => patchSettings(block.id, { kind: next ? 'sheet' : 'portrait' })}
          batchCount={count}
          onBatchCountChange={(n) => patchSettings(block.id, { count: n })}
          inFlightCount={state?.status === 'running' ? state.total - state.finished : 0}
          modelId={s.modelId as string | undefined}
          onModelChange={(id) => patchSettings(block.id, { modelId: id })}
          actionLabel={count === 1 ? 'Generate Character' : `Generate ${count} Characters`}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <NothingYet icon={UserRound} title="No faces yet" hint="Each face is its own generation. Turn one off and nothing after it runs for that face." />
            ) : (
              <div className="flex flex-col gap-6 px-6 py-6">
                {runs.map((r) => (
                  <section key={r.key}>
                    {runs.length > 1 && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="truncate text-[12px] font-medium text-ink-300">{r.label}</span>
                        <RunChip status={r.status} note={r.note} />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                      {slots.map((slot, i) => {
                        const value = r.result?.items?.[slot.id]
                        const making = r.status === 'running' && !value
                        return (
                          <FaceTile
                            key={slot.id}
                            label={`Face ${i + 1}`}
                            value={value}
                            making={making}
                            off={!!slot.off}
                            sheet={sheet}
                            modelId={s.modelId as string | undefined}
                            onToggle={() => toggleItem(block.id, slot.id)}
                            onDelete={slots.length > 1 ? () => deleteItem(block.id, slot.id) : undefined}
                          />
                        )
                      })}
                    </div>
                    {r.error && <p className="mt-2 text-[12px] text-red-400">{r.error}</p>}
                  </section>
                ))}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>
    </>
  )
}

function FaceTile({ label, value, making, off, sheet, modelId, onToggle, onDelete }: {
  label: string
  value: FlowValue | undefined
  making: boolean
  off: boolean
  sheet: boolean
  modelId?: string
  onToggle: () => void
  onDelete?: () => void
}) {
  const ref = value?.type === 'character' ? value.payload.imageRef : undefined
  const thumb = useAssetThumb(ref)
  const aspect = sheet ? 'aspect-[4/3]' : 'aspect-[9/16]'
  return (
    <div className={`group relative ${off ? 'opacity-40' : ''}`}>
      {making ? (
        <PendingMedia kind="image" family="influencers" modelId={modelId} aspectRatio={sheet ? '4:3' : '9:16'} />
      ) : ref ? (
        <div className={`relative overflow-hidden rounded-xl border border-ink/10 ${aspect}`}>
          {thumb.url ? <img src={thumb.url} alt={label} className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 bg-ink/10" />}
        </div>
      ) : (
        <div className={`flex items-center justify-center rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] ${aspect}`}>
          <UserRound className="h-6 w-6 text-ink-700" strokeWidth={1.5} />
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-400">{label}{off ? ' · Off' : ''}</span>
        <button type="button" onClick={onToggle} title={off ? `Turn ${label} On` : `Turn ${label} Off · nothing after it runs for it`} className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-ink/5 hover:text-ink-100">
          {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} title={`Delete ${label}`} className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 opacity-0 hover:bg-ink/5 hover:text-ink-100 group-hover:opacity-100 touch:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
