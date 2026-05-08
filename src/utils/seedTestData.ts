import { useBankStore } from '../stores/bankStore'
import { buildJsonPrompt } from '../apps/character-studio/services/generateCharacter'
import type { CharacterProfile } from '../apps/character-studio/types'
import type { Product, Model, Script, VoicePreset, BRoll } from '../stores/types'

// ── Test products ──────────────────────────────────────────────────

const TEST_PRODUCTS: Array<Omit<Product, 'id' | 'createdAt'>> = [
  {
    productImage: '',
    productName: 'Glow Serum',
    productDescription: 'A daily vitamin C facial serum that fades dark spots and brightens dull skin.',
    targetMarket: 'Women 25-40 with hyperpigmentation, sun damage, and dull skin',
    painPoints: 'Dark spots from sun exposure, uneven skin tone, dullness from stress and sleep',
    usps: '20% pure L-ascorbic acid, fragrance-free, results visible in 4 weeks',
    benefits: 'Brighter skin, faded dark spots, glassy glow without makeup',
    offer: '20% off your first bottle + free shipping over $50',
    cta: 'Get your bottle today — link in bio',
  },
  {
    productImage: '',
    productName: 'SleepBuds',
    productDescription: 'Wireless sleep earbuds with active noise blocking and a 12-hour battery.',
    targetMarket: 'Light sleepers, shift workers, partners of snorers, frequent travelers',
    painPoints: 'Snoring partner, traffic noise, neighbors, falling asleep on planes',
    usps: 'Tiny enough to sleep on your side, no app needed, USB-C charging',
    benefits: 'Fall asleep faster, stay asleep longer, wake up rested',
    offer: 'Buy 2 get 1 free this week only',
    cta: 'Tap to grab a pair before they sell out',
  },
  {
    productImage: '',
    productName: 'PostureFix',
    productDescription: 'A wearable posture trainer that buzzes when you slouch.',
    targetMarket: 'Desk workers, students, anyone with neck and shoulder pain',
    painPoints: 'Tech neck, rounded shoulders, slouching during long work sessions',
    usps: 'Trains you in 14 days, fits under shirts, 5-day battery',
    benefits: 'Standing taller, less neck pain, more confident posture',
    offer: '30-day money-back guarantee',
    cta: 'Start sitting up straight — order now',
  },
  {
    productImage: '',
    productName: 'PupBites',
    productDescription: 'Single-ingredient salmon dog treats — wild caught, freeze-dried, high-protein.',
    targetMarket: 'Dog owners who care about ingredient quality, especially small-dog parents',
    painPoints: 'Mystery ingredients in pet food, allergies, picky eaters, weight gain',
    usps: 'One ingredient — wild salmon. No fillers, grains, or preservatives.',
    benefits: 'Shinier coats, healthier weight, dogs literally beg for them',
    offer: 'First bag 30% off with code FIRSTPUP30',
    cta: 'Treat your pup — order on the site',
  },
]

// ── Test characters (Models) ──────────────────────────────────────────

function makeProfile(overrides: Partial<CharacterProfile>): CharacterProfile {
  const base: CharacterProfile = {
    gender: '', age: '', ethnicity: '', bodyType: '',
    skinTone: '', skinTexture: '', eyeColor: '', eyeShape: '',
    hairColor: '', hairStyle: '', hairTexture: '',
    facialFeatures: '', facialHair: '', distinguishingMarks: '', makeup: '',
    clothingStyle: '', accessories: '',
    location: '', background: '', lighting: '', weather: '', timeOfDay: '',
    pose: '', action: '', expression: '',
    shotType: '', cameraAngle: '', cameraDevice: '',
    aspectRatio: 'Portrait (9:16)',
  }
  return { ...base, ...overrides }
}

const TEST_CHARACTERS: Array<Omit<Model, 'id' | 'createdAt'>> = [
  {
    name: 'Sarah — Skincare UGC',
    characterImage: '',
    notes: 'Casual influencer in soft natural light, ideal for skincare reviews',
    source: 'character-studio',
    jsonProfile: buildJsonPrompt(makeProfile({
      gender: 'Female', age: '25-30', ethnicity: 'Caucasian', bodyType: 'Slim',
      skinTone: 'Fair', skinTexture: 'Natural pores',
      eyeColor: 'Blue', eyeShape: 'Almond',
      hairColor: 'Blonde', hairStyle: 'Long wavy', hairTexture: 'Wavy',
      facialFeatures: 'Light freckles, soft smile', facialHair: 'None', distinguishingMarks: 'None',
      makeup: 'Dewy skin',
      clothingStyle: 'Casual athleisure', accessories: 'Gold hoops',
      location: 'Bathroom', background: 'Window with natural light',
      lighting: 'Soft natural light', weather: 'Indoor (N/A)', timeOfDay: 'Morning',
      pose: 'Front-on facing camera', action: 'Speaking to camera', expression: 'Genuine smile',
      shotType: 'Close-up face', cameraAngle: 'Eye Level', cameraDevice: 'Phone selfie camera',
    })) as Record<string, unknown>,
  },
  {
    name: 'Marcus — Fitness Reviewer',
    characterImage: '',
    notes: 'Athletic male in kitchen-style background, perfect for supplement and gear reviews',
    source: 'character-studio',
    jsonProfile: buildJsonPrompt(makeProfile({
      gender: 'Male', age: '30-40', ethnicity: 'Black', bodyType: 'Muscular',
      skinTone: 'Brown', skinTexture: 'Glass skin',
      eyeColor: 'Dark brown', eyeShape: 'Almond',
      hairColor: 'Black', hairStyle: 'Buzz cut', hairTexture: 'Coily',
      facialFeatures: 'Sharp jawline', facialHair: 'Short beard', distinguishingMarks: 'None',
      makeup: 'No makeup',
      clothingStyle: 'Gym wear', accessories: 'Watch',
      location: 'Kitchen', background: 'Kitchen counter',
      lighting: 'Natural Window Light', weather: 'Sunny', timeOfDay: 'Morning',
      pose: 'Standing', action: 'Holding product', expression: 'Serious/focused',
      shotType: 'Medium shot (waist up)', cameraAngle: 'Eye Level', cameraDevice: 'Modern smartphone',
    })) as Record<string, unknown>,
  },
  {
    name: 'Emma — British Cafe Aesthetic',
    characterImage: '',
    notes: 'Warm, conversational vibe — works for lifestyle and tech reviews',
    source: 'character-studio',
    jsonProfile: buildJsonPrompt(makeProfile({
      gender: 'Female', age: '20s', ethnicity: 'Caucasian', bodyType: 'Average',
      skinTone: 'Light', skinTexture: 'Freckled',
      eyeColor: 'Green', eyeShape: 'Round',
      hairColor: 'Auburn', hairStyle: 'Curtain Bangs + Layers', hairTexture: 'Wavy',
      facialFeatures: 'High cheekbones', facialHair: 'None', distinguishingMarks: 'Beauty mark',
      makeup: 'Natural/minimal',
      clothingStyle: 'Minimal chic', accessories: 'Necklace',
      location: 'Coffee shop', background: 'Blurred background',
      lighting: 'Golden Hour', weather: 'Overcast', timeOfDay: 'Afternoon',
      pose: 'Sitting', action: 'Speaking to camera', expression: 'Natural smile',
      shotType: 'Medium shot (waist up)', cameraAngle: 'Eye Level', cameraDevice: 'Smartphone, casual UGC aesthetic',
    })) as Record<string, unknown>,
  },
]

// ── Test scripts ──────────────────────────────────────────────────────

const TEST_SCRIPTS: Array<{ title: string; productName: string; scriptText: string }> = [
  {
    title: 'Glow Serum — 30s problem/solution',
    productName: 'Glow Serum',
    scriptText: `[HOOK]
I had dark spots from years of sun damage and nothing was working — until I tried this.

[PROBLEM]
Every morning I'd cover them with foundation. Every night I'd hope a new cream would fade them. None of them did.

[SOLUTION]
Then I started using Glow Serum every morning. 20% vitamin C — the actual concentration that works.

[PROOF]
Four weeks in, my dark spots are visibly lighter. My skin literally glows. No filter.

[CTA]
Use code GLOW20 for 20% off your first bottle. Link in bio.`,
  },
  {
    title: 'SleepBuds — partner snoring hook',
    productName: 'SleepBuds',
    scriptText: `[HOOK]
My husband snores like a freight train and I haven't slept properly in years.

[PROBLEM]
Earplugs gave me ear infections. White noise machines didn't block him out. I was exhausted.

[SOLUTION]
SleepBuds. Tiny wireless earbuds you can sleep on your side with. Active noise blocking — I literally can't hear him.

[PROOF]
First night I slept 8 hours straight. First time in three years.

[CTA]
Buy 2 get 1 free this week. Link's in my bio.`,
  },
  {
    title: 'PostureFix — desk worker UGC',
    productName: 'PostureFix',
    scriptText: `[HOOK]
I've worked at a desk for 10 years and my neck was destroyed.

[PROBLEM]
Constant tension headaches. Tight shoulders. I looked hunched in every photo.

[SOLUTION]
PostureFix sticks to your back and buzzes the moment you slouch. Two weeks of training and now I sit up automatically.

[PROOF]
Headaches gone. Shoulders relaxed. People are telling me I look taller.

[CTA]
30-day money back guarantee. Try it.`,
  },
]

// ── Test voice presets ────────────────────────────────────────────────

const TEST_VOICES: Array<Omit<VoicePreset, 'id' | 'createdAt'>> = [
  {
    label: 'Sarah — chill skincare',
    voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
    voiceName: 'Rachel',
    gender: 'Female',
    stability: 0.55,
    linkedModelId: '',
  },
  {
    label: 'Marcus — confident reviewer',
    voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam
    voiceName: 'Adam',
    gender: 'Male',
    stability: 0.7,
    linkedModelId: '',
  },
  {
    label: 'Emma — warm British',
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2', // Alice
    voiceName: 'Alice',
    gender: 'Female',
    stability: 0.4,
    linkedModelId: '',
  },
]

// ── Test B-rolls ─────────────────────────────────────────────────────

const TEST_BROLLS: Array<Omit<BRoll, 'id' | 'createdAt'>> = [
  {
    imageUrl: '',
    prompt: 'Close-up of a glass dropper of vitamin C serum dripping onto fingertips, soft morning light',
  },
  {
    imageUrl: '',
    prompt: 'Hand setting wireless sleep earbuds into a charging case on a nightstand, warm bedside lamp',
  },
  {
    imageUrl: '',
    prompt: 'Side profile of a person at a standing desk with PostureFix visible on their upper back, daylight office',
  },
]

// ── Seed runner ──────────────────────────────────────────────────────

export interface SeedResult {
  products: number
  characters: number
  scripts: number
  voices: number
  brolls: number
}

export function seedTestData(): SeedResult {
  const store = useBankStore.getState()

  TEST_PRODUCTS.forEach((p) => store.addProduct(p))
  TEST_CHARACTERS.forEach((m) => store.addModel(m))

  // Add scripts after products so we can link them to product IDs.
  const productsAfter = useBankStore.getState().products
  TEST_SCRIPTS.forEach((s) => {
    const linked = productsAfter.find((p) => p.productName === s.productName)
    const script: Omit<Script, 'id' | 'createdAt'> = {
      title: s.title,
      scriptText: s.scriptText,
      linkedProductId: linked?.id ?? '',
      source: 'manual',
    }
    store.addScript(script)
  })

  TEST_VOICES.forEach((v) => store.addVoice(v))
  TEST_BROLLS.forEach((b) => store.addBRoll(b))

  return {
    products: TEST_PRODUCTS.length,
    characters: TEST_CHARACTERS.length,
    scripts: TEST_SCRIPTS.length,
    voices: TEST_VOICES.length,
    brolls: TEST_BROLLS.length,
  }
}
