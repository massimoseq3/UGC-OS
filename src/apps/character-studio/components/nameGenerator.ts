// Auto-generates a plausible first name when saving an influencer to the bank,
// so the inline save flow can prefill a real-sounding name the user can edit.
// Pool is keyed off the profile's gender; falls back to a unisex pool.
//
// The pools are deliberately broad, mainstream names that read as ANY
// ethnicity — a name is picked before anyone looks at the face, so one that
// signals a particular background mislabels the character it lands on. Keep
// additions in that spirit, and keep the pools large: a small pool is why saved
// characters kept colliding ("Mia", "Mia 2", "Mia 3").

const FEMALE_NAMES = [
  'Abigail', 'Ada', 'Addison', 'Adeline', 'Adrienne', 'Alana', 'Alexa',
  'Alexandra', 'Alice', 'Alicia', 'Alison', 'Allison', 'Alyssa', 'Amanda',
  'Amber', 'Amelia', 'Amy', 'Andrea', 'Angela', 'Anna', 'Annabelle', 'Anne',
  'Annie', 'April', 'Aria', 'Ariana', 'Ashley', 'Aubrey', 'Audrey', 'Aurora',
  'Autumn', 'Ava', 'Bailey', 'Beatrice', 'Bella', 'Beth', 'Bethany', 'Bianca',
  'Brianna', 'Bridget', 'Brooke', 'Brooklyn', 'Caitlin', 'Callie', 'Camille',
  'Candice', 'Carly', 'Caroline', 'Carolyn', 'Cassandra', 'Cassidy',
  'Catherine', 'Cecilia', 'Celeste', 'Charlotte', 'Chelsea', 'Chloe',
  'Christina', 'Claire', 'Clara', 'Claudia', 'Colette', 'Cora', 'Courtney',
  'Daisy', 'Dana', 'Danielle', 'Daphne', 'Delaney', 'Delilah', 'Diana', 'Eden',
  'Eleanor', 'Elena', 'Eliana', 'Elise', 'Eliza', 'Elizabeth', 'Ella', 'Ellie',
  'Eloise', 'Elsie', 'Emery', 'Emily', 'Emma', 'Erica', 'Erin', 'Esther',
  'Eva', 'Evelyn', 'Everly', 'Faith', 'Felicity', 'Fiona', 'Florence', 'Freya',
  'Gabriella', 'Gabrielle', 'Genevieve', 'Georgia', 'Grace', 'Gracie', 'Greta',
  'Gwen', 'Hailey', 'Hallie', 'Hannah', 'Harlow', 'Harper', 'Hazel', 'Heather',
  'Helen', 'Holly', 'Hope', 'Iris', 'Isabel', 'Isabella', 'Isla', 'Ivy',
  'Jacqueline', 'Jade', 'Jane', 'Jasmine', 'Jenna', 'Jennifer', 'Jessica',
  'Jillian', 'Joanna', 'Josephine', 'Josie', 'Joy', 'Julia', 'Juliana',
  'Julie', 'Juliet', 'June', 'Juniper', 'Kaitlyn', 'Kara', 'Karen', 'Kate',
  'Katherine', 'Kathryn', 'Katie', 'Kayla', 'Kelly', 'Kelsey', 'Kendall',
  'Kimberly', 'Kira', 'Kylie', 'Lana', 'Laura', 'Lauren', 'Layla', 'Leah',
  'Leila', 'Lena', 'Lila', 'Lillian', 'Lily', 'Lindsay', 'Lisa', 'Liv', 'Lola',
  'Lucia', 'Lucy', 'Luna', 'Lydia', 'Mabel', 'Mackenzie', 'Madeline',
  'Madison', 'Maeve', 'Maggie', 'Mallory', 'Margaret', 'Margot', 'Maria',
  'Marissa', 'Marlowe', 'Mary', 'Maya', 'Megan', 'Melanie', 'Melissa', 'Mia',
  'Michelle', 'Mila', 'Miranda', 'Molly', 'Monica', 'Nadia', 'Nadine', 'Naomi',
  'Natalie', 'Nicole', 'Nina', 'Noelle', 'Nora', 'Nova', 'Olive', 'Olivia',
  'Paige', 'Paula', 'Penelope', 'Piper', 'Poppy', 'Rachel', 'Rebecca',
  'Rosalie', 'Rose', 'Rosie', 'Ruby', 'Ruth', 'Sabrina', 'Sadie', 'Samantha',
  'Sara', 'Sarah', 'Savannah', 'Scarlett', 'Serena', 'Shannon', 'Sienna',
  'Sloane', 'Sofia', 'Sophia', 'Sophie', 'Stella', 'Stephanie', 'Summer',
  'Sydney', 'Talia', 'Tara', 'Tessa', 'Thea', 'Tiffany', 'Valerie', 'Vanessa',
  'Vera', 'Victoria', 'Violet', 'Vivian', 'Whitney', 'Willow', 'Zoe',
]
const MALE_NAMES = [
  'Aaron', 'Adam', 'Adrian', 'Aidan', 'Alan', 'Alec', 'Alex', 'Alexander',
  'Andrew', 'Anthony', 'Arlo', 'Arthur', 'Asher', 'Ashton', 'Atlas', 'August',
  'Austin', 'Barrett', 'Beau', 'Beckett', 'Ben', 'Benjamin', 'Bennett',
  'Blake', 'Bradley', 'Brady', 'Brandon', 'Brendan', 'Brett', 'Brian', 'Brody',
  'Brooks', 'Bryce', 'Caleb', 'Calvin', 'Camden', 'Carl', 'Carson', 'Carter',
  'Chase', 'Chris', 'Christian', 'Christopher', 'Clark', 'Clay', 'Cody',
  'Colby', 'Cole', 'Colin', 'Connor', 'Cooper', 'Corey', 'Dalton', 'Damon',
  'Daniel', 'David', 'Dawson', 'Dean', 'Declan', 'Dennis', 'Derek', 'Desmond',
  'Dominic', 'Duncan', 'Dustin', 'Dylan', 'Easton', 'Edward', 'Edwin', 'Eli',
  'Elias', 'Elijah', 'Elliot', 'Emmett', 'Eric', 'Ethan', 'Evan', 'Everett',
  'Ezra', 'Felix', 'Finn', 'Fletcher', 'Ford', 'Francis', 'Frank', 'Gabriel',
  'Garrett', 'Gavin', 'George', 'Gideon', 'Gordon', 'Graham', 'Grant',
  'Grayson', 'Gregory', 'Griffin', 'Hank', 'Harrison', 'Harry', 'Harvey',
  'Hayes', 'Heath', 'Henry', 'Holden', 'Hudson', 'Hugo', 'Hunter', 'Ian',
  'Isaac', 'Jack', 'Jackson', 'Jacob', 'Jake', 'James', 'Jared', 'Jason',
  'Jasper', 'Jay', 'Jeffrey', 'Jeremy', 'Jesse', 'Joel', 'John', 'Jonah',
  'Jonas', 'Jonathan', 'Jordan', 'Joseph', 'Joshua', 'Jude', 'Julian',
  'Justin', 'Keegan', 'Kellan', 'Kevin', 'Kieran', 'Kyle', 'Lance', 'Landon',
  'Lawrence', 'Leo', 'Leon', 'Leonard', 'Levi', 'Liam', 'Lincoln', 'Logan',
  'Louis', 'Luca', 'Lucas', 'Luke', 'Malcolm', 'Marcus', 'Mark', 'Martin',
  'Mason', 'Matthew', 'Max', 'Maxwell', 'Micah', 'Michael', 'Miles', 'Milo',
  'Mitchell', 'Nash', 'Nate', 'Nathan', 'Nathaniel', 'Neil', 'Nicholas',
  'Nico', 'Noah', 'Nolan', 'Oliver', 'Oscar', 'Owen', 'Patrick', 'Paul',
  'Paxton', 'Peter', 'Philip', 'Pierce', 'Porter', 'Preston', 'Quentin',
  'Raymond', 'Reed', 'Rhett', 'Rhys', 'Richard', 'Robert', 'Roman', 'Ronan',
  'Ross', 'Russell', 'Ryan', 'Rylan', 'Samuel', 'Scott', 'Sean', 'Sebastian',
  'Seth', 'Shane', 'Silas', 'Simon', 'Spencer', 'Stephen', 'Sterling',
  'Steven', 'Sullivan', 'Tanner', 'Tate', 'Theo', 'Theodore', 'Thomas',
  'Timothy', 'Tobias', 'Todd', 'Tony', 'Travis', 'Trent', 'Trevor', 'Tristan',
  'Troy', 'Tucker', 'Tyler', 'Victor', 'Vincent', 'Wade', 'Walker', 'Warren',
  'Wayne', 'Wesley', 'Weston', 'Will', 'William', 'Wyatt', 'Xavier', 'Zach',
  'Zachary', 'Zane',
]
const UNISEX_NAMES = [
  'Addison', 'Alex', 'Avery', 'Bailey', 'Blair', 'Blake', 'Cameron',
  'Campbell', 'Casey', 'Charlie', 'Dakota', 'Dallas', 'Drew', 'Eden', 'Ellis',
  'Emerson', 'Finley', 'Frankie', 'Gray', 'Harley', 'Hayden', 'Jamie',
  'Jordan', 'Jules', 'Kai', 'Kendall', 'Lane', 'Logan', 'Marley', 'Morgan',
  'Noel', 'Parker', 'Peyton', 'Quinn', 'Reese', 'Riley', 'River', 'Robin',
  'Rory', 'Rowan', 'Ryan', 'Sage', 'Sam', 'Sawyer', 'Shawn', 'Skyler',
  'Spencer', 'Sydney', 'Tatum', 'Taylor', 'Toby', 'Wren',
]

// Deterministic string hash — lets a lineage that isn't saved to the bank yet
// get the SAME suggested name everywhere it's offered (the edit modal and the
// main gallery), so its variants still read as one character.
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// `taken` is the Bank's current names: the pick walks forward from its seeded
// start to the first name nobody has, so a new character gets a fresh name
// instead of "Mia 2". Only once the whole pool is used does it repeat (and the
// caller's uniqueBankName numbers it). Same seed + same Bank → same name, so
// the gallery and the edit modal still agree.
export function pickInfluencerName(gender?: string, seed?: string, taken?: Iterable<string>): string {
  const g = (gender || '').toLowerCase()
  const pool =
    g.startsWith('f') || g.includes('woman') ? FEMALE_NAMES :
    g.startsWith('m') && !g.startsWith('mx') ? MALE_NAMES :
    UNISEX_NAMES
  const start = seed ? hashSeed(seed) % pool.length : Math.floor(Math.random() * pool.length)
  const used = new Set<string>()
  // Exact names only: an unsaved character's own sheet ("Mia - Character
  // Sheet") may already be in the Bank, and it must not push the portrait off
  // "Mia" when that's saved after it.
  for (const n of taken ?? []) used.add(n.trim().toLowerCase())
  for (let k = 0; k < pool.length; k++) {
    const name = pool[(start + k) % pool.length]
    if (!used.has(name.toLowerCase())) return name
  }
  return pool[start]
}

// Strips the suffixes this file adds, so they can never stack: a sheet of a
// sheet stays one "- Character Sheet", and a variant of "Mia 2" is numbered off
// "Mia", not "Mia 2 2". The legacy "Influencer Sheet" wording is stripped too so
// re-sheeting an older entry is clean.
function stripVariantSuffix(name: string): string {
  return name
    .replace(/\s*-\s*(Character|Influencer) Sheet\s*$/i, '')
    .replace(/\s+\d+$/, '')
    .trim()
}

// A character sheet files next to its source portrait — same character name
// with a " - Character Sheet" suffix.
export function sheetNameFrom(baseName: string): string {
  return `${stripVariantSuffix(baseName)} - Character Sheet`
}

// Numbers a name until it's free in the bank ("Mia" → "Mia 2" → "Mia 3"), so
// two variants of the same character can't be offered the same name.
export function uniqueBankName(desired: string, taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const n of taken) used.add(n.trim().toLowerCase())
  if (!used.has(desired.trim().toLowerCase())) return desired
  for (let n = 2; n < 1000; n++) {
    const candidate = `${desired} ${n}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return desired
}

// An edited character files next to the character it was generated FROM: the
// source's name plus whatever makes this one different — the visual style it was
// restyled into ("Mia - Claymation"), else the next free number ("Mia 2").
// Before this, every edit was offered a fresh random name, so one character's
// variants scattered across the bank under unrelated names.
export function variantNameFrom(
  sourceName: string,
  styleLabel: string | undefined,
  taken: Iterable<string>,
): string {
  const base = stripVariantSuffix(sourceName)
  return uniqueBankName(styleLabel ? `${base} - ${styleLabel}` : base, taken)
}
