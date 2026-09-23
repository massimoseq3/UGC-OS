import { lazy, Suspense, useState, type ReactNode } from 'react'
import { loadApiKeyGuide, loadMeetTheTeam, loadSettingsModal } from '../appChunks'

// The shell's overlays, each its own chunk — see appChunks for why. Import
// these rather than the modules themselves: one static import from anywhere in
// the shell pulls the whole screen back into the startup bundle.
export const SettingsModal = lazy(loadSettingsModal)
export const ApiKeyGuide = lazy(loadApiKeyGuide)
export const MeetTheTeam = lazy(loadMeetTheTeam)

/**
 * Mounts its overlay the first time `when` is true and KEEPS it mounted after,
 * which is exactly what the eager import did — so an overlay that keeps state
 * between opens (Settings' storage figures, Meet Your Team's half-typed key)
 * still has it. Until then nothing renders and nothing is fetched. The
 * fallback is nothing, not a spinner: the chunk is small and usually already
 * warmed, and a spinner flashing over the page for a frame reads as a glitch.
 */
export function MountOnce({ when, children }: { when: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(when)
  if (when && !mounted) setMounted(true)
  if (!mounted) return null
  return <Suspense fallback={null}>{children}</Suspense>
}
