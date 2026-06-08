import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchParts, fetchCategories, fetchBrands } from '../api/parts'
import api from '../api/client'
import { Search, X, Plus, AlertTriangle, PackagePlus } from 'lucide-react'
import type { Part } from '../types'
import { useT } from '../i18n'
import { useUnit } from '../utils/useUnit'
import { useNavigate } from 'react-router-dom'

interface SelectedItem { part: Part; qty: number; passthrough?: boolean }

interface Props {
  onAdd: (items: SelectedItem[]) => void
  onClose: () => void
  preCarModel?: string
}

export default function PartsPicker({ onAdd, onClose, preCarModel }: Props) {
  const { t } = useT()
  const u = useUnit()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [carModel, setCarModel] = useState('')
  const [filterByWoModel, setFilterByWoModel] = useState(false) // unchecked by default
  const [selected, setSelected] = useState<Map<number, SelectedItem>>(new Map())
  const [scanned, setScanned] = useState<{ name: string; qty: number; unit: string }[]>([])  // scan log
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function handleSearch(val: string) {
    setQ(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDq(val), 300)
  }

  const effectiveModel = filterByWoModel && preCarModel ? preCarModel : (carModel || undefined)

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts-picker', dq, category, brand, effectiveModel],
    queryFn: () => fetchParts(dq || undefined, category || undefined, false, undefined, effectiveModel, brand || undefined),
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: fetchBrands })
  const { data: carModels = [] } = useQuery({
    queryKey: ['car-models-for-stock'],
    queryFn: async () => {
      const res = await api.get('/parts/wo-models-all')
      return res.data as string[]
    },
  })

  function toggle(part: Part, passthrough = false) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(part.id)) {
        next.delete(part.id)
      } else {
        next.set(part.id, { part, qty: part.default_issue_qty ?? 1, passthrough })
      }
      return next
    })
  }

  function setQty(partId: number, qty: number) {
    setSelected(prev => {
      const next = new Map(prev)
      const item = next.get(partId)
      if (item) next.set(partId, { ...item, qty })
      return next
    })
  }

  const [adding, setAdding] = useState(false)

  function handleAdd() {
    if (adding) return
    const items = Array.from(selected.values()).filter(i => i.qty > 0)
    if (items.length === 0) return
    setAdding(true)
    onAdd(items)
    onClose()
  }

  const selectedCount = selected.size

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">{t('parts_picker_add')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 flex gap-2 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              className="input pl-9 text-sm"
              placeholder={t('parts_search')}
              value={q}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={async e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const val = (e.target as HTMLInputElement).value.trim()
                if (!val) return
                // Try exact barcode lookup → immediately add to WO
                try {
                  const { fetchPartByBarcode } = await import('../api/parts')
                  const part = await fetchPartByBarcode(val)
                  const qty = part.default_issue_qty ?? 1
                  // Immediately add via onAdd (non-closing call via addSingle)
                  onAdd([{ part, qty }])
                  // Log in scan history
                  setScanned(prev => [{ name: part.name, qty, unit: part.unit }, ...prev.slice(0, 4)])
                  setQ('')
                  setDq('')
                  setTimeout(() => inputRef.current?.focus(), 50)
                } catch {
                  // Not found → show search results, let user browse
                }
              }}
            />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto text-sm">
            <option value="">{t('stock_all_categories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={brand} onChange={e => setBrand(e.target.value)} className="input w-auto text-sm">
            <option value="">{t('lbl_brand')} —</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {preCarModel ? (
            /* When opened from WO — show a toggle checkbox for WO model */
            <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-sm select-none transition-colors"
              style={{ borderColor: filterByWoModel ? '#3b82f6' : '#e5e7eb', background: filterByWoModel ? '#eff6ff' : '' }}>
              <input
                type="checkbox"
                checked={filterByWoModel}
                onChange={e => setFilterByWoModel(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="font-mono text-blue-700">🏍 {preCarModel}</span>
            </label>
          ) : (
            <select
              value={carModel}
              onChange={e => setCarModel(e.target.value)}
              className={`input w-auto text-sm ${carModel ? 'border-blue-400 bg-blue-50' : ''}`}
            >
              <option value="">{t('filter_all_models_moto')}</option>
              {carModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

        {/* Scan log — shows recently scanned items */}
        {scanned.length > 0 && (
          <div className="px-5 py-2 bg-green-50 border-b border-green-100 flex flex-wrap gap-2">
            {scanned.map((s, i) => (
              <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                ✓ {s.name} {s.qty} {u(s.unit)}
              </span>
            ))}
          </div>
        )}

        {/* Parts list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">{t('rec_loading')}</div>
          ) : parts.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <div className="text-gray-400">{t('parts_no_parts')}</div>
              <button
                onClick={() => {
                  onClose()
                  navigate('/parts/new', {
                    state: {
                      returnTo: window.location.pathname,
                      prefill: { name: dq }
                    }
                  })
                }}
                className="flex items-center gap-2 mx-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                <PackagePlus className="w-4 h-4" />
                Создать новую запчасть в каталоге
              </button>
              <p className="text-xs text-gray-400">
                Откроется карточка — заполнишь производителя, штрихкод, категорию.<br/>
                После сохранения вернёшься в ЗН и сможешь добавить её.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="table-th w-8" />
                  <th className="table-th">{t('lbl_name')}</th>
                  <th className="table-th hidden sm:table-cell">{t('lbl_brand')}</th>
                  <th className="table-th text-right">{t('lbl_in_stock')}</th>
                  <th className="table-th text-right w-28">{t('lbl_quantity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parts.map(p => {
                  const isSelected = selected.has(p.id)
                  const item = selected.get(p.id)
                  // Flag fluids without explicit default_issue_qty
                  const isFluid = p.unit !== 'шт' && p.unit !== 'pcs' && p.unit !== 'шт.'
                  const warn = isSelected && isFluid && !p.default_issue_qty
                  return (
                    <tr
                      key={p.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(p)}
                    >
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(p, item?.passthrough)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="table-td">
                        <div className="font-medium text-sm text-gray-900 line-clamp-1">{p.name}</div>
                        {p.barcodes[0] && (
                          <span className="text-xs font-mono text-blue-600">▌{p.barcodes[0].barcode}</span>
                        )}
                      </td>
                      <td className="table-td hidden sm:table-cell text-xs text-gray-500">{p.brand || '—'}</td>
                      <td className="table-td text-right">
                        <span className={`text-sm font-semibold ${p.stock_qty <= 0 ? 'text-red-500' : 'text-gray-700'}`}>
                          {p.stock_qty} {u(p.unit)}
                        </span>
                        {/* Passthrough button for zero-stock parts */}
                        {p.stock_qty <= 0 && !isSelected && (
                          <div className="mt-0.5">
                            <button type="button"
                              onClick={e => { e.stopPropagation(); toggle(p, true) }}
                              className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded hover:bg-orange-200 font-medium">
                              🔄 проходная
                            </button>
                          </div>
                        )}
                        {isSelected && item?.passthrough && (
                          <div className="mt-0.5 text-xs text-orange-600 font-medium">🔄 проходная</div>
                        )}
                      </td>
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0.001"
                              step={p.default_issue_qty ?? (isFluid ? 0.05 : 1)}
                              className={`input text-right w-20 text-sm font-semibold ${warn ? 'border-orange-400 bg-orange-50' : 'border-blue-300 bg-blue-50'}`}
                              value={item?.qty ?? 1}
                              onClick={e => (e.target as HTMLInputElement).select()}
                              onChange={e => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v) && v > 0) setQty(p.id, v)
                              }}
                            />
                            {warn && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-sm text-gray-500">
            {selectedCount > 0
              ? `${t('lbl_selected')}: ${selectedCount} ${t('lbl_positions')}`
              : scanned.length > 0
                ? `✓ Добавлено: ${scanned.length}`
                : t('parts_picker_hint')}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>{t('btn_cancel')}</button>
            {selectedCount > 0 && (
              <button className="btn-primary" disabled={adding} onClick={handleAdd}>
                <Plus className="w-4 h-4" /> {t('parts_picker_add')} ({selectedCount})
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
