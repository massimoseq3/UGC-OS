import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AppLogo from './components/AppLogo'

import MenuBar from './components/MenuBar'
import Sidebar from './components/Sidebar'
import ToastContainer from './components/Toast'
import AuthGate from './components/auth/AuthGate'
import RouterSync from './components/RouterSync'
import CookieBanner from './components/CookieBanner'
import LegalAcceptModal from './components/LegalAcceptModal'
import { useAppStore } from './stores/appStore'
import { useAuthStore } from './stores/authStore'
import { getAppConfig } from './utils/constants'

// Apps are code-split: each chunk loads on first activation, not at startup.
// They stay mounted after first open (see runningApps below), so switching
// back to an already-opened app is instant.
const Finder = lazy(() => import('./apps/finder/Finder'))
const AdAnatomy = lazy(() => import('./apps/ad-anatomy/AdAnatomy'))
const ScriptArchitect = lazy(() => import('./apps/script-architect/ScriptArchitect'))
const CharacterStudio = lazy(() => import('./apps/character-studio/CharacterStudio'))
const VoiceStudio = lazy(() => import('./apps/voice-studio/VoiceStudio'))
const BrollStudio = lazy(() => import('./apps/broll-studio/BrollStudio'))
const Playground = lazy(() => import('./apps/playground/Playground'))
const AdminPanel = lazy(() => import('./apps/admin/AdminPanel'))

import TermsOfService from './legal/TermsOfService'
import PrivacyPolicy from './legal/PrivacyPolicy'
import AcceptableUsePolicy from './legal/AcceptableUsePolicy'
import DMCAPolicy from './legal/DMCAPolicy'

const APP_COMPONENTS: Record<string, React.ComponentType> = {
  'finder': Finder,
  'ad-anatomy': AdAnatomy,
  'script-architect': ScriptArchitect,
  'character-studio': CharacterStudio,
  'voice-studio': VoiceStudio,
  'broll-studio': BrollStudio,
  'playground': Playground,
  'admin': AdminPanel,
}

function AppPlaceholder({ appId }: { appId: string }) {
  const config = getAppConfig(appId)
  if (!config) return null
  const Icon = config.icon

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Icon className="h-10 w-10 text-zinc-600" strokeWidth={1.5} />
      <span className="text-sm font-medium tracking-tight text-zinc-600">
        {config.name}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <AppLogo className="h-12 w-12" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          UGC OS
        </h1>
        <p className="text-sm text-zinc-500">
          Pick a tool from the sidebar to get started.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Legal pages render outside AuthGate so signed-out visitors can read */}
        <Route path="/legal/terms" element={<TermsOfService />} />
        <Route path="/legal/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal/aup" element={<AcceptableUsePolicy />} />
        <Route path="/legal/dmca" element={<DMCAPolicy />} />
        <Route
          path="*"
          element={
            <AuthGate>
              <RouterSync />
              <Workspace />
              <CookieBanner />
              <LegalAcceptModal />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

function Workspace() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const userId = useAuthStore((s) => s.user?.id)

  // Below lg the sidebar is an overlay drawer, so content reaches the left edge.
  // Above lg it sits in a fixed gutter (collapsed = 80px, expanded = 224px).
  const contentPadding = collapsed ? 'md:pl-20' : 'md:pl-56'

  return (
    <div key={userId ?? 'local'} className="relative h-screen w-screen overflow-hidden text-white antialiased bg-[#050505]">
      {/* Universal Background Gradient */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_0%_0%,#1f1f22_0%,#09090b_45%,#000000_100%)] pointer-events-none" />

      <div className="relative z-10 h-full w-full">
        <MenuBar />
        <Sidebar />

        {/* Empty state — visible when no app is active */}
        <div
          className={`absolute inset-0 pt-14 ${contentPadding} transition-[padding] duration-200 ease-out ${
            activeApp ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
          }`}
        >
          <EmptyState />
        </div>

        {/* Running apps */}
        {runningApps.map((appId) => {
          const Component = APP_COMPONENTS[appId]
          const isActive = activeApp === appId
          return (
            <div
              key={appId}
              className={`absolute inset-0 pt-14 ${contentPadding} transition-[padding] duration-200 ease-out ${
                isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <div className="h-full overflow-y-auto bg-transparent">
                {Component ? (
                  <Suspense fallback={<AppPlaceholder appId={appId} />}>
                    <Component />
                  </Suspense>
                ) : (
                  <AppPlaceholder appId={appId} />
                )}
              </div>
            </div>
          )
        })}

        <ToastContainer />
      </div>
    </div>
  )
}
