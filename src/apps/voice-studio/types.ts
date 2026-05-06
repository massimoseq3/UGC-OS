export type Gender = 'Female' | 'Male'
export type Ambience = 'Studio' | 'Small Room'

export interface VoiceOption {
  name: string
  gender: Gender
  style: string
}

// ElevenLabs Turbo 2.5 voices on kie.ai. Curated subset; full list available
// per ElevenLabs API. Add more as needed.
export const VOICES: VoiceOption[] = [
  { name: 'Rachel', gender: 'Female', style: 'CALM, WARM' },
  { name: 'Aria', gender: 'Female', style: 'EXPRESSIVE' },
  { name: 'Sarah', gender: 'Female', style: 'SOFT' },
  { name: 'Laura', gender: 'Female', style: 'UPBEAT' },
  { name: 'Roger', gender: 'Male', style: 'CONFIDENT' },
  { name: 'Charlie', gender: 'Male', style: 'NATURAL' },
  { name: 'George', gender: 'Male', style: 'WARM BRITISH' },
]

export interface VoiceSettings {
  voiceName: string
  gender: Gender
  creativity: number
  ambience: Ambience
  styleInstructions: string
}

export interface HistoryItem {
  id: string
  voiceName: string
  gender: Gender
  ambience: Ambience
  creativity: number
  styleInstructions: string
  scriptText: string
  scriptPreview: string
  audioUrl: string
  duration: number
  createdAt: number
}

export function createDefaultSettings(): VoiceSettings {
  return {
    voiceName: 'Rachel',
    gender: 'Female',
    creativity: 1.0,
    ambience: 'Studio',
    styleInstructions: '',
  }
}
