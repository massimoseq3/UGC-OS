// The small shared bits of a block's face that aren't components — kept out
// of face.tsx, which exports only components (Fast Refresh needs that).

// A label over the member's own picture: literal black and white, like every
// chip on user media. `CHIP_SHAPE` alone for one in its own colour.
export const CHIP_SHAPE = 'absolute flex h-5 max-w-[calc(100%-12px)] items-center gap-1 truncate rounded-full px-2 text-[10.5px] font-medium'
export const CHIP = `${CHIP_SHAPE} bg-black/55 text-white`

export const PLATFORM: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', meta: 'Meta' }

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
