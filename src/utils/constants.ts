import {
  FolderOpen,
  UserRound,
  ScanSearch,
  Clapperboard,
  PenLine,
  Mic,
  Film,
  Package,
  FileText,
} from 'lucide-react'
import type { ElementType } from 'react'

export interface AppConfig {
  id: string
  name: string
  icon: ElementType
  accent: string
}

export const APP_REGISTRY: AppConfig[] = [
  { id: 'finder', name: 'Finder', icon: FolderOpen, accent: '#a1a1aa' },
  { id: 'character-studio', name: 'UGC Character Studio', icon: UserRound, accent: '#0ea5e9' },
  { id: 'image-dna', name: 'Image DNA Extractor', icon: ScanSearch, accent: '#22c55e' },
  { id: 'ad-anatomy', name: 'Ad Anatomy Pro', icon: Clapperboard, accent: '#FB2B37' },
  { id: 'script-architect', name: 'Script Architect Pro', icon: PenLine, accent: '#3b82f6' },
  { id: 'voice-studio', name: 'Voice Studio Pro', icon: Mic, accent: '#6366f1' },
  { id: 'broll-studio', name: 'B-Roll Studio Pro', icon: Film, accent: '#f97316' },
]

export const FINDER_APP = APP_REGISTRY[0]
export const DOCK_APPS = APP_REGISTRY

export type BankType = 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

export const BANK_CONFIG: Record<BankType, { label: string; icon: ElementType }> = {
  products: { label: 'Products', icon: Package },
  models: { label: 'Models', icon: UserRound },
  scripts: { label: 'Scripts', icon: FileText },
  voices: { label: 'Voices', icon: Mic },
  brolls: { label: 'B-Rolls', icon: Film },
}

export function getAppConfig(appId: string): AppConfig | undefined {
  return APP_REGISTRY.find((a) => a.id === appId)
}
