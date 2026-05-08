// Brand logos for the model picker. Paths are from simple-icons.org (CC0).
// Where a clean SVG isn't readily available (e.g. Black Forest Labs), we fall
// back to a tinted letter avatar.

interface ProviderLogoProps {
  provider: string
  size?: 'sm' | 'md'
}

const SIZE_CLASS: Record<NonNullable<ProviderLogoProps['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
}

const ICON_PADDING: Record<NonNullable<ProviderLogoProps['size']>, string> = {
  sm: 'p-1',
  md: 'p-1.5',
}

interface LogoEntry {
  bg: string
  fg: string
  // viewBox + path of the brand mark, simple-icons style.
  viewBox?: string
  path?: string
  // Optional rendered SVG for multicolor or composite logos.
  svg?: () => React.ReactNode
}

const GoogleSvg = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
)

const PROVIDERS: Record<string, LogoEntry> = {
  Google: {
    bg: 'bg-white/[0.04]',
    fg: '',
    svg: GoogleSvg,
  },
  OpenAI: {
    bg: 'bg-white/[0.04]',
    fg: 'text-zinc-100',
    viewBox: '0 0 24 24',
    path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4069-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  Anthropic: {
    bg: 'bg-white/[0.04]',
    fg: 'text-orange-300',
    viewBox: '0 0 24 24',
    path: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
  },
  ByteDance: {
    bg: 'bg-white/[0.04]',
    fg: 'text-zinc-100',
    viewBox: '0 0 24 24',
    path: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zm-1.05 4.2h2.1v2.1h-2.1V8.7zm0 4.2h2.1v2.1h-2.1v-2.1zM6.75 8.7h2.1v2.1h-2.1V8.7zm0 4.2h2.1v2.1h-2.1v-2.1zm8.4-4.2h2.1v2.1h-2.1V8.7zm0 4.2h2.1v2.1h-2.1v-2.1z',
  },
  ElevenLabs: {
    bg: 'bg-white/[0.04]',
    fg: 'text-zinc-100',
    viewBox: '0 0 24 24',
    path: 'M7.4 4h2.4v16H7.4V4zm6.8 0h2.4v16h-2.4V4z',
  },
  'Black Forest Labs': {
    bg: 'bg-white/[0.04]',
    fg: 'text-amber-200',
    viewBox: '0 0 24 24',
    path: 'M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.3 6.6 3.7L12 11.7 5.4 8 12 4.3zM5 9.7l6 3.4v7.4l-6-3.3V9.7zm14 0v7.5l-6 3.3v-7.4l6-3.4z',
  },
  Kuaishou: {
    bg: 'bg-white/[0.04]',
    fg: 'text-fuchsia-300',
    viewBox: '0 0 24 24',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 5.7L15 12l-5.5 3.3V8.7z',
  },
}

function FallbackLetter({ provider, size }: { provider: string; size: NonNullable<ProviderLogoProps['size']> }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-md bg-zinc-800/60 font-semibold text-zinc-300 ${SIZE_CLASS[size]} ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'}`}>
      {provider.charAt(0).toUpperCase()}
    </div>
  )
}

export default function ProviderLogo({ provider, size = 'md' }: ProviderLogoProps) {
  const entry = PROVIDERS[provider]
  if (!entry) return <FallbackLetter provider={provider} size={size} />

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-md ${entry.bg} ${SIZE_CLASS[size]} ${ICON_PADDING[size]}`}>
      {entry.svg ? (
        entry.svg()
      ) : (
        <svg viewBox={entry.viewBox} className={`h-full w-full ${entry.fg}`} fill="currentColor" aria-hidden>
          <path d={entry.path} />
        </svg>
      )}
    </div>
  )
}
