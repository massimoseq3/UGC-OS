// Robust clipboard write. Tries the async Clipboard API first, then falls back
// to the legacy execCommand path. The fallback must ALSO run when
// navigator.clipboard EXISTS but writeText() rejects — which is exactly what
// happens inside embedded webviews (e.g. the Claude desktop browser) where the
// document lacks clipboard-write permission or focus.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path below.
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
