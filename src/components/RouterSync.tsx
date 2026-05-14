import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import {
  DEFAULT_SLUG,
  getAppIdForSlug,
  getSlugForAppId,
  getSlugFromPath,
} from '../utils/routing'

// Mirrors `activeApp` ↔ URL in both directions. Renders nothing.
// Mount once inside <BrowserRouter>.
//
// Each direction reads its counterpart fresh (store.getState() / window.location)
// instead of via closure, so neither effect re-fires when the other side changes
// — otherwise sidebar clicks would race the URL sync and revert themselves.
export default function RouterSync() {
  const activeApp = useAppStore((s) => s.activeApp)
  const openApp = useAppStore((s) => s.openApp)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const location = useLocation()
  const navigate = useNavigate()

  // URL → store. Runs only when the path changes.
  useEffect(() => {
    const slug = getSlugFromPath(location.pathname)
    const targetAppId = slug ? getAppIdForSlug(slug) : null

    if (!targetAppId) {
      navigate(`/${DEFAULT_SLUG}`, { replace: true })
      return
    }

    if (targetAppId === 'admin' && !isAdmin) {
      navigate(`/${DEFAULT_SLUG}`, { replace: true })
      return
    }

    if (useAppStore.getState().activeApp !== targetAppId) {
      openApp(targetAppId)
    }
  }, [location.pathname, isAdmin, openApp, navigate])

  // store → URL. Runs only when activeApp changes.
  useEffect(() => {
    const targetSlug = getSlugForAppId(activeApp)
    if (!targetSlug) return
    if (window.location.pathname !== `/${targetSlug}`) {
      navigate(`/${targetSlug}`)
    }
  }, [activeApp, navigate])

  return null
}
