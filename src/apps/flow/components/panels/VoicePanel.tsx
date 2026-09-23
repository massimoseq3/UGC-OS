// The Voiceovers block: Voiceovers' own settings — the voice, the delivery,
// the scene and tone — with the script coming in on a wire. A Voice Preset
// wired in takes over the voice and delivery for that run.

import { useState } from 'react'
import type { FlowBlock } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import SettingsView from '../../../voice-studio/components/SettingsView'
import VoicePickerView from '../../../voice-studio/components/VoicePickerView'
import PresetPickerView from '../../../voice-studio/components/PresetPickerView'
import PickerModal from '../../../voice-studio/components/PickerModal'
import { sanitizeVoiceSettings, settingsFromPreset, type VoiceSettings } from '../../../voice-studio/types'
import ModelPicker from '../../../../components/ModelPicker'
import { resolveTtsModel } from '../../../../stores/settingsStore'

export default function VoicePanel({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const settings = sanitizeVoiceSettings(block.settings as Partial<VoiceSettings>)
  const modelId = (block.settings.modelId as string | undefined) ?? resolveTtsModel()
  const update = (next: VoiceSettings) => patchSettings(block.id, { ...next }, { coalesce: `voice:${block.id}` })

  return (
    <>
      <div className="px-5 pt-3">
        <ModelPicker
          appId="voice-studio"
          task="tts"
          row
          value={modelId}
          onChange={(id) => patchSettings(block.id, { modelId: id })}
          persist={false}
        />
      </div>
      <SettingsView
        settings={settings}
        onSettingsChange={update}
        onOpenVoicePicker={() => setVoiceOpen(true)}
        onOpenPresetPicker={() => setPresetOpen(true)}
      />
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
    </>
  )
}
