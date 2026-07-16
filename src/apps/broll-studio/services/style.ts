// Visual style system for B-Roll generations.
//
// The pipeline is UGC-realism-first: the LLM system prompt integrates the
// iPhone realism stack into every scene (rule 5) and realism.ts appends a
// deterministic suffix at request time. A non-default style must override
// BOTH layers or they fight each other — the LLM would write "unedited
// photorealism" prose while the user wants clay. Each style therefore
// carries two strings:
//   brief  — LLM-facing override woven into the scene-writing / enhance /
//            regenerate calls (null for UGC — the system prompt already IS
//            the UGC style)
//   suffix — the deterministic trailer appended at request time in place
//            of the iPhone realism stack
//
// Style is OPTIONAL: no chip selected and no custom text → UGC realism, the
// app's default behaviour. Picking a chip and typing a custom style are
// mutually exclusive (see resolveVideoStyle) — the custom text wins, and the
// UI deselects every chip while it's non-empty.
import { IPHONE_REALISM_SUFFIX } from './realism'

export interface VideoStyleDef {
  id: string
  label: string
  brief: string | null
  suffix: string
}

// Stock chips. Anything else the user wants goes in the custom text box —
// deliberately not an ever-growing chip list.
//
// Note: the prompts describe the LOOK rather than naming a studio. Brand
// names get filtered or ignored by several image models, and a concrete
// description of the aesthetic reproduces it far more reliably.
export const VIDEO_STYLES: VideoStyleDef[] = [
  {
    id: 'ugc',
    label: 'Realistic UGC',
    brief: null,
    suffix: IPHONE_REALISM_SUFFIX,
  },
  {
    id: 'claymation',
    label: 'Claymation',
    brief:
      'handmade stop-motion claymation — plasticine characters and props with visible fingerprints and tool marks, miniature handcrafted sets, characterful stop-motion movement.',
    suffix:
      'Handmade stop-motion claymation style: characters and props sculpted from plasticine with visible fingerprints and tool marks, miniature handcrafted set, gentle stop-motion judder, soft even studio lighting, matte clay textures — everything looks physically sculpted and photographed frame by frame.',
  },
  {
    id: '3d-pixar',
    label: '3D Pixar',
    brief:
      'a high-end 3D animated family feature — stylized characters with expressive oversized eyes, rounded exaggerated proportions, soft subsurface-scattered skin, warm cinematic global illumination, glossy polished render.',
    suffix:
      'High-end 3D animated family-feature style: stylized characters with expressive oversized eyes and rounded exaggerated proportions, soft subsurface-scattered skin, warm cinematic global illumination, richly detailed textures, glossy polished render quality like a frame from a modern animated movie.',
  },
  {
    id: 'anime',
    label: 'Anime',
    brief:
      'modern 2D anime — clean confident line art, cel shading with two-tone shadows, expressive eyes, detailed painted backgrounds.',
    suffix:
      'Modern 2D anime style: clean confident line art, cel shading with two-tone shadows, expressive eyes, detailed painted backgrounds, subtle bloom lighting — a frame from a high-quality anime production.',
  },
  {
    id: 'lego',
    label: 'LEGO stop motion',
    brief:
      'brick-built stop-motion — minifigure characters with printed faces and cylindrical grip hands, every set and prop assembled from glossy plastic bricks with visible studs and seams, snappy tabletop stop-motion movement.',
    suffix:
      'Brick-built stop-motion style: minifigure characters with printed faces, cylindrical grip hands and articulated blocky limbs, every set and prop assembled from glossy plastic bricks with visible studs, seams and moulding marks, miniature tabletop build, snappy stop-motion movement, soft even studio lighting — photographed frame by frame on a real brick set.',
  },
]

// A style resolved for one generation. `brief` null → the LLM keeps its
// built-in UGC rules; `suffix` is always the trailer to append at request time.
export interface ResolvedStyle {
  brief: string | null
  suffix: string
}

const UGC_STYLE: ResolvedStyle = { brief: null, suffix: IPHONE_REALISM_SUFFIX }

/**
 * Resolve the session's style inputs into the two strings the pipeline needs.
 * Precedence: custom text > selected chip > UGC default. Empty/unknown inputs
 * fall back to UGC, so the feature is fully optional.
 */
export function resolveVideoStyle(
  styleId: string | undefined | null,
  customStyle?: string | null,
): ResolvedStyle {
  const custom = customStyle?.trim()
  if (custom) {
    return {
      brief: `${custom.replace(/[.\s]+$/, '')}.`,
      suffix: `Visual style: ${custom.replace(/[.\s]+$/, '')}. Every element of the frame is rendered in this style, consistently across every shot.`,
    }
  }
  const found = VIDEO_STYLES.find((s) => s.id === styleId)
  if (!found) return UGC_STYLE
  return { brief: found.brief, suffix: found.suffix }
}

// The LLM-facing override block for non-UGC styles. Injected into the
// scene-writing, enhance, and regenerate prompts. Explicitly lifts the
// system prompt's UGC-realism and anti-cinematic rules — without that, the
// model keeps writing iPhone prose and flags the style as a "hard failure".
export function buildStyleDirective(
  styleId: string | undefined | null,
  customStyle?: string | null,
): string | null {
  const { brief } = resolveVideoStyle(styleId, customStyle)
  if (!brief) return null
  return `VISUAL STYLE OVERRIDE — this ad is NOT shot as realistic UGC. Render every shot as ${brief} This replaces the UGC realism stack (rule 5): do not describe iPhone cameras, handheld phone footage, or photorealism, and ignore the "cinematic is a failure" rule where it conflicts with this style. Everything else still applies — specificity, product visibility, the dialogue anchor, constant motion, and cross-scene consistency.`
}
