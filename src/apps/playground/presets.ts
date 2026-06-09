// UGC ad format presets surfaced by PresetPicker. v1 is video-mode only.
// Thumbnails / preview videos are placeholders — set the URLs to drop in real
// example media. Files belong under /public/presets/ so they ship statically.

// Default aesthetic — iPhone-UGC. Appended to every preset prompt except
// Podcast clip, which uses the cinematic interview trailer below.
export const UGC_STYLE_TRAILER =
  'Modern iPhone camera quality, unedited photorealism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame.'

// Podcast-only trailer — high-end interview-podcast aesthetic. Different on
// purpose: the format reads as cinematic, not raw UGC.
export const PODCAST_STYLE_TRAILER =
  'High-end cinematic interview-podcast aesthetic, professional studio lighting with moody key light and deep shadows, shallow depth of field, large condenser microphones, dark minimalist backdrop, photorealistic, no stylization.'

export interface Preset {
  id: string
  title: string
  description: string
  prompt: string
  defaultAspect?: '9:16' | '16:9' | '1:1'
  defaultDuration?: number
  thumbnailUrl?: string
  previewVideoUrl?: string
}

// 6 cards rendered as a 3×2 grid. Order matters — first row reads
// left-to-right as the most common formats.
export const VIDEO_PRESETS: Preset[] = [
  {
    id: 'street-interview',
    title: 'Street interview',
    description: 'Person on the street with mic, casual reactions.',
    prompt: `A handheld vertical short-form video of a person being interviewed on a busy city sidewalk by someone holding a microphone. The subject reacts with casual, surprised energy as they answer. Background pedestrians blur naturally. ${UGC_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 8,
  },
  {
    id: 'podcast-clip',
    title: 'Podcast clip',
    description: 'Two-person desk + mics, viral podcast moment framing.',
    prompt: `A cinematic vertical short-form clip from a high-end interview podcast. Two people sit across from each other at a dark wooden desk with large condenser microphones, leaning in mid-conversation. One reacts with raised eyebrows and a small laugh. ${PODCAST_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 8,
  },
  {
    id: 'car-rant',
    title: 'Car rant',
    description: 'Selfie in car, confessional energy.',
    prompt: `A handheld vertical short-form selfie video of a person in the driver's seat of a parked car, talking directly to the camera with confessional energy. The phone is held at arm's length on the dashboard side. Natural daylight from the windshield. ${UGC_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 8,
  },
  {
    id: 'mirror-selfie-review',
    title: 'Mirror selfie review',
    description: 'Bathroom mirror, casual handheld product showcase.',
    prompt: `A handheld vertical short-form video shot into a bathroom mirror. A person holds their phone in one hand and the product in the other, casually reviewing it directly to the mirror reflection. Tile and warm bathroom lighting in the background. ${UGC_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 6,
  },
  {
    id: 'product-shot-broll',
    title: 'Product shot b-roll',
    description: 'Handheld iPhone close-up of the product, no talking.',
    prompt: `A handheld vertical short-form b-roll shot of a hand holding and slowly rotating the product in front of a plain, neutral background. The camera moves with subtle handheld energy. No talking, no people in frame except the hand. ${UGC_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 5,
  },
  {
    id: 'live-reaction-unboxing',
    title: 'Live reaction unboxing',
    description: 'Raw first-time-opening reactions.',
    prompt: `A handheld vertical short-form video of a person opening the product packaging for the first time, reacting live with raw, unscripted surprise and delight. They hold the product up toward the camera mid-reaction. Natural indoor lighting. ${UGC_STYLE_TRAILER}`,
    defaultAspect: '9:16',
    defaultDuration: 8,
  },
]

// Image-mode presets. Surfaced only when the Image tab is active — these are
// product-photography recipes, not motion formats, so they don't belong in the
// video list. Attach a reference image first; the prompt treats it as the exact
// product to reproduce.
export const IMAGE_PRESETS: Preset[] = [
  {
    id: 'product-hero-white',
    title: 'Product hero shot',
    description: 'Studio photo on pure white — preserves your reference exactly.',
    prompt: `Using the attached reference image as the exact product, generate a professional studio product photograph of THIS product, preserving its exact shape, proportions, colors, materials, textures, branding, logos, label text, and every visual detail with 100% accuracy. Do not alter, restyle, redesign, or reinterpret the product in any way.

Place the product centered on a seamless pure white (#FFFFFF) background. Use soft, even, diffused studio lighting from above and slightly in front, with a gentle natural soft shadow directly beneath the product to ground it. No harsh shadows, no colored light, no reflections of other objects.

Composition: product perfectly centered, slight three-quarter angle if the product has a clear "front," straight-on if it's symmetrical. Generous negative space around the product. Subject fills roughly 60–70% of the frame.

Style: clean, premium e-commerce hero shot. Photorealistic, ultra-sharp focus across the entire product, true-to-life color, high dynamic range, crisp edges. Shot on a 100mm macro lens, f/8, ISO 100. 8k resolution. 1:1 square aspect ratio.`,
    defaultAspect: '1:1',
  },
]
