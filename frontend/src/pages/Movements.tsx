import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMovements, fetchStock } from '../api/stock'
import { ArrowDown, ArrowUp, Settings, RotateCcw, Download, AlertTriangle } from 'lucide-react'
import { useUnit } from '../utils/useUnit'
import { Link } from 'react-router-dom'
import type { MovementType } from '../types'
import { useT } from '../i18n'
import api from '../api/client'

type Period = 'today' | '3days' | 'week' | 'month' | 'year' | 'custom'

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getPeriodDates(period: Period): { from: string; to: string } {
  const now = new Date()
  const to = toISO(now)
  if (period === 'today') return { from: to, to }
  if (period === '3days') return { from: toISO(new Date(Date.now() - 2 * 86400000)), to }
  if (period === 'week')  return { from: toISO(new Date(Date.now() - 6 * 86400000)), to }
  if (period === 'month') return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  if (period === 'year')  return { from: toISO(new Date(now.getFullYear(), 0, 1)), to }
  return { from: '', to: '' }
}

export default function Movements() {
  const { t } = useT()
  const u = useUnit()

  // Restore last used filters from localStorage
  const saved = (() => { try { return JSON.parse(localStorage.getItem('movements_filters') || '{}') } catch { return {} } })()

  const [partFilter, setPartFilter] = useState<{ id: number; name: string } | null>(null)
  const [period, setPeriodState] = useState<Period>(saved.period || 'month')
  const [customFrom, setCustomFrom] = useState(saved.customFrom || '')
  const [customTo, setCustomTo] = useState(saved.customTo || '')
  const [userId, setUserId] = useState(saved.userId || '')
  const [movType, setMovType] = useState(saved.movType || '')
  const [viewMode, setViewModeState] = useState<'list' | 'summary'>(saved.viewMode || 'list')

  function setPeriod(v: Period) { setPeriodState(v); save({ period: v }) }
  function setViewMode(v: 'list' | 'summary') { setViewModeState(v); save({ viewMode: v }) }

  function save(patch: Record<string, string>) {
    const current = (() => { try { return JSON.parse(localStorage.getItem('movements_filters') || '{}') } catch { return {} } })()
    localStorage.setItem('movements_filters', JSON.stringify({ ...current, ...patch }))
  }

  // Save filter changes
  useEffect(() => { save({ period, customFrom, customTo, userId, movType, viewMode }) }, [period, customFrom, customTo, userId, movType, viewMode])

  const { from, to } = period === 'custom'
    ? { from: customFrom, to: customTo }
    : getPeriodDates(period)

  // In summary mode — ignore type filter so all movements are visible
  const effectiveMovType = viewMode === 'summary' ? undefined : (movType || undefined)

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements', from, to, userId, effectiveMovType, partFilter?.id, viewMode],
    refetchInterval: 30_000,
    queryFn: () => fetchMovements({
      fromDate: from || undefined,
      toDate: to || undefined,
      userId: userId ? parseInt(userId) : undefined,
      movementType: effectiveMovType,
      partId: partFilter?.id,
      limit: 2000,
    }),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { const r = await api.get('/auth/users'); return r.data as { id: number; name: string }[] },
  })

  const typeConfig: Record<MovementType, { label: string; color: string; Icon: any }> = {
    receiving:    { label: t('mov_type_receiving'),    color: 'bg-green-100 text-green-700',   Icon: ArrowDown },
    issue:        { label: t('mov_type_issue'),         color: 'bg-red-100 text-red-700',       Icon: ArrowUp },
    adjustment:   { label: t('mov_type_adjustment'),   color: 'bg-yellow-100 text-yellow-700', Icon: Settings },
    return:       { label: t('mov_type_return'),       color: 'bg-blue-100 text-blue-700',     Icon: RotateCcw },
    cancellation: { label: t('mov_type_cancellation'), color: 'bg-gray-200 text-gray-600',     Icon: RotateCcw },
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'today',  label: t('mov_period_today') },
    { key: '3days',  label: t('mov_period_3days') },
    { key: 'week',   label: t('mov_period_week') },
    { key: 'month',  label: t('mov_period_month') },
    { key: 'year',   label: t('mov_period_year') },
    { key: 'custom', label: t('mov_period_custom') },
  ]


  // Summary stats — count only, no quantity sum (mixed units)
  const stats = useMemo(() => {
    const incoming = movements.filter(m => m.movement_type === 'receiving').length
    const issued = movements.filter(m => m.movement_type === 'issue').length
    return { total: movements.length, incoming, issued }
  }, [movements])

  // Fetch current stock for balance column
  const { data: stockData = [] } = useQuery({ queryKey: ['stock'], queryFn: () => fetchStock(false) })
  const stockMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const s of stockData) m.set(s.part_id, s.quantity)
    return m
  }, [stockData])

  // Summary by part_id: group by exact part, show in/out totals with unit
  type PartSummary = { part_id: number; part_name: string; part_brand?: string; unit: string; received: number; issued: number; adjusted: number; net: number; balance: number }
  type BrandGroup = { brand: string; categories: { category: string; parts: PartSummary[] }[] }

  const { partSummary, brandGroups } = useMemo(() => {
    const map = new Map<number, PartSummary & { category?: string }>()
    for (const mv of movements) {
      const key = mv.part_id
      if (!map.has(key)) map.set(key, { part_id: key, part_name: mv.part_name, part_brand: mv.part_brand, unit: mv.part_unit || 'шт', received: 0, issued: 0, adjusted: 0, net: 0, balance: 0 })
      const entry = map.get(key)!
      const qty = Number(mv.quantity)
      if (mv.movement_type === 'receiving') {
        entry.received = Math.round((entry.received + Math.abs(qty)) * 1000) / 1000
      } else if (mv.movement_type === 'issue' || mv.movement_type === 'cancellation') {
        // cancellation reverses an issue — treat as negative issue (reduces issued count)
        if (mv.movement_type === 'issue') entry.issued = Math.round((entry.issued + Math.abs(qty)) * 1000) / 1000
        else entry.issued = Math.round((entry.issued - Math.abs(qty)) * 1000) / 1000
      } else if (mv.movement_type === 'adjustment') {
        // adjustment: positive → extra incoming, negative → extra outgoing
        if (qty >= 0) entry.received = Math.round((entry.received + qty) * 1000) / 1000
        else entry.issued = Math.round((entry.issued + Math.abs(qty)) * 1000) / 1000
      } else if (mv.movement_type === 'return') {
        entry.received = Math.round((entry.received + Math.abs(qty)) * 1000) / 1000
      }
      entry.net = Math.round((entry.received - entry.issued) * 1000) / 1000
    }
    // Fill in current stock balance
    for (const entry of map.values()) {
      entry.balance = stockMap.get(entry.part_id) ?? 0
    }
    const parts = Array.from(map.values()).sort((a, b) => a.part_name.localeCompare(b.part_name))

    // Build brand → category groups
    const brandMap = new Map<string, Map<string, PartSummary[]>>()
    for (const p of parts) {
      const brand = p.part_brand || '—'
      const cat = '—' // category not in movement data; group only by brand for now
      if (!brandMap.has(brand)) brandMap.set(brand, new Map())
      const catMap = brandMap.get(brand)!
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat)!.push(p)
    }
    const groups: BrandGroup[] = Array.from(brandMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([brand, catMap]) => ({
        brand,
        categories: Array.from(catMap.entries()).map(([category, ps]) => ({ category, parts: ps }))
      }))

    return { partSummary: parts, brandGroups: groups }
  }, [movements, stockMap])

  const [summaryCollapsed, setSummaryCollapsed] = useState<Set<string>>(new Set())

  function showPartMovements(partId: number, partName: string) {
    setPartFilter({ id: partId, name: partName })
    setViewMode('list')
  }

  function refLabel(mv: (typeof movements)[0]): string {
    if (mv.reference_type === 'receiving_order' && mv.reference_id) {
      return `${t('rec_title')} #${mv.reference_id}`
    }
    if (mv.reference_type === 'work_order') return ''
    return ''
  }

  function exportExcel() {
    const params = new URLSearchParams()
    if (from) params.set('from_date', from)
    if (to) params.set('to_date', to)
    if (userId) params.set('user_id', userId)
    if (movType) params.set('movement_type', movType)
    window.open(`/api/export/movements?${params}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('mov_title')}</h1>
        <div className="flex gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t('mov_view_list')}
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t('mov_view_summary')}
            </button>
          </div>
          <button onClick={exportExcel} className="btn-secondary">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* Active part filter badge */}
      {partFilter && viewMode === 'list' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200 text-sm">
          <span className="text-blue-700 font-medium">📦 {partFilter.name}</span>
          <button onClick={() => setPartFilter(null)} className="ml-auto text-xs text-blue-400 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100">
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Period buttons */}
        <div className="flex flex-wrap gap-2">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{t('mov_from')}</span>
              <input type="date" className="input w-auto" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{t('mov_to')}</span>
              <input type="date" className="input w-auto" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* Employee + type filters */}
        <div className="flex flex-wrap gap-3">
          <select value={userId} onChange={e => { setUserId(e.target.value); save({ userId: e.target.value }) }} className="input w-auto">
            <option value="">{t('mov_all_employees')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={movType} onChange={e => { setMovType(e.target.value); save({ movType: e.target.value }) }} className="input w-auto">
            <option value="">{t('mov_all_types')}</option>
            <option value="receiving">{t('mov_type_receiving')}</option>
            <option value="issue">{t('mov_type_issue')}</option>
            <option value="adjustment">{t('mov_type_adjustment')}</option>
            <option value="return">{t('mov_type_return')}</option>
            <option value="cancellation">{t('mov_type_cancellation')}</option>
          </select>
        </div>

        {/* Summary row */}
        {!isLoading && movements.length > 0 && (
          <div className="flex flex-wrap gap-4 pt-1 text-sm">
            <span className="text-gray-500">{t('mov_total')}: <strong>{stats.total}</strong></span>
            <span className="text-green-600">{t('mov_type_receiving')}: <strong>{stats.incoming}</strong></span>
            <span className="text-red-600">{t('mov_type_issue')}: <strong>{stats.issued}</strong></span>
          </div>
        )}
      </div>

      {/* Summary view */}
      {viewMode === 'summary' && (
        <div className="card overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-600">
              {t('mov_summary_total')}: {partSummary.length} {t('mov_positions')}
            </span>
            {movType && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                Сводка показывает все типы движений (фильтр по типу не применяется)
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">{t('lbl_name')}</th>
                  <th className="table-th text-right text-green-700">{t('mov_col_received')}</th>
                  <th className="table-th text-right text-red-600">{t('mov_col_issued')}</th>
                  <th className="table-th text-right">{t('mov_col_total')}</th>
                  <th className="table-th text-right text-blue-700">{t('mov_col_balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
                ) : brandGroups.length === 0 ? (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-8">{t('mov_no_data')}</td></tr>
                ) : brandGroups.map(bg => {
                  const bgCollapsed = summaryCollapsed.has(bg.brand)
                  const bgTotal = bg.categories.reduce((s, c) => s + c.parts.length, 0)
                  return (
                    <>
                      {/* Brand header */}
                      <tr key={`bg-${bg.brand}`}
                        className="bg-blue-600 cursor-pointer select-none hover:bg-blue-700"
                        onClick={() => setSummaryCollapsed(prev => { const n = new Set(prev); n.has(bg.brand) ? n.delete(bg.brand) : n.add(bg.brand); return n })}>
                        <td colSpan={5} className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wide">
                          <span className="mr-2">{bgCollapsed ? '▶' : '▼'}</span>
                          {bg.brand} <span className="font-normal opacity-75 ml-1">({bgTotal})</span>
                        </td>
                      </tr>
                      {!bgCollapsed && bg.categories.map(cat => cat.parts.map(row => (
                        <tr key={row.part_id} className="hover:bg-blue-50 cursor-pointer"
                          onClick={() => showPartMovements(row.part_id, row.part_name)}>
                          <td className="table-td pl-8">
                            <div className="font-medium text-sm text-blue-700">{row.part_name}</div>
                          </td>
                          <td className="table-td text-right font-semibold text-green-700">
                            {row.received > 0 ? <span>+{row.received} <span className="text-xs font-normal text-gray-400">{u(row.unit)}</span></span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-td text-right font-semibold text-red-600">
                            {row.issued > 0 ? <span>-{row.issued} <span className="text-xs font-normal text-gray-400">{u(row.unit)}</span></span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-td text-right font-semibold">
                            <span className={row.net > 0 ? 'text-green-600' : row.net < 0 ? 'text-red-600' : 'text-gray-400'}>
                              {row.net > 0 ? '+' : ''}{row.net} <span className="text-xs font-normal text-gray-400">{u(row.unit)}</span>
                            </span>
                          </td>
                          <td className="table-td text-right font-semibold text-blue-700">
                            {row.balance} <span className="text-xs font-normal text-gray-400">{u(row.unit)}</span>
                          </td>
                        </tr>
                      )))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      {viewMode === 'list' && <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('lbl_date')}</th>
                <th className="table-th">{t('lbl_employee')}</th>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th">{t('lbl_status')}</th>
                <th className="table-th text-right">{t('lbl_quantity')}</th>
                <th className="table-th text-right hidden sm:table-cell">{t('lbl_after')}</th>
                <th className="table-th hidden md:table-cell">{t('lbl_work_order')}</th>
                <th className="table-th hidden lg:table-cell">{t('lbl_notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">{t('mov_no_data')}</td></tr>
              ) : movements.map(mv => {
                const cfg = typeConfig[mv.movement_type]
                const Icon = cfg.Icon
                return (
                  <tr key={mv.id} className="hover:bg-gray-50">
                    <td className="table-td whitespace-nowrap text-xs text-gray-500">
                      {new Date(mv.created_at).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="table-td font-medium text-sm">{mv.created_by_name}</td>
                    <td className="table-td max-w-[160px]">
                      <div className="text-sm font-medium line-clamp-1">{mv.part_name}</div>
                      {mv.part_brand && <div className="text-xs text-gray-400">{mv.part_brand}</div>}
                    </td>
                    <td className="table-td">
                      <span className={`badge ${cfg.color} flex items-center gap-1 w-fit`}>
                        <Icon className="w-3 h-3" />
                        <span className="hidden sm:inline">{cfg.label}</span>
                      </span>
                    </td>
                    <td className="table-td text-right font-semibold">
                      <span className={mv.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                        {mv.quantity > 0 ? '+' : ''}{mv.quantity}
                      </span>
                    </td>
                    <td className="table-td text-right font-medium hidden sm:table-cell">{mv.quantity_after}</td>
                    <td className="table-td hidden md:table-cell">
                      {mv.work_order_number ? (
                        <Link
                          to={mv.work_order_id
                            ? `/work-orders/${mv.work_order_id}`
                            : `/work-orders?q=${encodeURIComponent(mv.work_order_number)}`
                          }
                          className="font-mono text-blue-700 font-medium hover:underline"
                        >
                          {mv.work_order_number}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="table-td text-gray-500 hidden lg:table-cell max-w-[180px]">
                      <span className="line-clamp-1">
                        {refLabel(mv) && <span className="text-gray-400 mr-1">{refLabel(mv)}</span>}
                        {mv.notes || (!refLabel(mv) ? '—' : '')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}
