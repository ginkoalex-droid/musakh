import { useState, useRef, useEffect } from 'react'
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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

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
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      // Try barcode first (scanner fast path)
      try {
        const part = await fetchPartByBarcode(query.trim())
        setUnknownBarcode(null)
        select(part)
      } catch {
        if (results.length === 1) {
          select(results[0])
        } else if (results.length === 0) {
          // Unknown barcode - offer to create new part
          setUnknownBarcode(query.trim())
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
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
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
                {p.oem_numbers[0] && (
                  <span className="font-mono bg-gray-100 px-1 rounded">{p.oem_numbers[0].oem_number}</span>
                )}
                {p.barcodes[0] && (
                  <span className="font-mono text-blue-600 bg-blue-50 px-1 rounded">
                    ▌{p.barcodes[0].barcode}
                  </span>
                )}
                <span className={`font-medium ${p.stock_qty <= p.min_stock ? 'text-red-500' : 'text-green-600'}`}>
                  {p.stock_qty} {p.unit}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length > 1 && !unknownBarcode && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30">
          <div className="px-4 py-3 text-sm text-gray-500">Ничего не найдено</div>
        </div>
      )}

      {unknownBarcode && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-orange-200 rounded-lg shadow-lg z-30">
          <div className="px-4 py-3">
            <div className="text-sm font-medium text-orange-700 mb-2">
              Штрихкод <span className="font-mono bg-orange-50 px-1 rounded">{unknownBarcode}</span> не найден
            </div>
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                navigate(`/parts/new`, { state: { barcode: unknownBarcode } })
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
