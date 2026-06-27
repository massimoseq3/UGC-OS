import {
  Bookmark,
  UserRound,
  Eye,
  PenLine,
  Mic,
  Film,
  Package,
  FileText,
  Shield,
  ImagePlay,
} from 'lucide-react'
import type { ElementType } from 'react'

// The community this workspace gates access to. Shown to disabled/non-member
// accounts as a link back to join.
export const SKOOL_COMMUNITY_URL = 'https://www.skool.com/ai-ugc-lab-6995'

export type AppCategory = 'library' | 'create' | 'tools' | 'admin'

export interface AppConfig {
  id: string
  name: string
  icon: ElementType
  accent: string
  category: AppCategory
}

export const APP_REGISTRY: AppConfig[] = [
  { id: 'finder', name: 'Bank', icon: Bookmark, accent: '#a1a1aa', category: 'library' },
  { id: 'character-studio', name: 'Influencers', icon: UserRound, accent: '#F74F9E', category: 'create' },
  { id: 'script-architect', name: 'Scripts', icon: PenLine, accent: '#F7821B', category: 'create' },
  { id: 'voice-studio', name: 'Voiceovers', icon: Mic, accent: '#007AFF', category: 'create' },
  { id: 'broll-studio', name: 'B-Roll', icon: Film, accent: '#7165FF', category: 'create' },
  { id: 'playground', name: 'Playground', icon: ImagePlay, accent: '#015C52', category: 'create' },
  { id: 'ad-anatomy', name: 'Ad Analyzer', icon: Eye, accent: '#FF5257', category: 'tools' },
  { id: 'admin', name: 'Admin', icon: Shield, accent: '#fafafa', category: 'admin' },
]

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  library: 'Library',
  create: 'Create',
  tools: 'Tools',
  admin: 'Admin',
}

export type BankType = 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

export const BANK_CONFIG: Record<BankType, { label: string; icon: ElementType; accent: string }> = {
  products: { label: 'Products', icon: Package, accent: '#4C1D95' },
  models: { label: 'Influencers', icon: UserRound, accent: '#F74F9E' },
  scripts: { label: 'Scripts', icon: FileText, accent: '#F7821B' },
  voices: { label: 'Voices', icon: Mic, accent: '#007AFF' },
  brolls: { label: 'B-Rolls', icon: Film, accent: '#7165FF' },
}

export function getAppConfig(appId: string): AppConfig | undefined {
  return APP_REGISTRY.find((a) => a.id === appId)
}
