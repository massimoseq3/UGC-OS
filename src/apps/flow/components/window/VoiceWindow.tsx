// Voiceovers, as a block. The left column is Voiceovers' own settings — the
// voice, the delivery, the tone and scene — with its model row and Generate at
// the foot, working on this block. The right is what it reads and what it
// made: every script coming in on the wire, each with its take beside it, or
// — with nothing wired — Voiceovers' own script box to type one into.

import { useState } from 'react'
import { Link2, Mic, Pause, Play } from 'lucide-react'
import type { Script } from '../../../../stores/types'
import type { FlowValue } from '../../types'
import { wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import SettingsView from '../../../voice-studio/components/SettingsView'
import VoicePickerView from '../../../voice-studio/components/VoicePickerView'
import PresetPickerView from '../../../voice-studio/components/PresetPickerView'
import PickerModal from '../../../voice-studio/components/PickerModal'
import EditorArea from '../../../voice-studio/components/EditorArea'
import { sanitizeVoiceSettings, settingsFromPreset, type VoiceSettings } from '../../../voice-studio/types'
import ModelPicker from '../../../../components/ModelPicker'
import BankPicker from '../../../../components/BankPicker'
import AudioScrubber from '../../../../components/AudioScrubber'
import GridCanvas from '../../../../components/GridCanvas'
import { resolveTtsModel } from '../../../../stores/settingsStore'
import { useAudioPlayback } from '../../../../hooks/useAudioPlayback'
import { InputsBand, NothingYet, RunBand, RunChip } from './parts'
import { blockRuns, blockTitle, type BlockRun, type WindowProps } from './runs'

export default function VoiceWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false)
  const [pickedScript, setPickedScript] = useState<Script | null>(null)
  const settings = sanitizeVoiceSettings(block.settings as Partial<VoiceSettings>)
  const modelId = (block.settings.modelId as string | undefined) ?? resolveTtsModel()
  const update = (next: VoiceSettings) => patchSettings(block.id, { ...next }, { coalesce: `voice:${block.id}` })
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const scriptWired = wiresInto(doc, block.id, 'script').length > 0
  const presetWire = wiresInto(doc, block.id, 'preset')[0]
  const count = runs.length || 1
  const scriptText = String(block.settings.scriptText ?? '')

  return (
    <>
      <div className="flex w-[460px] shrink-0 flex-col border-r border-ink/5">
        {presetWire && (
          <p className="mx-5 mt-4 flex items-start gap-2 rounded-2xl border border-voice-500/20 bg-voice-500/[0.06] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-300">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-voice-300" />
            A Voice Preset from {blockTitle(doc, presetWire.from)} is wired in. It sets the voice and delivery for each run; these are what runs without it.
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SettingsView
            settings={settings}
            onSettingsChange={update}
            onOpenVoicePicker={() => setVoiceOpen(true)}
            onOpenPresetPicker={() => setPresetOpen(true)}
          />
        </div>
        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={Mic} label={`Generate ${count > 1 ? `${count} Voiceovers` : 'Voiceover'}`}>
          <ModelPicker
            appId="voice-studio"
            task="tts"
            row
            value={modelId}
            onChange={(id) => patchSettings(block.id, { modelId: id })}
            persist={false}
          />
        </RunBand>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        {scriptWired ? (
          <GridCanvas>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {runs.length === 0 ? (
                <NothingYet icon={Mic} title="Nothing to read yet" hint="Each script that comes in on the wire gets its own voiceover, and lands here beside it." />
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6">
                  {runs.map((r) => <ReadCard key={r.key} run={r} />)}
                </div>
              )}
            </div>
          </GridCanvas>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <EditorArea
                scriptText={scriptText}
                onScriptChange={(v) => {
                  patchSettings(block.id, { scriptText: v }, { coalesce: `script:${block.id}` })
                  setPickedScript(null)
                }}
                onSelectScript={() => setScriptPickerOpen(true)}
                selectedScript={pickedScript}
                onClearScript={() => setPickedScript(null)}
              />
            </div>
            {runs.some((r) => r.result) && (
              <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-ink/5 px-5 py-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-500">Made by This Block</p>
                <div className="flex flex-col gap-2">
                  {runs.filter((r) => r.result).map((r) => <TakeRow key={r.key} run={r} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <PickerModal open={voiceOpen} title="Choose a Voice" fill onClose={() => setVoiceOpen(false)}>
        <VoicePickerView
          selectedId={settings.voiceId}
          onSelect={(v) => {
            update({ ...settings, voiceId: v.id, voiceName: v.name, gender: v.gender, presetId: undefined, presetLabel: undefined })
            setVoiceOpen(false)
          }}
        />
      </PickerModal>
      <PickerModal open={presetOpen} title="Choose a Voice Preset" subtitle="Loads the voice, delivery, scene and tone" onClose={() => setPresetOpen(false)}>
        <PresetPickerView
          selectedId={settings.presetId}
          onSelect={(p) => {
            update(settingsFromPreset(p))
            setPresetOpen(false)
          }}
        />
      </PickerModal>
      <BankPicker
        bankType="scripts"
        isOpen={scriptPickerOpen}
        onClose={() => setScriptPickerOpen(false)}
        onSelect={(item) => {
          const script = item as Script
          patchSettings(block.id, { scriptText: script.scriptText })
          setPickedScript(script)
          setScriptPickerOpen(false)
        }}
      />
    </>
  )
}

// One script coming in, and the take this block read of it.
function ReadCard({ run }: { run: BlockRun }) {
  const script = run.inputs.script?.[0]
  const text = script && !script.pending ? (script.payload as { text?: string }).text ?? script.label : ''
  return (
    <div className="rounded-2xl border border-ink/5 bg-surface-1/80 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Read {run.index + 1}</span>
        <span className="ml-auto"><RunChip status={run.status} note={run.note} /></span>
      </div>
      <p className={`whitespace-pre-wrap text-[13px] leading-relaxed ${text ? 'text-ink-200' : 'text-ink-500'}`}>
        {text || 'Waiting on the block that writes it.'}
      </p>
      {run.error && <p className="mt-2 text-[12px] text-red-400">{run.error}</p>}
      <TakePlayer value={run.result?.outputs.audio?.[0]} />
    </div>
  )
}

function TakeRow({ run }: { run: BlockRun }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-ink/[0.02] px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-300">{run.label}</span>
      <div className="w-[55%] shrink-0"><TakePlayer value={run.result?.outputs.audio?.[0]} bare /></div>
    </div>
  )
}

// A take, on the app's one audio transport: play, the scrubber, the clock.
function TakePlayer({ value, bare = false }: { value: FlowValue | undefined; bare?: boolean }) {
  const ref = value?.type === 'audio' ? value.payload.ref : null
  const seconds = value?.type === 'audio' ? value.payload.durationSeconds : 0
  const player = useAudioPlayback(ref, seconds)
  if (!ref) return null
  const total = player.duration || seconds
  return (
    <div className={`flex items-center gap-3 ${bare ? '' : 'mt-3 rounded-full border border-voice-500/20 bg-voice-500/[0.05] py-1.5 pl-1.5 pr-4'}`}>
      <button
        type="button"
        onClick={player.toggle}
        aria-label={player.isPlaying ? 'Pause' : 'Play'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-voice-500 text-white transition-all hover:brightness-110"
      >
        {player.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <AudioScrubber
        progress={total ? player.position / total : 0}
        onSeek={player.isLoaded ? (f) => player.seekTo(f * total) : undefined}
        className="flex-1"
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-ink-400">{clock(player.isLoaded ? player.position : total)}</span>
    </div>
  )
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
