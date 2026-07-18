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
  LayoutDashboard,
  Scissors,
  Workflow,
} from 'lucide-react'
import type { ElementType } from 'react'

// The community this workspace gates access to. Shown to disabled/non-member
// accounts as a link back to join.
export const SKOOL_COMMUNITY_URL = 'https://www.skool.com/ai-ugc-lab-6995'

// The paid training classroom inside the community — surfaced from the
// Dashboard as the "AI UGC Academy" shortcut.
export const AI_UGC_ACADEMY_URL = 'https://www.skool.com/ai-ugc-lab-6995/classroom/bd64d8bd?md=e629eb69abaf42f5b8d545538f7da046'

// 'system' is the Dashboard's own leading dock group (its divider separates it
// from Bank); admin never renders in the dock.
export type AppCategory = 'library' | 'create' | 'tools' | 'admin' | 'system'

export interface AppConfig {
  id: string
  name: string
  icon: ElementType
  accent: string
  category: AppCategory
}

export const APP_REGISTRY: AppConfig[] = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, accent: '#059669', category: 'system' },
  { id: 'finder', name: 'Bank', icon: Bookmark, accent: '#a1a1aa', category: 'library' },
  // Ad Analyzer sits in the create group (leftmost, no divider vs Characters):
  // analyze a winning ad first, then produce — the dock reads left-to-right.
  { id: 'ad-anatomy', name: 'Ad Analyzer', icon: Eye, accent: '#FF5257', category: 'create' },
  { id: 'character-studio', name: 'Characters', icon: UserRound, accent: '#F74F9E', category: 'create' },
  { id: 'script-architect', name: 'Scripts', icon: PenLine, accent: '#24365A', category: 'create' },
  { id: 'voice-studio', name: 'Voiceovers', icon: Mic, accent: '#007AFF', category: 'create' },
  { id: 'broll-studio', name: 'B-Roll', icon: Film, accent: '#7165FF', category: 'create' },
  { id: 'playground', name: 'Playground', icon: ImagePlay, accent: '#015C52', category: 'create' },
  // Edit closes the create row: everything produced on its left gets cut into
  // a finished ad here (via the downloadable /video-editor Claude skill).
  { id: 'edit-studio', name: 'Edit', icon: Scissors, accent: '#F77646', category: 'create' },
  // Flows gets its own 'tools' group (divider after Edit): the create row
  // makes the pieces, Flows chains them into one runnable pipeline.
  { id: 'flow-studio', name: 'Flows', icon: Workflow, accent: '#D97706', category: 'tools' },
  { id: 'admin', name: 'Admin', icon: Shield, accent: '#fafafa', category: 'admin' },
]

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  library: 'Library',
  create: 'Create',
  tools: 'Tools',
  admin: 'Admin',
  system: 'System',
}

export type BankType = 'products' | 'models' | 'scripts' | 'voices' | 'brolls'

export const BANK_CONFIG: Record<BankType, { label: string; icon: ElementType; accent: string }> = {
  products: { label: 'Products', icon: Package, accent: '#4C1D95' },
  models: { label: 'Characters', icon: UserRound, accent: '#F74F9E' },
  scripts: { label: 'Scripts', icon: FileText, accent: '#24365A' },
  voices: { label: 'Voices', icon: Mic, accent: '#007AFF' },
  brolls: { label: 'B-Rolls', icon: Film, accent: '#7165FF' },
}

export function getAppConfig(appId: string): AppConfig | undefined {
  return APP_REGISTRY.find((a) => a.id === appId)
}
