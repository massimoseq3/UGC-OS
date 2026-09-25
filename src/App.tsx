import { lazy, Suspense, use, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AppLogo from './components/AppLogo'
import AppBackground from './components/AppBackground'

import Dock from './components/Dock'
import MenuBar from './components/MenuBar'
import { MeetTheTeam, MountOnce } from './components/LazyOverlays'
import AnnouncementsHost from './components/announcements/AnnouncementsHost'
import ToastContainer from './components/Toast'
import AuthGate from './components/auth/AuthGate'
import RouterSync from './components/RouterSync'
import AppErrorBoundary from './components/AppErrorBoundary'
import UpdateNotice from './components/UpdateNotice'
import RecordingControl from './components/RecordingControl'
import { useAppUpdateCheck } from './hooks/useAppUpdateCheck'
import { useAppStore } from './stores/appStore'
import { useChromeHidden } from './stores/chromeStore'
import { useChromeAutoHide } from './hooks/useChromeAutoHide'
import { useAuthStore } from './stores/authStore'
import { isAppVisible, useAppVisibilityStore } from './stores/appVisibilityStore'
import { dockOrderedApps, getAppConfig } from './utils/constants'
import { DEFAULT_SLUG, getAppIdForSlug, getSlugFromPath } from './utils/routing'
import { startAppUsageTracking, stopAppUsageTracking } from './utils/appUsageTracker'
import { useErrorInboxWatch } from './stores/errorInboxStore'
import { hasApp, loadApp, loadMeetTheTeam, loadSettingsModal, preloadApp, warmChunks } from './appChunks'
import { hasFlowRunsToResume, resumeFlowRuns } from './apps/flow/resumeBoot'
import { captureShareLink, takeShareLink } from './apps/flow/share'
import { localBanksReady } from './stores/bankStore'

// Apps are code-split: each chunk loads on first activation, not at startup
// (appChunks.ts holds the imports). They stay mounted after first open (see
// runningApps below), so switching back to an already-opened app is instant.

// Read at startup, before AuthGate has decided anything: the app in the URL is
// the one the workspace opens first, and its chunk used to be requested only
// once the workspace rendered — which, signed in, is after the session check
// AND the cloud hydrate. Asking now overlaps the download with both. A path
// that isn't an app is headed for the Dashboard (RouterSync redirects it);
// the legal pages render no workspace at all.
const bootSlug = getSlugFromPath(window.location.pathname)
// A member's template link has to be read before RouterSync rewrites it.
captureShareLink()
// The public template page (/t/<slug>) renders no workspace either.
if (bootSlug !== 'legal' && bootSlug !== 't') {
  preloadApp(getAppIdForSlug(bootSlug) ?? getAppIdForSlug(DEFAULT_SLUG) ?? '')
  // A first visit opens Meet Your Team over it, so that screen is on the
  // critical path too.
  if (useAppStore.getState().teamIntroOpen) loadMeetTheTeam().catch(() => {})
}

// Only ever reached from a footer link, so never worth a byte of the startup
// bundle.
const TermsOfService = lazy(() => import('./legal/TermsOfService'))
const PrivacyPolicy = lazy(() => import('./legal/PrivacyPolicy'))
const AcceptableUsePolicy = lazy(() => import('./legal/AcceptableUsePolicy'))
const DMCAPolicy = lazy(() => import('./legal/DMCAPolicy'))
const TemplatePage = lazy(() => import('./apps/flow/public/TemplatePage'))

// `use()` rather than `React.lazy`: an app whose chunk was warmed (hover
// intent, the idle warm-up, the startup preload above) renders on the spot.
// `lazy()` suspends once even for code that's already in memory, and React
// holds a revealed fallback for up to 300ms, so every first open used to show
// the placeholder below whether the chunk was here or not.
function AppPaneContent({ appId }: { appId: string }) {
  return <LoadedApp component={use(loadApp(appId))} />
}

// Handed over as a prop because it IS a stable component — one module's
// default export, behind one cached promise per app — which the
// static-components lint can't see through a `use()` call.
function LoadedApp({ component: App }: { component: React.ComponentType }) {
  return <App />
}

function AppPlaceholder({ appId }: { appId: string }) {
  const config = getAppConfig(appId)
  if (!config) return null
  const Icon = config.icon

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Icon className="h-10 w-10 text-ink-600" strokeWidth={1.5} />
      <span className="text-sm font-medium tracking-tight text-ink-600">
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
        <h1 className="text-2xl font-bold tracking-tight text-ink-100">
          UGC OS
        </h1>
        <p className="text-sm text-ink-500">
          Pick a tool from the dock to get started.
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
        <Route path="/legal/terms" element={<Suspense fallback={null}><TermsOfService /></Suspense>} />
        <Route path="/legal/privacy" element={<Suspense fallback={null}><PrivacyPolicy /></Suspense>} />
        <Route path="/legal/aup" element={<Suspense fallback={null}><AcceptableUsePolicy /></Suspense>} />
        <Route path="/legal/dmca" element={<Suspense fallback={null}><DMCAPolicy /></Suspense>} />
        {/* A Flow template's public page — the link a YouTube description
            carries, readable before anyone signs in. */}
        <Route path="/t/:slug" element={<Suspense fallback={null}><TemplatePage /></Suspense>} />
        <Route
          path="*"
          element={
            <AuthGate>
              <RouterSync />
              <Workspace />
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
  const userId = useAuthStore((s) => s.user?.id)
  const teamIntroOpen = useAppStore((s) => s.teamIntroOpen)
  // Phone only: scrolling down inside an app rolls the DOCK away and hands the
  // pane its ~98px. The menu bar stays — see the pane's own note below.
  const chromeHidden = useChromeHidden()
  useChromeAutoHide()
  // Notices a deploy that landed under this tab, so a member finds out from a
  // pill rather than from an app that won't open. See useAppUpdateCheck.
  useAppUpdateCheck()

  // Per-app attention tracking runs for the life of the workspace. The `key`
  // below already remounts this on a user change, so start/stop lands exactly
  // on the session boundary — and stop DISCARDS its buffer on purpose, so one
  // member's minutes can't land in the next member's ledger on a shared
  // browser (see appUsageTracker).
  useEffect(() => {
    startAppUsageTracking()
    return stopAppUsageTracking
  }, [])

  // Admin only: checks for newly reported errors in the background, so the
  // dock's Settings tile can dot when something breaks for a member. Inert for
  // everyone else.
  useErrorInboxWatch()

  // Once the landing app has settled, fetch the rest in dock order while the
  // page is idle, so the first press of each tile opens the app rather than
  // its placeholder. Admin is left out (members never open it, and the
  // operator lands there by URL); so is an app the member has switched off.
  useEffect(() => warmChunks([
    ...dockOrderedApps()
      .filter((app) => isAppVisible(app.id))
      .map((app) => () => loadApp(app.id)),
    loadSettingsModal,
  ]), [])

  // A Flow run the last page load left going resumes from here, whichever app
  // this one lands on — kie finished what was already submitted, and the
  // polls pick those results up rather than paying for them again. After the
  // landing app has settled, and once the banks the run reads are loaded.
  useEffect(() => {
    if (!isAppVisible('flow') || !hasFlowRunsToResume()) return
    let live = true
    const timer = setTimeout(() => {
      void localBanksReady.then(() => { if (live) resumeFlowRuns() })
    }, 2_500)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  // A member's template link (/flow/t/<slug>, captured at startup) opens that
  // template's setup once the workspace is in — after the sign-in screen, if
  // the link was what brought them to it.
  useEffect(() => {
    const link = takeShareLink()
    if (!link) return
    // Flow is in private beta: for a member the link opens nothing, and the
    // switch it turned on at startup goes back the way it was.
    if (!isAppVisible('flow')) {
      if (link.switchedOn) useAppVisibilityStore.getState().setOptionalEnabled('flow', false)
      useAppStore.getState().addToast("That link opens a Flow template, and Flow isn't open to members yet.", 'info')
      return
    }
    if (link.switchedOn) useAppStore.getState().addToast('Flow is on now. Switch it off any time in Settings → Experimental.', 'info')
    useAppStore.getState().sendToApp({ targetApp: 'flow', targetField: 'openTemplate', data: { slug: link.slug } })
  }, [])

  return (
    // h-dvh (not h-screen): 100vh overflows behind mobile browser URL bars,
    // which would push the dock half off-screen on iOS Safari.
    <div key={userId ?? 'local'} className="relative h-dvh w-screen overflow-hidden text-ink antialiased bg-surface-0">
      {/* Universal Background Gradient */}
      <AppBackground />

      <div className="relative z-10 h-full w-full">
        <MenuBar />
        <Dock />

        {/* The workspace pane. It was a macOS-style floating "window" — a
            rounded, bordered, translucent frame with the desktop gradient
            peeking around it — until August 2026, when the frame came off:
            it fills the space between the menu bar and the dock flush now, so
            every app gets the full width and nothing draws a box around them.
            Keep `overflow-hidden` (app chrome still clips to the pane) and the
            bottom inset (the dock floats over that strip; content underneath
            it would be unreachable). NO `backdrop-blur` here, deliberately:
            a `backdrop-filter` element is a backdrop root, and a repaint
            ANYWHERE inside it invalidates the whole backdrop. This pane
            contains the entire workspace, so every animating pixel in every
            app — a dozen generating tiles during a B-Roll batch especially —
            dragged a full-viewport filter recompute behind it. That surfaced
            as laggy generation animations, laggy zoom (a zoom re-rasters
            everything, the backdrop included), and images going blocky, since
            a browser under that much compositing pressure drops its raster
            scale. Glass belongs on small, static chrome over real content
            (B-Roll's pinned storyboard strips), not on a full-window
            container.

            Only the BOTTOM inset is phone-aware: when the dock rolls away on
            a scroll (useChromeAutoHide) the pane claims its 98px. The top
            stays at `top-9` in every state, deliberately. It used to go to
            `top-0` and take the menu bar's 36px too — but the menu bar doesn't
            move, it's opaque and it's `fixed`, so what the app actually gained
            was 36px UNDERNEATH it: every app's first row slid out of sight,
            which on a two-pane app is the Setup/Storyboard tabs and on Outliers
            is the platform tabs. Scrolling a list is not a reason to cover the
            navigation, and 36px was never worth it.

            Deliberately NOT transitioned — `bottom` is layout, so animating it
            relayouts the entire app on every frame, and a storyboard's worth of
            cards can't pay that for 300ms. The dock slides; the pane simply
            grows underneath it, which is invisible because content is laid out
            from the top.

            The inset is the DOCK'S OWN expression, not a flat number: the dock
            is `fixed bottom-0` with `pb-[max(env(safe-area-inset-bottom),
            0.5rem)]`, so its height is ~90px of nav plus whichever of those two
            wins. In a browser tab `env(safe-area-inset-bottom)` is 0 — the
            browser's own bar owns that strip — so the 8px floor wins and this
            is 98px. INSTALLED to the home screen it
            isn't: `viewport-fit=cover` plus no browser bar means the page runs
            to the physical bottom edge and the inset reports the ~34px the home
            indicator sits in, so the dock stands 22px taller than a flat 108
            reserves and covered the bottom of every pinned Generate button.
            Both halves derive from the same numbers now, so they can't drift.
            Even with the dock rolled away the safe area is still held back —
            it's the strip the home indicator lives in, and content under it is
            content you can't reliably touch. */}
        <div
          className={`absolute inset-x-0 top-9 overflow-hidden md:bottom-[calc(90px+max(env(safe-area-inset-bottom),0.5rem))] ${
            chromeHidden ? 'bottom-[env(safe-area-inset-bottom)]' : 'bottom-[calc(90px+max(env(safe-area-inset-bottom),0.5rem))]'
          }`}
        >
          {/* Empty state — visible when no app is active */}
          <div
            className={`absolute inset-0 ${
              activeApp ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
            }`}
          >
            <EmptyState />
          </div>

          {/* Running apps */}
          {runningApps.map((appId) => {
            const isActive = activeApp === appId
            return (
              // data-app-pane is what index.css hangs the "stop painting"
              // rule off. An app stays MOUNTED after its first open (running
              // generations, in-flight polls and unsaved input all have to
              // survive a dock switch) — but opacity-0 does not stop a single
              // frame of work: CSS animations keep ticking, and the Dashboard
              // is the default landing app, so whatever its wallpaper is doing
              // was doing it behind every other screen for the whole session.
              <div
                key={appId}
                data-app-pane={isActive ? 'active' : 'inactive'}
                className={`absolute inset-0 ${
                  isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                {/* The app fills the pane exactly — ONE scroll container, the
                    app's own. A `min-h-[600px]` layout floor lived here for a
                    while so a very short window (200% browser zoom) scrolled the
                    app rather than crushing its scrolling middle. It cost more
                    than it bought: below the floor the pane became a SECOND
                    scroller wrapping the whole app, so every panel header and
                    pinned strip — B-Roll's Storyboard/History toggle and its
                    "N Scenes" batch bar especially — slid up the screen as the
                    member scrolled the storyboard. A bar that is `sticky` inside
                    the panel can't hold its ground against a scroller ABOVE the
                    panel, and the two ports rubber-band against each other in
                    between. Pinned chrome that actually stays pinned is worth
                    more than a graceful 450px viewport. */}
                <div className="h-full overflow-y-auto bg-transparent">
                  {hasApp(appId) ? (
                    // Per PANE, not around the whole workspace: the error this
                    // catches is nearly always a lazy chunk that a deploy
                    // renamed, and one app failing to load is no reason to
                    // unmount the ones already open with work in them.
                    <AppErrorBoundary>
                      <Suspense fallback={<AppPlaceholder appId={appId} />}>
                        <AppPaneContent appId={appId} />
                      </Suspense>
                    </AppErrorBoundary>
                  ) : (
                    <AppPlaceholder appId={appId} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <UpdateNotice />
        <RecordingControl />
        <ToastContainer />
        <MountOnce when={teamIntroOpen}>
          <MeetTheTeam />
        </MountOnce>
        <AnnouncementsHost />
      </div>
    </div>
  )
}
