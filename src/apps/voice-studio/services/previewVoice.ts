// Google AI Studio hosts a short, pre-rendered sample for every Gemini TTS
// voice on its public gstatic CDN, keyed by the exact `voice_name` (the same
// names as our VOICES list). We play those directly — instant, free, cached by
// the browser, and needing NO kie.ai call or API key.
//
// This replaces the old approach of synthesising a sample via the real model on
// every click, which cost a credit each time and (post model-swap) was the
// source of the "generating a voiceover just to preview" credit drain.
//
// Playback is via a plain <audio> element (see VoicePickerView), so no CORS is
// required; gstatic serves these public, cache-for-7-days, with byte ranges.

const SAMPLE_BASE = 'https://www.gstatic.com/aistudio/voices/samples'

// voiceName (=== Gemini voice_name === VoiceOption.id) → hosted sample URL.
export function voicePreviewUrl(voiceName: string): string {
  return `${SAMPLE_BASE}/${encodeURIComponent(voiceName)}.wav`
}
