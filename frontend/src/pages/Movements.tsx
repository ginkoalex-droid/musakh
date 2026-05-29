import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMovements } from '../api/stock'
import { ArrowDown, ArrowUp, Settings, RotateCcw, Download } from 'lucide-react'
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

  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [userId, setUserId] = useState('')
  const [movType, setMovType] = useState('')

  const { from, to } = period === 'custom'
    ? { from: customFrom, to: customTo }
    : getPeriodDates(period)

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements', from, to, userId, movType],
    queryFn: () => fetchMovements({
      fromDate: from || undefined,
      toDate: to || undefined,
      userId: userId ? parseInt(userId) : undefined,
      movementType: movType || undefined,
    }),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { const r = await api.get('/auth/users'); return r.data as { id: number; name: string }[] },
  })

  const typeConfig: Record<MovementType, { label: string; color: string; Icon: any }> = {
    receiving:  { label: t('mov_type_receiving'),  color: 'bg-green-100 text-green-700',   Icon: ArrowDown },
    issue:      { label: t('mov_type_issue'),       color: 'bg-red-100 text-red-700',       Icon: ArrowUp },
    adjustment: { label: t('mov_type_adjustment'),  color: 'bg-yellow-100 text-yellow-700', Icon: Settings },
    return:     { label: t('mov_type_return'),      color: 'bg-blue-100 text-blue-700',     Icon: RotateCcw },
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'today',  label: t('mov_period_today') },
    { key: '3days',  label: t('mov_period_3days') },
    { key: 'week',   label: t('mov_period_week') },
    { key: 'month',  label: t('mov_period_month') },
    { key: 'year',   label: t('mov_period_year') },
    { key: 'custom', label: t('mov_period_custom') },
  ]

  // Summary stats
  const stats = useMemo(() => {
    const incoming = movements.filter(m => m.movement_type === 'receiving').reduce((s, m) => s + m.quantity, 0)
    const issued = movements.filter(m => m.movement_type === 'issue').reduce((s, m) => s + Math.abs(m.quantity), 0)
    return { total: movements.length, incoming, issued }
  }, [movements])

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
        <button onClick={exportExcel} className="btn-secondary">
          <Download className="w-4 h-4" /> Excel
        </button>
      </div>

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
          <select value={userId} onChange={e => setUserId(e.target.value)} className="input w-auto">
            <option value="">{t('mov_all_employees')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={movType} onChange={e => setMovType(e.target.value)} className="input w-auto">
            <option value="">{t('mov_all_types')}</option>
            <option value="receiving">{t('mov_type_receiving')}</option>
            <option value="issue">{t('mov_type_issue')}</option>
            <option value="adjustment">{t('mov_type_adjustment')}</option>
            <option value="return">{t('mov_type_return')}</option>
          </select>
        </div>

        {/* Summary row */}
        {!isLoading && movements.length > 0 && (
          <div className="flex flex-wrap gap-4 pt-1 text-sm">
            <span className="text-gray-500">{t('mov_total')}: <strong>{stats.total}</strong></span>
            <span className="text-green-600">{t('mov_type_receiving')}: <strong>+{stats.incoming}</strong></span>
            <span className="text-red-600">{t('mov_type_issue')}: <strong>-{stats.issued}</strong></span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
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
                      <span className="line-clamp-2 text-sm">{mv.part_name}</span>
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
                      {mv.work_order_number
                        ? <span className="font-mono text-blue-700 font-medium">{mv.work_order_number}</span>
                        : '—'}
                    </td>
                    <td className="table-td text-gray-500 hidden lg:table-cell max-w-[180px]">
                      <span className="line-clamp-1">{mv.notes || '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
