// Monochrome flask brand mark. Color comes from the parent's `text-*` class
// via `currentColor`, so it adapts to dark/light contexts without needing
// variants. Same paths as lucide's FlaskConical, inlined so the favicon
// (public/logo.svg) and the in-app logo render from one definition.

interface AppLogoProps {
  className?: string
  strokeWidth?: number
}

export default function AppLogo({ className = 'h-12 w-12', strokeWidth = 2 }: AppLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </svg>
  )
}
