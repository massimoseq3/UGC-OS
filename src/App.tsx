import MenuBar from './components/MenuBar'
import Desktop from './components/Desktop'
import Dock from './components/Dock'
import ToastContainer from './components/Toast'
import { useAppStore } from './stores/appStore'
import { getAppConfig } from './utils/constants'

import Finder from './apps/finder/Finder'
import AdAnatomy from './apps/ad-anatomy/AdAnatomy'
import ScriptArchitect from './apps/script-architect/ScriptArchitect'
import CharacterStudio from './apps/character-studio/CharacterStudio'
import VoiceStudio from './apps/voice-studio/VoiceStudio'
import BrollStudio from './apps/broll-studio/BrollStudio'
import ImageDna from './apps/image-dna/ImageDna'

const APP_COMPONENTS: Record<string, React.ComponentType> = {
  'finder': Finder,
  'ad-anatomy': AdAnatomy,
  'script-architect': ScriptArchitect,
  'character-studio': CharacterStudio,
  'voice-studio': VoiceStudio,
  'broll-studio': BrollStudio,
  'image-dna': ImageDna,
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

export default function App() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)

  return (
    <div className="relative h-screen w-screen overflow-hidden text-white antialiased bg-[#050505]">
      {/* Universal Background Gradient */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_0%_0%,#1f1f22_0%,#09090b_45%,#000000_100%)] pointer-events-none" />

      <div className="relative z-10 h-full w-full">
        <MenuBar />

        {/* Desktop — visible when no app is active */}
        <div
          className={`transition-opacity duration-200 ease-out ${activeApp ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
            }`}
        >
          <Desktop />
        </div>

        {/* Running apps — rendered for state preservation, only active one visible */}
        {runningApps.map((appId) => {
          const Component = APP_COMPONENTS[appId]
          const isActive = activeApp === appId
          return (
            <div
              key={appId}
              className={`absolute inset-0 pt-12 lg:pt-9 pb-16 lg:pb-20 transition-opacity duration-200 ease-out ${isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
            >
              <div className="h-full overflow-y-auto bg-transparent">
                {Component ? <Component /> : <AppPlaceholder appId={appId} />}
              </div>
            </div>
          )
        })}

        <Dock />
        <ToastContainer />
      </div>
    </div>
  )
}
