import { useCallback } from 'react'
import DesktopFolder from './DesktopFolder'
import { useBankStore } from '../stores/bankStore'
import { useAppStore } from '../stores/appStore'
import { BANK_CONFIG, type BankType } from '../utils/constants'

export default function Desktop() {
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const openApp = useAppStore((s) => s.openApp)

  const handleFolderDoubleClick = useCallback(
    (bankType: BankType) => {
      sendToApp({
        targetApp: 'finder',
        targetField: 'activeBank',
        data: bankType,
      })
      openApp('finder')
    },
    [sendToApp, openApp],
  )

  const counts: Record<BankType, number> = {
    products: products.length,
    models: models.length,
    scripts: scripts.length,
    voices: voices.length,
    brolls: brolls.length,
  }

  const bankTypes: BankType[] = ['products', 'models', 'scripts', 'voices', 'brolls']

  return (
    <div className="absolute inset-0 pt-12 lg:pt-9 pb-16 lg:pb-20 overflow-hidden">
      {/* Wallpaper background */}
      <div className="absolute inset-0">
        <img
          src="/ai-shortcuts-0-ai-lab.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      {/* Folder grid — upper left, macOS style */}
      <div className="relative grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-2 gap-4 lg:gap-2 p-4 lg:p-8 pt-6 lg:pt-10 w-full lg:w-fit justify-items-center lg:justify-items-start">
        {bankTypes.map((bankType) => (
          <DesktopFolder
            key={bankType}
            icon={BANK_CONFIG[bankType].icon}
            label={BANK_CONFIG[bankType].label}
            count={counts[bankType]}
            bankType={bankType}
            onDoubleClick={handleFolderDoubleClick}
          />
        ))}
      </div>
    </div>
  )
}
