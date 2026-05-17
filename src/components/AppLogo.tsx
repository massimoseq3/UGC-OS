// App brand mark — the user-supplied portrait illustration in public/logo.png.
// Single asset, used for the menu bar, the empty workspace, and the auth
// screen. The image is already a finished black-and-white composition with
// its own oval frame, so we render it bare (no extra tile / gradient).

interface AppLogoProps {
  className?: string
}

export default function AppLogo({ className = 'h-10 w-10' }: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="UGC OS"
      className={`shrink-0 object-contain ${className}`}
    />
  )
}
