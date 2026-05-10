// App-icon-style brand mark: a white rounded-square tile with a black flask
// glyph inside. Sits well on the dark workspace and on the auth screen.
// Class name controls the outer tile size; the flask scales with it.

interface AppLogoProps {
  className?: string
}

export default function AppLogo({ className = 'h-10 w-10' }: AppLogoProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="black"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Flask is sized to ~58% of the tile so the rounded-square frame
        // breathes around it like a typical app icon.
        className="h-[58%] w-[58%]"
      >
        <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
        <path d="M8.5 2h7" />
        <path d="M7 16h10" />
      </svg>
    </div>
  )
}
