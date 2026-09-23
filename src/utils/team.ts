import type { CrabVariant } from '../components/CrabSprite'

// One blurb per dock app, shown in the Meet Your Team caption when its tile is
// hovered. The apps carry no persona names or job titles (September 2026,
// Massimo's call); the tile already says the app's name.

export interface TeamMember {
  appId: CrabVariant
  blurb: string
}

export const TEAM: TeamMember[] = [
  {
    appId: 'finder',
    blurb: 'Keeps every product, character, script and clip filed and ready to reuse.',
  },
  {
    appId: 'character-studio',
    blurb: 'Builds consistent characters you can reuse in every ad.',
  },
  {
    appId: 'script-architect',
    blurb: 'Writes and remixes the words that sell, in any length or style.',
  },
  {
    appId: 'voice-studio',
    blurb: 'Reads your script out loud in any of dozens of voices.',
  },
  {
    appId: 'broll-studio',
    blurb: 'Turns scripts into scenes and shoots four takes of every one.',
  },
  {
    appId: 'playground',
    blurb: 'Makes freeform images, video and music on demand.',
  },
  {
    appId: 'edit-studio',
    blurb: 'Cuts your script, voiceover and B-roll into a finished captioned ad.',
  },
  {
    appId: 'flow',
    blurb: 'Wires the whole team into one run, so a single press makes a batch of finished ads.',
  },
  {
    appId: 'discover',
    blurb: 'Finds the ads already winning and files them in your swipe file.',
  },
  {
    appId: 'ad-anatomy',
    blurb: 'Tears down winning ads and tells you exactly why they work.',
  },
]

export function getTeamMember(appId: string): TeamMember | undefined {
  return TEAM.find((m) => m.appId === appId)
}
