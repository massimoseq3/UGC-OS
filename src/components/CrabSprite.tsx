// Pixel-art crab mascot, one costume per app — the "team member" avatars for
// the Meet the Team screen. Drawn as unit rects on a 16×12 grid so it stays
// crisp at any size (shape-rendering: crispEdges). The base crab is identical
// across variants; only the costume rects differ, so the crew reads as one
// mascot with seven jobs.

export type CrabVariant =
  | 'plain'
  | 'finder'
  | 'character-studio'
  | 'script-architect'
  | 'voice-studio'
  | 'broll-studio'
  | 'playground'
  | 'ad-anatomy'
  | 'kie'

interface Px {
  x: number
  y: number
  w: number
  h: number
  fill: string
}

const CRAB = '#D97757'
const DARK = '#1F1B17'
const GOLD = '#F2B231'

// Body rows y=4..9, eyes y=5, arms y=5..6, legs y=10..11. Rows 0..3 are
// reserved headroom for hats.
function baseRects(body: string): Px[] {
  return [
    { x: 4, y: 4, w: 8, h: 6, fill: body }, // body
    { x: 2, y: 6, w: 2, h: 1, fill: body }, // left arm
    { x: 1, y: 5, w: 1, h: 2, fill: body }, // left claw
    { x: 12, y: 6, w: 2, h: 1, fill: body }, // right arm
    { x: 14, y: 5, w: 1, h: 2, fill: body }, // right claw
    { x: 4, y: 10, w: 1, h: 2, fill: body }, // legs
    { x: 6, y: 10, w: 1, h: 2, fill: body },
    { x: 9, y: 10, w: 1, h: 2, fill: body },
    { x: 11, y: 10, w: 1, h: 2, fill: body },
    { x: 6, y: 5, w: 1, h: 1, fill: DARK }, // eyes — costumes may overdraw these (shades)
    { x: 9, y: 5, w: 1, h: 1, fill: DARK },
  ]
}

// Costume rects render after the base, so they may overlap it (visor brims,
// headphone cups) and simply paint over the crab.
const COSTUMES: Record<CrabVariant, Px[]> = {
  plain: [],

  // Studio Manager — classic bank-teller green visor.
  finder: [
    { x: 2, y: 4, w: 12, h: 1, fill: '#3F9142' }, // brim
    { x: 4, y: 3, w: 8, h: 1, fill: '#2F6B33' }, // band
  ],

  // Casting Director — wraparound shades with a pink glint.
  'character-studio': [
    { x: 4, y: 5, w: 8, h: 1, fill: DARK },
    { x: 5, y: 5, w: 1, h: 1, fill: '#F74F9E' },
  ],

  // Copywriter — pencil tucked over the ear.
  'script-architect': [
    { x: 8, y: 3, w: 4, h: 1, fill: '#E8A33D' }, // shaft
    { x: 12, y: 3, w: 1, h: 1, fill: DARK }, // tip
    { x: 7, y: 3, w: 1, h: 1, fill: '#F27D98' }, // eraser
  ],

  // Voice Talent — headphones, cups in a deep Voiceovers blue. Cups and cap
  // sit outside the body silhouette, so they must be darker than their app's
  // accent or they vanish into the dock tile on hover.
  'voice-studio': [
    { x: 4, y: 2, w: 8, h: 1, fill: DARK }, // band
    { x: 3, y: 3, w: 1, h: 2, fill: DARK },
    { x: 12, y: 3, w: 1, h: 2, fill: DARK },
    { x: 3, y: 5, w: 1, h: 2, fill: '#0553BE' }, // cups
    { x: 12, y: 5, w: 1, h: 2, fill: '#0553BE' },
  ],

  // Videographer — backwards cap in a deep B-Roll indigo (see cups note).
  'broll-studio': [
    { x: 4, y: 2, w: 8, h: 1, fill: '#4E42DE' },
    { x: 4, y: 3, w: 8, h: 1, fill: '#4034C4' },
    { x: 12, y: 3, w: 3, h: 1, fill: '#4034C4' }, // bill, worn backwards
  ],

  // Creative Director — tilted beret + paint on the shell. The beret is teal
  // (not the classic black) so it stays visible on dark surfaces; the splats
  // are mixed colors because paint sells "creative" better than any hat.
  playground: [
    { x: 3, y: 2, w: 7, h: 1, fill: '#1FA08C' },
    { x: 4, y: 1, w: 5, h: 1, fill: '#1FA08C' },
    { x: 6, y: 0, w: 1, h: 1, fill: '#1FA08C' }, // stem
    { x: 8, y: 8, w: 1, h: 1, fill: '#F74F9E' }, // paint splats
    { x: 10, y: 7, w: 1, h: 1, fill: '#FFD84D' },
  ],

  // Strategist — magnifying glass held over the right eye.
  'ad-anatomy': [
    { x: 8, y: 4, w: 3, h: 1, fill: '#FF5257' }, // lens ring
    { x: 8, y: 6, w: 3, h: 1, fill: '#FF5257' },
    { x: 8, y: 5, w: 1, h: 1, fill: '#FF5257' },
    { x: 10, y: 5, w: 1, h: 1, fill: '#FF5257' },
    { x: 11, y: 7, w: 1, h: 1, fill: DARK }, // handle
    { x: 12, y: 8, w: 1, h: 1, fill: DARK },
  ],

  // kie.ai — the power source. Golden body (set in CrabSprite below) with
  // sun rays and a little lightning bolt on the shell.
  kie: [
    { x: 7, y: 0, w: 2, h: 1, fill: '#FFD84D' }, // rays
    { x: 3, y: 1, w: 1, h: 1, fill: '#FFD84D' },
    { x: 12, y: 1, w: 1, h: 1, fill: '#FFD84D' },
    { x: 0, y: 3, w: 1, h: 1, fill: '#FFD84D' },
    { x: 15, y: 3, w: 1, h: 1, fill: '#FFD84D' },
    { x: 8, y: 6, w: 1, h: 1, fill: '#C9821B' }, // bolt
    { x: 7, y: 7, w: 1, h: 1, fill: '#C9821B' },
    { x: 8, y: 8, w: 1, h: 1, fill: '#C9821B' },
  ],
}

export default function CrabSprite({
  variant = 'plain',
  body,
  className,
}: {
  variant?: CrabVariant
  // Body color override — the dock passes beige (#F8F8F4) so the crab reads
  // on saturated accent tiles; the default coral is for pale surfaces.
  body?: string
  className?: string
}) {
  const bodyFill = body ?? (variant === 'kie' ? GOLD : CRAB)
  return (
    <svg
      viewBox="0 0 16 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {[...baseRects(bodyFill), ...COSTUMES[variant]].map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
      ))}
    </svg>
  )
}
