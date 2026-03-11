export type Gender = 'Female' | 'Male'
export type Ambience = 'Studio' | 'Small Room'

export interface VoiceOption {
  name: string
  gender: Gender
  style: string
}

export const VOICES: VoiceOption[] = [
  // Female voices (14)
  { name: 'Achernar', gender: 'Female', style: 'SOFT' },
  { name: 'Aoede', gender: 'Female', style: 'BREEZY' },
  { name: 'Autonoe', gender: 'Female', style: 'BRIGHT' },
  { name: 'Callirrhoe', gender: 'Female', style: 'EASY-GOING' },
  { name: 'Despina', gender: 'Female', style: 'SMOOTH' },
  { name: 'Erinome', gender: 'Female', style: 'CLEAR' },
  { name: 'Gacrux', gender: 'Female', style: 'MATURE' },
  { name: 'Kore', gender: 'Female', style: 'FIRM' },
  { name: 'Laomedeia', gender: 'Female', style: 'UPBEAT' },
  { name: 'Leda', gender: 'Female', style: 'YOUTHFUL' },
  { name: 'Pulcherrima', gender: 'Female', style: 'FORWARD' },
  { name: 'Sulafat', gender: 'Female', style: 'WARM' },
  { name: 'Vindemiatrix', gender: 'Female', style: 'GENTLE' },
  { name: 'Zephyr', gender: 'Female', style: 'BRIGHT' },

  // Male voices (16)
  { name: 'Achird', gender: 'Male', style: 'FRIENDLY' },
  { name: 'Algenib', gender: 'Male', style: 'GRAVELLY' },
  { name: 'Algieba', gender: 'Male', style: 'SMOOTH' },
  { name: 'Alnilam', gender: 'Male', style: 'FIRM' },
  { name: 'Charon', gender: 'Male', style: 'INFORMATIVE' },
  { name: 'Enceladus', gender: 'Male', style: 'BREATHY' },
  { name: 'Fenrir', gender: 'Male', style: 'EXCITABLE' },
  { name: 'Iapetus', gender: 'Male', style: 'CLEAR' },
  { name: 'Orus', gender: 'Male', style: 'FIRM' },
  { name: 'Puck', gender: 'Male', style: 'UPBEAT' },
  { name: 'Rasalgethi', gender: 'Male', style: 'INFORMATIVE' },
  { name: 'Sadachbia', gender: 'Male', style: 'LIVELY' },
  { name: 'Sadaltager', gender: 'Male', style: 'KNOWLEDGEABLE' },
  { name: 'Schedar', gender: 'Male', style: 'EVEN' },
  { name: 'Umbriel', gender: 'Male', style: 'EASY-GOING' },
  { name: 'Zubenelgenubi', gender: 'Male', style: 'CASUAL' },
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
    voiceName: 'Achernar',
    gender: 'Female',
    creativity: 1.3,
    ambience: 'Studio',
    styleInstructions: '',
  }
}
