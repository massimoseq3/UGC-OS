// Single-color smiley brand mark. Color comes from the parent's `text-*`
// class via `currentColor`, so it adapts to dark/light contexts without
// needing variants.

interface SmileyLogoProps {
  className?: string
  strokeWidth?: number
}

export default function SmileyLogo({ className = 'h-12 w-12', strokeWidth = 2.8 }: SmileyLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="13" r="2.4" fill="currentColor" />
      <circle cx="21" cy="13" r="2.4" fill="currentColor" />
      <path d="M 8.5 19 Q 16 26 23.5 19" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}
