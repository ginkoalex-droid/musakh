import { useEffect } from 'react'

type ShortcutMap = {
  insert?: () => void
  f9?: () => void
  ctrlEnter?: () => void
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't fire when typing in inputs/textareas (except Ctrl+Enter)
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      if (e.key === 'Insert' && !isInput) {
        e.preventDefault()
        shortcuts.insert?.()
        return
      }

      if (e.key === 'F9' && !isInput) {
        e.preventDefault()
        shortcuts.f9?.()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        shortcuts.ctrlEnter?.()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
