import {
  Library,
  UserRound,
  Eye,
  PenLine,
  Mic,
  Film,
  Video,
  Package,
  FileText,
  FolderOpen,
} from 'lucide-react'
import type { ElementType } from 'react'

export type AppCategory = 'library' | 'create' | 'tools'

export interface AppConfig {
  id: string
  name: string
  icon: ElementType
  accent: string
  category: AppCategory
}

export const APP_REGISTRY: AppConfig[] = [
  { id: 'finder', name: 'Bank', icon: Library, accent: '#a1a1aa', category: 'library' },
  { id: 'character-studio', name: 'Characters', icon: UserRound, accent: '#0ea5e9', category: 'create' },
  { id: 'script-architect', name: 'Scripts', icon: PenLine, accent: '#3b82f6', category: 'create' },
  { id: 'voice-studio', name: 'Voiceovers', icon: Mic, accent: '#6366f1', category: 'create' },
  { id: 'broll-studio', name: 'B-Roll Images', icon: Film, accent: '#f97316', category: 'create' },
  { id: 'video-studio', name: 'B-Roll Videos', icon: Video, accent: '#a855f7', category: 'create' },
  { id: 'ad-anatomy', name: 'Ad Analyzer', icon: Eye, accent: '#FB2B37', category: 'tools' },
]

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  library: 'Library',
  create: 'Create',
  tools: 'Tools',
}

export type BankType = 'projects' | 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

export const BANK_CONFIG: Record<BankType, { label: string; icon: ElementType; accent: string }> = {
  projects: { label: 'Projects', icon: FolderOpen, accent: '#10b981' },
  products: { label: 'Products', icon: Package, accent: '#f59e0b' },
  models: { label: 'Characters', icon: UserRound, accent: '#0ea5e9' },
  scripts: { label: 'Scripts', icon: FileText, accent: '#3b82f6' },
  voices: { label: 'Voices', icon: Mic, accent: '#6366f1' },
  brolls: { label: 'B-Rolls', icon: Film, accent: '#f97316' },
}

export function getAppConfig(appId: string): AppConfig | undefined {
  return APP_REGISTRY.find((a) => a.id === appId)
}
