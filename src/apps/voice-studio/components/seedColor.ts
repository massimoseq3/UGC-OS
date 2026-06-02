// Deterministic gradient seed — keeps a voice's avatar color stable across
// mounts. Lives in its own module (not VoicePickerView) so that component
// file only exports components — keeps React Fast Refresh working, and lets
// the other voice views share the same palette without importing the picker.
export function seedColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const hues = [220, 260, 290, 330, 0, 25, 90, 150, 175, 200]
  const a = hues[Math.abs(hash) % hues.length]
  const b = hues[Math.abs(hash >> 4) % hues.length]
  return `linear-gradient(135deg, hsl(${a} 70% 60%), hsl(${b} 65% 45%))`
}
