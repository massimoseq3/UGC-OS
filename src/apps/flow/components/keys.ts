// Key names as the member's own keyboard prints them: ⌘ on a Mac, Ctrl
// everywhere else. The right-click menu and the shortcuts sheet both show
// them, so a shortcut is learned by using the menu.

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
export const MOD = MAC ? '⌘' : 'Ctrl+'
export const SHIFT_MOD = MAC ? '⇧⌘' : 'Ctrl+Shift+'
export const DELETE_KEY = MAC ? '⌫' : 'Del'
