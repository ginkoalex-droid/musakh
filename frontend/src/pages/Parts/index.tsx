import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchParts, fetchCategories } from '../../api/parts'
import api from '../../api/client'
import { Plus, Package, Search, Car, Printer, Copy } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../../i18n'
import { useUnit } from '../../utils/useUnit'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import KeyHints from '../../components/KeyHints'

export default function Parts() {
  const { t } = useT()
  const u = useUnit()
  const navigate = useNavigate()
  const location = useLocation()
  const highlightId = (location.state as any)?.highlightId as number | undefined
  const [highlighted, setHighlighted] = useState<number | null>(highlightId ?? null)
  const highlightRef = useRef<HTMLTableRowElement>(null)
  useKeyboardShortcuts({ insert: () => navigate('/parts/new') })

  // Scroll to and briefly highlight newly created part
  useEffect(() => {
    if (highlightId) {
      setHighlighted(highlightId)
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
      const timer = setTimeout(() => setHighlighted(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightId])
  // Persist filters in localStorage
  const saved = (() => { try { return JSON.parse(localStorage.getItem('parts_filters') || '{}') } catch { return {} } })()
  function saveFilters(patch: Record<string, string>) {
    const cur = (() => { try { return JSON.parse(localStorage.getItem('parts_filters') || '{}') } catch { return {} } })()
    localStorage.setItem('parts_filters', JSON.stringify({ ...cur, ...patch }))
  }

  const [q, setQ] = useState(saved.q || '')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'brand'>(saved.groupBy || 'none')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleCollapse(key: string) {
    setCollapsed(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids: number[]) {
    if (ids.every(id => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(ids))
    }
  }

  function printSelected() {
    const ids = Array.from(selected).join(',')
    navigate(`/parts/print?ids=${ids}`)
  }
  const [category, setCategory] = useState(saved.category || '')
  const [make, setMake] = useState(saved.make || '')
  const [model, setModel] = useState(saved.model || '')
  const [carModel, setCarModel] = useState(saved.carModel || '')
  const [debouncedQ, setDebouncedQ] = useState(saved.q || '')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  function handleSearch(val: string) {
    setQ(val)
    saveFilters({ q: val })
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedQ(val), 300)
  }

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts', debouncedQ, category, make, model, carModel],
    queryFn: () => fetchParts(debouncedQ || undefined, category || undefined, false, make || undefined, carModel || model || undefined),
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const groupedParts = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, typeof parts>()
    for (const p of parts) {
      const key = (groupBy === 'category' ? p.category : p.brand) || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [parts, groupBy])
  // Car models from applicability for filtering
  const { data: carModels = [] } = useQuery({
    queryKey: ['car-models-for-stock'],
    queryFn: async () => {
      const res = await api.get('/parts/wo-models-all')
      return res.data as string[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('parts_title')}</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button onClick={printSelected} className="btn-secondary">
              <Printer className="w-4 h-4" /> Печать ({selected.size})
            </button>
          )}
          <Link to="/parts/new" className="btn-primary">
            <Plus className="w-4 h-4" /> {t('parts_new')}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder={t('parts_search')} className="input pl-9"
            value={q} onChange={e => handleSearch(e.target.value)} />
        </div>
        <select value={category} onChange={e => { setCategory(e.target.value); saveFilters({ category: e.target.value }) }} className="input w-auto">
          <option value="">{t('stock_all_categories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden text-xs">
          <span className="px-2 py-1.5 text-gray-500 bg-gray-50">{t('group_label')}</span>
          {(['none', 'category', 'brand'] as const).map(g => (
            <button key={g} onClick={() => { setGroupBy(g); saveFilters({ groupBy: g }) }}
              className={`px-2 py-1.5 font-medium transition-colors ${groupBy === g ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {g === 'none' ? t('group_none') : g === 'category' ? t('group_category') : t('group_brand')}
            </button>
          ))}
        </div>
        <select
          value={carModel}
          onChange={e => { setCarModel(e.target.value); saveFilters({ carModel: e.target.value }) }}
          className={`input w-auto ${carModel ? 'border-blue-500 bg-blue-50' : ''}`}
        >
          <option value="">{t('filter_all_models_moto')}</option>
          {carModels.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {carModel && (
          <button onClick={() => { setCarModel(''); saveFilters({ carModel: '' }) }} className="text-xs text-blue-600 hover:text-blue-800">
            ✕ {carModel}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th w-8">
                  <input type="checkbox"
                    checked={parts.length > 0 && parts.filter(p=>p.barcodes.length>0).every(p => selected.has(p.id))}
                    onChange={() => toggleAll(parts.filter(p=>p.barcodes.length>0).map(p=>p.id))}
                    className="rounded"
                  />
                </th>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_brand')}</th>
                <th className="table-th hidden md:table-cell">{t('lbl_category')}</th>
                <th className="table-th hidden md:table-cell">{t('lbl_cars')}</th>
                <th className="table-th hidden lg:table-cell">{t('parts_oem_barcodes')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_location')}</th>
                <th className="table-th text-right">{t('parts_stock_qty')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-td text-center py-12">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <div className="text-gray-400">{t('parts_no_results')}</div>
                  </td>
                </tr>
              ) : groupedParts ? (
                groupedParts.map(([groupName, rows]) => {
                  const isCollapsed = collapsed.has(groupName)
                  return (
                  <>
                    <tr key={`g-${groupName}`} className="bg-blue-50 cursor-pointer select-none hover:bg-blue-100"
                      onClick={() => toggleCollapse(groupName)}>
                      <td colSpan={7} className="px-4 py-2 text-xs font-bold text-blue-700 uppercase tracking-wide">
                        <span className="mr-2">{isCollapsed ? '▶' : '▼'}</span>
                        {groupName} <span className="font-normal text-blue-500 ml-1">({rows.length})</span>
                      </td>
                    </tr>
                    {!isCollapsed && rows.map(p => (
                      <tr key={p.id}
                        ref={highlighted === p.id ? highlightRef : null}
                        className={`transition-colors duration-700 ${highlighted === p.id ? 'bg-green-100 ring-2 ring-inset ring-green-400' : 'hover:bg-gray-50'}`}
                      >
                        <td className="table-td">
                          {p.barcodes.length > 0 ? <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" /> : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="table-td">
                          <div className="flex items-center gap-1.5">
                            <Link to={`/parts/${p.id}`} className="font-medium text-blue-700 hover:underline flex-1">{p.name}</Link>
                            <button onClick={e => { e.preventDefault(); navigate('/parts/new', { state: { copy: { name: p.name, brand: p.brand, category: p.category, unit: p.unit, min_stock: p.min_stock, track_min_stock: p.track_min_stock, default_issue_qty: p.default_issue_qty, location: p.location } } }) }}
                              className="shrink-0 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title={t('btn_copy')}>
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="table-td hidden sm:table-cell text-gray-500">{p.brand || '—'}</td>
                        <td className="table-td hidden md:table-cell">{p.category ? <span className="badge bg-gray-100 text-gray-600">{p.category}</span> : '—'}</td>
                        <td className="table-td hidden lg:table-cell text-xs font-mono text-gray-500">{p.oem_numbers[0]?.oem_number || p.barcodes[0]?.barcode || '—'}</td>
                        <td className="table-td hidden sm:table-cell text-gray-500">{p.location || '—'}</td>
                        <td className="table-td text-right"><span className={`font-semibold ${p.stock_qty <= p.min_stock ? 'text-red-600' : 'text-gray-900'}`}>{p.stock_qty} {u(p.unit)}</span></td>
                      </tr>
                    ))}
                  </>
                )})
              ) : parts.map(p => (
                <tr key={p.id}
                  ref={highlighted === p.id ? highlightRef : null}
                  className={`group transition-colors duration-700 ${highlighted === p.id ? 'bg-green-100 ring-2 ring-inset ring-green-400' : 'hover:bg-gray-50'}`}
                >
                  <td className="table-td">
                    {p.barcodes.length > 0 ? (
                      <input type="checkbox" checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)} className="rounded" />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/parts/${p.id}`} className="font-medium text-blue-700 hover:underline flex-1">{p.name}</Link>
                      <button
                        onClick={e => { e.preventDefault(); navigate('/parts/new', { state: { copy: { name: p.name, brand: p.brand, category: p.category, unit: p.unit, min_stock: p.min_stock, track_min_stock: p.track_min_stock, default_issue_qty: p.default_issue_qty, location: p.location } } }) }}
                        className="shrink-0 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title={t('btn_copy')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{p.brand || '—'}</td>
                  <td className="table-td hidden md:table-cell">
                    {p.category ? <span className="badge bg-gray-100 text-gray-600">{p.category}</span> : '—'}
                  </td>
                  <td className="table-td hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {p.car_applications.length === 0 ? <span className="text-gray-400">—</span> :
                        p.car_applications.slice(0, 3).map(c => (
                          <span key={c.id} className="badge bg-blue-50 text-blue-700 flex items-center gap-0.5">
                            <Car className="w-3 h-3" />
                            {c.make}{c.model ? ` ${c.model}` : ''}
                          </span>
                        ))
                      }
                      {p.car_applications.length > 3 && (
                        <span className="badge bg-gray-100 text-gray-500">+{p.car_applications.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="table-td hidden lg:table-cell text-xs font-mono text-gray-500">
                    {p.oem_numbers[0]?.oem_number || p.barcodes[0]?.barcode || '—'}
                  </td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{p.location || '—'}</td>
                  <td className="table-td text-right">
                    <span className={`font-semibold ${p.stock_qty <= p.min_stock ? 'text-red-600' : 'text-gray-900'}`}>
                      {p.stock_qty} {u(p.unit)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <KeyHints hints={[{ key: 'Insert', label: t('parts_new') }]} />
    </div>
  )
}
