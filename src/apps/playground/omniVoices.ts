// Gemini Omni base voice catalog. These are the preset voice ids accepted by
// kie's /omni/audio/create `audio_id` field — a designed voice starts from
// one of these and layers a text description on top. Labels come from kie's
// API doc (gender, character, pitch).
// Source: https://docs.kie.ai/market/gemini-omni-audio

export interface OmniBaseVoice {
  id: string
  label: string
  gender: 'Female' | 'Male' | 'Neutral'
}

// Public sample clips for each base voice, hosted by Google's Cloud TTS docs
// (these are the same Chirp3-HD/Gemini voices under their star names).
// Verified live 2026-06-12; playback degrades gracefully if Google moves them.
export function omniVoicePreviewUrl(id: string): string {
  // Google's docs misspell aoede's sample filename.
  const slug = id === 'aoede' ? 'aoeda' : id
  return `https://docs.cloud.google.com/text-to-speech/docs/audio/chirp3-hd-${slug}.wav`
}

export const OMNI_BASE_VOICES: OmniBaseVoice[] = [
  { id: 'achernar', label: 'Achernar — soft, high pitch', gender: 'Female' },
  { id: 'achird', label: 'Achird — friendly, mid pitch', gender: 'Male' },
  { id: 'algenib', label: 'Algenib — raspy, low pitch', gender: 'Male' },
  { id: 'algieba', label: 'Algieba — easygoing, mid-low pitch', gender: 'Male' },
  { id: 'alnilam', label: 'Alnilam — steady, mid-low pitch', gender: 'Male' },
  { id: 'aoede', label: 'Aoede — brisk, mid pitch', gender: 'Female' },
  { id: 'autonoe', label: 'Autonoe — bright, mid pitch', gender: 'Female' },
  { id: 'callirrhoe', label: 'Callirrhoe — easygoing, mid pitch', gender: 'Female' },
  { id: 'charon', label: 'Charon — intellectual, low pitch', gender: 'Male' },
  { id: 'despina', label: 'Despina — smooth, mid pitch', gender: 'Female' },
  { id: 'enceladus', label: 'Enceladus — breathy, low pitch', gender: 'Male' },
  { id: 'erinome', label: 'Erinome — clear, mid pitch', gender: 'Female' },
  { id: 'fenrir', label: 'Fenrir — lively, younger pitch', gender: 'Male' },
  { id: 'gacrux', label: 'Gacrux — mature, mid pitch', gender: 'Female' },
  { id: 'iapetus', label: 'Iapetus — clear, mid-low pitch', gender: 'Male' },
  { id: 'kore', label: 'Kore — capable, mid pitch', gender: 'Female' },
  { id: 'laomedeia', label: 'Laomedeia — cheerful, mid-high pitch', gender: 'Female' },
  { id: 'leda', label: 'Leda — young, mid-high pitch', gender: 'Female' },
  { id: 'orus', label: 'Orus — steady, mid-low pitch', gender: 'Male' },
  { id: 'puck', label: 'Puck — cheerful, mid pitch', gender: 'Male' },
  { id: 'pulcherrima', label: 'Pulcherrima — forward, mid-high pitch', gender: 'Neutral' },
  { id: 'rasalgethi', label: 'Rasalgethi — intellectual, mid pitch', gender: 'Male' },
  { id: 'sadachbia', label: 'Sadachbia — vivid, low pitch', gender: 'Male' },
  { id: 'sadaltager', label: 'Sadaltager — knowledgeable, mid pitch', gender: 'Male' },
  { id: 'schedar', label: 'Schedar — smooth, mid-low pitch', gender: 'Male' },
  { id: 'sulafat', label: 'Sulafat — warm, mid pitch', gender: 'Female' },
  { id: 'umbriel', label: 'Umbriel — smooth, low pitch', gender: 'Male' },
  { id: 'vindemiatrix', label: 'Vindemiatrix — gentle, mid pitch', gender: 'Female' },
  { id: 'zephyr', label: 'Zephyr — bright, mid-high pitch', gender: 'Female' },
  { id: 'zubenelgenubi', label: 'Zubenelgenubi — casual, mid-low pitch', gender: 'Male' },
]
