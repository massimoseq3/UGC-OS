import {
  FolderOpen,
  UserRound,
  ScanSearch,
  Eye,
  PenLine,
  Mic,
  Film,
  Video,
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
  { id: 'character-studio', name: 'Generate Characters', icon: UserRound, accent: '#0ea5e9' },
  { id: 'image-dna', name: 'Extract Visual DNA', icon: ScanSearch, accent: '#22c55e' },
  { id: 'ad-anatomy', name: 'Analyze Ads', icon: Eye, accent: '#FB2B37' },
  { id: 'script-architect', name: 'Generate Scripts', icon: PenLine, accent: '#3b82f6' },
  { id: 'voice-studio', name: 'Generate Voiceovers', icon: Mic, accent: '#6366f1' },
  { id: 'broll-studio', name: 'Generate B-Roll', icon: Film, accent: '#f97316' },
  { id: 'video-studio', name: 'Generate Videos', icon: Video, accent: '#a855f7' },
]

export const FINDER_APP = APP_REGISTRY[0]
export const DOCK_APPS = APP_REGISTRY

export type BankType = 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

export const BANK_CONFIG: Record<BankType, { label: string; icon: ElementType; accent: string }> = {
  products: { label: 'Products', icon: Package, accent: '#f59e0b' },
  models: { label: 'Models', icon: UserRound, accent: '#0ea5e9' },
  scripts: { label: 'Scripts', icon: FileText, accent: '#3b82f6' },
  voices: { label: 'Voices', icon: Mic, accent: '#6366f1' },
  brolls: { label: 'B-Rolls', icon: Film, accent: '#f97316' },
}

export function getAppConfig(appId: string): AppConfig | undefined {
  return APP_REGISTRY.find((a) => a.id === appId)
}
