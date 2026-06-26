// Auto-generates a plausible first name when saving an influencer to the bank,
// so the inline save flow can prefill a real-sounding name the user can edit.
// Pool is keyed off the profile's gender; falls back to a unisex pool.

const FEMALE_NAMES = [
  'Ava', 'Olivia', 'Mia', 'Sophia', 'Isabella', 'Emma', 'Amelia', 'Harper',
  'Evelyn', 'Charlotte', 'Lily', 'Chloe', 'Zoe', 'Ella', 'Maya', 'Aria',
  'Nora', 'Luna', 'Hazel', 'Ivy', 'Stella', 'Aurora', 'Violet', 'Penelope',
  'Ruby', 'Sadie', 'Camila', 'Layla', 'Naomi', 'Sienna', 'Willow', 'Riley',
  'Quinn', 'Eloise', 'Iris', 'Juniper', 'Maeve', 'Nova', 'Sage', 'Wren',
]
const MALE_NAMES = [
  'Liam', 'Noah', 'Oliver', 'Elijah', 'Lucas', 'Mason', 'Logan', 'Ethan',
  'James', 'Aiden', 'Jack', 'Levi', 'Benjamin', 'Henry', 'Sebastian', 'Owen',
  'Daniel', 'Caleb', 'Wyatt', 'Julian', 'Leo', 'Hudson', 'Theo', 'Nathan',
  'Isaac', 'Asher', 'Eli', 'Carter', 'Miles', 'Felix', 'Silas', 'Atlas',
  'Kai', 'Jude', 'Ezra', 'August', 'Beckett', 'Rowan', 'Finn', 'Arlo',
]
const UNISEX_NAMES = [
  'Riley', 'Quinn', 'Avery', 'Rowan', 'Sage', 'River', 'Sky', 'Reese',
  'Phoenix', 'Wren', 'Blake', 'Cameron', 'Drew', 'Ellis', 'Finley', 'Hayden',
  'Jordan', 'Kai', 'Lennon', 'Morgan', 'Nico', 'Parker', 'Remy', 'Sasha',
  'Tatum', 'Wesley', 'Charlie', 'Emerson', 'Frankie', 'Indigo',
]

export function pickInfluencerName(gender?: string): string {
  const g = (gender || '').toLowerCase()
  const pool =
    g.startsWith('f') || g.includes('woman') ? FEMALE_NAMES :
    g.startsWith('m') && !g.startsWith('mx') ? MALE_NAMES :
    UNISEX_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}
