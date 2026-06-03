import { useState, useRef, useEffect } from 'react'
import { useUnit } from '../utils/useUnit'
import { Search, Plus } from 'lucide-react'
import { fetchParts, fetchPartByBarcode } from '../api/parts'
import { useNavigate } from 'react-router-dom'
import type { Part } from '../types'

interface Props {
  onSelect: (part: Part) => void
  placeholder?: string
  autoFocus?: boolean
}

export default function PartSearch({ onSelect, placeholder = 'Поиск...', autoFocus }: Props) {
  const u = useUnit()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const processing = useRef(false) // lock against double Enter/scan
  const navigate = useNavigate()

  // Calculate position for fixed dropdown (avoids overflow:hidden clipping)
  function updateDropdownPos() {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxH = 288 // max-h-72
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const top = spaceBelow >= maxH
      ? rect.bottom + 4           // open downward
      : rect.top - maxH - 4       // flip upward if no space
    setDropdownPos({ top, left: rect.left, width: rect.width })
  }

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


  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (processing.current) return // block double scan
      // Read directly from DOM — React state may lag behind fast scanner input
      const val = ((e.target as HTMLInputElement).value || query).trim()
      if (!val) return
      processing.current = true
      setTimeout(() => { processing.current = false }, 600)
      updateDropdownPos()

      // Sync state if DOM is ahead
      if (val !== query) setQuery(val)

      try {
        const part = await fetchPartByBarcode(val)
        setUnknownBarcode(null)
        select(part)
      } catch {
        // by-barcode failed — try search as fallback
        let found = results
        if (found.length === 0) {
          // Results may not be ready yet (debounce) — search synchronously
          try {
            found = await fetchParts(val)
          } catch {}
        }
        // Exact barcode match first
        const exact = found.find(p =>
          p.barcodes.some(b => b.barcode === val) ||
          p.oem_numbers.some(o => o.oem_number === val)
        )
        if (exact) {
          setUnknownBarcode(null)
          select(exact)
        } else if (found.length === 1) {
          select(found[0])
        } else if (found.length === 0) {
          setUnknownBarcode(val)
          setOpen(true)
        } else {
          setResults(found)
          setOpen(true)
        }
      }
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setUnknownBarcode(null)
    }
  }

  function select(part: Part) {
    onSelect(part)
    setQuery('')
    setOpen(false)
    setResults([])
    setUnknownBarcode(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleChange(val: string) {
    setQuery(val)
    setUnknownBarcode(null)
    clearTimeout(timer.current)
    if (!val.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    updateDropdownPos()
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
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(p) }}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-sm text-gray-900">{p.name}</div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-0.5">
                {p.brand && <span className="text-gray-600">{p.brand}</span>}
                {p.barcodes[0] && (
                  <span className="font-mono text-blue-600 bg-blue-50 px-1 rounded">
                    ▌{p.barcodes[0].barcode}
                  </span>
                )}
                <span className={`font-medium ${p.stock_qty <= p.min_stock ? 'text-red-500' : 'text-green-600'}`}>
                  {p.stock_qty} {u(p.unit)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length > 1 && !unknownBarcode && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <div className="px-4 py-3 text-sm text-gray-500">Ничего не найдено</div>
        </div>
      )}

      {unknownBarcode && (
        <div
          className="fixed bg-white border border-orange-200 rounded-lg shadow-xl z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <div className="px-4 py-3">
            <div className="text-sm font-medium text-orange-700 mb-2">
              Штрихкод <span className="font-mono bg-orange-50 px-1 rounded">{unknownBarcode}</span> не найден
            </div>
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                navigate(`/parts/new`, { state: { barcode: unknownBarcode, returnTo: window.location.pathname } })
                setQuery('')
                setUnknownBarcode(null)
                setOpen(false)
              }}
              className="btn-primary text-sm w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Создать новую запчасть с этим штрихкодом
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
