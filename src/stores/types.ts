export interface Product {
  id: string
  productImage: string
  productName: string
  productDescription: string
  targetMarket: string
  painPoints: string
  usps: string
  benefits: string
  offer: string
  cta: string
  createdAt: number
}

export interface Model {
  id: string
  characterImage: string
  jsonProfile: Record<string, unknown> | null
  name: string
  notes: string
  source: 'character-studio' | 'image-dna-extractor' | 'manual-import'
  createdAt: number
}

export interface Script {
  id: string
  title: string
  scriptText: string
  linkedProductId: string
  source: 'script-architect' | 'manual'
  createdAt: number
}

export interface VoicePreset {
  id: string
  label: string
  voiceName: string
  gender: 'Female' | 'Male'
  styleInstructions: string
  creativity: number
  ambience: 'Studio' | 'Small Room'
  linkedModelId: string
  createdAt: number
}

export interface BRollVideo {
  url: string
  aspectRatio: string
  createdAt: number
}

export interface BRoll {
  id: string
  imageUrl: string
  prompt: string
  productId?: string
  modelId?: string
  scriptId?: string
  videoUrl?: string
  videos?: BRollVideo[]
  createdAt: number
}

export interface VoiceHistoryItem {
  id: string
  voiceName: string
  gender: 'Female' | 'Male'
  ambience: 'Studio' | 'Small Room'
  creativity: number
  styleInstructions: string
  scriptText: string
  scriptPreview: string
  audioUrl: string
  duration: number
  createdAt: number
}

export interface InterAppPayload {
  targetApp: string
  targetField: string
  data: unknown
}
