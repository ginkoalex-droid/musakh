import { useState, useRef, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { fetchParts, fetchPartByBarcode } from '../api/parts'
import type { Part } from '../types'

interface Props {
  onSelect: (part: Part) => void
  placeholder?: string
  autoFocus?: boolean
}

export default function PartSearch({ onSelect, placeholder = 'Поиск...', autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Always keep focus on this input so scanner goes here
  useEffect(() => {
    if (autoFocus !== false) {
      inputRef.current?.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function handleChange(val: string) {
    setQuery(val)
    clearTimeout(timer.current)
    if (!val.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const parts = await fetchParts(val)
        setResults(parts)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      // Try barcode first (scanner fast path)
      try {
        const part = await fetchPartByBarcode(query.trim())
        select(part)
      } catch {
        if (results.length === 1) {
          select(results[0])
        }
      }
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  function select(part: Part) {
    onSelect(part)
    setQuery('')
    setOpen(false)
    setResults([])
    // Refocus so next scan goes here immediately
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="input pl-9"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(p) }}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-sm text-gray-900">{p.name}</div>
              <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
                {p.brand && <span>{p.brand}</span>}
                {p.category && <span>{p.category}</span>}
                {p.oem_numbers[0] && <span className="font-mono">{p.oem_numbers[0].oem_number}</span>}
                <span className={p.stock_qty <= p.min_stock ? 'text-red-500 font-medium' : 'text-green-600'}>
                  {p.stock_qty} {p.unit}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length > 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30">
          <div className="px-4 py-3 text-sm text-gray-500">Ничего не найдено</div>
        </div>
      )}
    </div>
  )
}
