import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'pending' | 'saving' | 'saved'

export function useAutoSave(
  trigger: unknown,   // any value change triggers the timer
  onSave: () => Promise<void>,
  enabled: boolean,
  delay = 10000,
) {
  const [status, setStatus] = useState<Status>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const saving = useRef(false)

  useEffect(() => {
    if (!enabled) return
    clearTimeout(timer.current)
    setStatus('pending')
    timer.current = setTimeout(async () => {
      if (saving.current) return
      saving.current = true
      setStatus('saving')
      try {
        await onSave()
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('idle')
      } finally {
        saving.current = false
      }
    }, delay)
    return () => clearTimeout(timer.current)
  }, [trigger, enabled])

  return status
}
