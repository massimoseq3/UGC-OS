import type { ReactNode } from 'react'

// The get-started checklist for connecting a kie.ai key — one short line each.
// Shared source of truth so the Meet-your-team intro and the ApiKeyGuide modal
// (menu bar alert + Dashboard connect row) always show the same three steps.
export const API_KEY_STEPS: ReactNode[] = [
  <>
    Grab your API key at{' '}
    <a
      href="https://kie.ai/api-key"
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
    >
      kie.ai
    </a>
  </>,
  <>Paste it in Settings (the gear in the dock) and Save</>,
  <>
    Top up anytime via{' '}
    <a
      href="https://kie.ai/billing"
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
    >
      Get Credits
    </a>{' '}
    in the menu bar
  </>,
]
