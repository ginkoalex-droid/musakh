import { useRef, useEffect, useState } from 'react'
import { ScanLine } from 'lucide-react'

interface Props {
  onScan: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
}

/**
 * Input that detects barcode scanner input (fast key sequence ending with Enter).
 * Scanner typically sends all chars in <100ms total. Manual typing is slower.
 */
export default function BarcodeInput({ onScan, placeholder = 'Сканируй штрихкод или введи вручную', autoFocus }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef<number>(0)
  const buffer = useRef<string>('')

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now()
    const delta = now - lastKeyTime.current
    lastKeyTime.current = now

    if (e.key === 'Enter') {
      const code = buffer.current || value
      if (code.trim()) {
        onScan(code.trim())
        setValue('')
        buffer.current = ''
      }
      e.preventDefault()
      return
    }

    // Scanner sends chars very fast (< 50ms between keys); build separate buffer
    if (delta < 50) {
      buffer.current += e.key
    } else {
      // Reset buffer on slow (manual) input
      buffer.current = ''
    }
  }

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
        <ScanLine className="w-4 h-4" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="input pl-9 font-mono"
      />
    </div>
  )
}
