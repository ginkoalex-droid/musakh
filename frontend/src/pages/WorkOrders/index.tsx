import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWorkOrders, fetchWOSummary, fetchMechanics, confirmWorkOrder, deleteWorkOrder, createWorkOrder } from '../../api/workOrders'
import { Plus, CheckCircle, Clock, Users, Trash2, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { WORK_TYPES } from '../../api/workOrders'
import { useT } from '../../i18n'
import { getUser } from '../../store/auth'
import { canAdmin, canWarehouse } from '../../store/permissions'
import Modal from '../../components/Modal'
import KeyHints from '../../components/KeyHints'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import toast from 'react-hot-toast'

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

function toISO(d: Date) { return d.toISOString().slice(0, 10) }
function getPeriod(p: Period): { from: string; to: string } {
  const now = new Date()
  const to = toISO(now)
  if (p === 'today') return { from: to, to }
  if (p === 'week')  return { from: toISO(new Date(Date.now() - 6 * 86400000)), to }
  if (p === 'month') return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  if (p === 'year')  return { from: toISO(new Date(now.getFullYear(), 0, 1)), to }
  return { from: '', to: '' }
}

export default function WorkOrders() {
  const { t } = useT()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  // Auto-fill search from URL param (e.g. from movements link)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) { setSearch(q); setDebouncedSearch(q) }
  }, [])
  const me = getUser()
  const isWarehouse = me ? canWarehouse(me.role) : false
  const isAdmin = me ? canAdmin(me.role) : false

  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [mechFilter, setMechFilter] = useState<number | ''>('')
  const [groupBy, setGroupBy] = useState(true)
  const [newModal, setNewModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useState<ReturnType<typeof setTimeout>>()[0]

  function handleSearch(val: string) {
    setSearch(val)
    clearTimeout(searchTimer as any)
    setTimeout(() => setDebouncedSearch(val), 300)
  }

  const [woExists, setWoExists] = useState(false)
  const woCheckTimer = useRef<ReturnType<typeof setTimeout>>()

  // New WO form state
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [workTypeFilter, setWorkTypeFilter] = useState('')
  const [form, setForm] = useState({
    work_order_number: '', work_type: '', mechanic_id: 0,
    mechanic_id_2: 0, mechanic_share: 100,
    car_plate: '', car_make: '', car_model: '', notes: ''
  })

  function handleWONumber(val: string) {
    setForm(f => ({ ...f, work_order_number: val }))
    clearTimeout(woCheckTimer.current)
    if (!val.trim()) { setWoExists(false); return }
    woCheckTimer.current = setTimeout(async () => {
      const results = await fetchWorkOrders({ q: val })
      setWoExists(results.some(wo => wo.work_order_number.toLowerCase() === val.toLowerCase()))
    }, 400)
  }

  const { from, to } = period === 'custom' ? { from: customFrom, to: customTo } : getPeriod(period)

  const { data: orders = [] } = useQuery({
    queryKey: ['work-orders', from, to, mechFilter, debouncedSearch, statusFilter, workTypeFilter],
    queryFn: () => fetchWorkOrders({
      from_date: debouncedSearch ? undefined : (from || undefined),
      to_date: debouncedSearch ? undefined : (to || undefined),
      mechanic_id: mechFilter || undefined,
      q: debouncedSearch || undefined,
      confirmed_only: statusFilter === 'closed',
      open_only: statusFilter === 'open',
      work_type: workTypeFilter || undefined,
    }),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['wo-summary', from, to],
    queryFn: () => fetchWOSummary(from || undefined, to || undefined),
  })

  const { data: mechanics = [] } = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const activeMechanics = mechanics.filter(m => m.is_active)

  useKeyboardShortcuts({ insert: () => setNewModal(true) })

  async function handleConfirm(id: number) {
    if (!confirm(t('wo_confirm_title'))) return
    try {
      await confirmWorkOrder(id)
      toast.success(t('wo_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['work-orders'] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('wo_delete_confirm'))) return
    try {
      await deleteWorkOrder(id)
      qc.invalidateQueries({ queryKey: ['work-orders'] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  async function handleCreate() {
    if (!form.work_order_number.trim()) { toast.error(t('err_no_name')); return }
    if (!form.mechanic_id) { toast.error(t('wo_mechanic') + ' required'); return }
    if (woExists) { toast.error(`ЗН ${form.work_order_number} уже существует`); return }
    setLoading(true)
    try {
      await createWorkOrder({
        work_order_number: form.work_order_number,
        work_type: form.work_type || undefined,
        mechanic_id: form.mechanic_id,
        mechanic_id_2: form.mechanic_id_2 || undefined,
        mechanic_share: form.mechanic_share,
        car_plate: form.car_plate || undefined,
        car_make: form.car_make || undefined,
        car_model: form.car_model || undefined,
        notes: form.notes || undefined,
      })
      toast.success(t('wo_created_toast'))
      qc.invalidateQueries({ queryKey: ['work-orders'] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
      setNewModal(false)
      setForm({ work_order_number: '', work_type: '', mechanic_id: 0, mechanic_id_2: 0, mechanic_share: 100, car_plate: '', car_make: '', car_model: '', notes: '' })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
    finally { setLoading(false) }
  }

  // Group orders by mechanic
  const grouped = useMemo(() => {
    if (!groupBy) return null
    const map = new Map<number, typeof orders>()
    for (const o of orders) {
      if (!map.has(o.mechanic_id)) map.set(o.mechanic_id, [])
      map.get(o.mechanic_id)!.push(o)
    }
    return map
  }, [orders, groupBy])

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: t('mov_period_today') },
    { key: 'week', label: t('mov_period_week') },
    { key: 'month', label: t('mov_period_month') },
    { key: 'year', label: t('mov_period_year') },
    { key: 'custom', label: t('mov_period_custom') },
  ]

  const WORow = ({ o }: { o: typeof orders[0] }) => (
    <tr className="hover:bg-gray-50">
      <td className="table-td">
        <Link to={`/work-orders/${o.id}`} className="font-mono font-semibold text-blue-700 hover:underline">
          {o.work_order_number}
        </Link>
        {o.work_type && <span className="ml-2 badge bg-purple-100 text-purple-700 text-xs">{o.work_type}</span>}
      </td>
      {!groupBy && (
        <td className="table-td">
          <div className="font-medium">{o.mechanic_name}</div>
          {o.mechanic2_name && (
            <div className="text-xs text-gray-400">{o.mechanic_share}% / {o.mechanic2_name} {100 - o.mechanic_share}%</div>
          )}
        </td>
      )}
      <td className="table-td text-gray-500 text-sm">{new Date(o.date).toLocaleDateString('ru-RU')}</td>
      <td className="table-td hidden sm:table-cell text-gray-500 text-sm">
        {[o.car_plate, o.car_make, o.car_model].filter(Boolean).join(' ')}
      </td>
      <td className="table-td hidden md:table-cell text-gray-500 text-sm">{o.notes || '—'}</td>
      <td className="table-td">
        {o.is_confirmed ? (
          <span className="badge bg-green-100 text-green-700 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" /> {t('wo_confirmed')}
          </span>
        ) : (
          <span className="badge bg-blue-100 text-blue-700 flex items-center gap-1 w-fit">
            <Clock className="w-3 h-3" /> {t('wo_open')}
          </span>
        )}
      </td>
      <td className="table-td">
        <div className="flex gap-1">
          {!o.is_confirmed && isWarehouse && (
            <button onClick={() => handleConfirm(o.id)} className="btn-success py-1 px-2 text-xs">
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
          {(isAdmin || !o.is_confirmed) && (
            <button onClick={() => handleDelete(o.id)} className="btn-secondary py-1 px-2 text-xs text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('wo_title')}</h1>
        <div className="flex gap-2">
          <button onClick={() => setGroupBy(g => !g)} className={`btn-secondary ${groupBy ? 'bg-blue-50 border-blue-300' : ''}`}>
            <Users className="w-4 h-4" /> {groupBy ? 'Список' : 'По механику'}
          </button>
          {isWarehouse && (
            <button onClick={() => setNewModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> {t('wo_new')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Поиск по номеру ЗН, госномеру, марке, модели..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* Period buttons — hidden when searching */}
        {!debouncedSearch && (
          <div className="flex flex-wrap gap-2">
            {periods.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {!debouncedSearch && period === 'custom' && (
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
        <div className="flex flex-wrap gap-2">
          {(['all', 'open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'Все' : s === 'open' ? `${t('wo_open')}` : `${t('wo_confirmed')}`}
            </button>
          ))}
        </div>
        <select value={workTypeFilter} onChange={e => setWorkTypeFilter(e.target.value)} className="input w-auto">
          <option value="">Все типы</option>
          {WORK_TYPES.map(wt => <option key={wt} value={wt}>{wt}</option>)}
        </select>
        <select value={mechFilter} onChange={e => setMechFilter(e.target.value ? parseInt(e.target.value) : '')} className="input w-auto">
          <option value="">{t('mov_all_employees')}</option>
          {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}{!m.is_active ? ' (inactive)' : ''}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      {summary.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-2">{t('wo_summary_title')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {summary.map(s => (
              <div key={s.mechanic_id} className="card p-4 cursor-pointer hover:border-blue-300 hover:shadow"
                onClick={() => setMechFilter(mechFilter === s.mechanic_id ? '' : s.mechanic_id)}>
                <div className="font-semibold text-gray-900 text-sm">{s.mechanic_name}</div>
                <div className="text-3xl font-bold text-blue-700 mt-1">{s.confirmed}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  закрыт · всего: <span className="text-gray-600 font-medium">{s.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      {grouped ? (
        // Grouped view
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([mechId, mechOrders]) => {
            const name = mechOrders[0]?.mechanic_name || ''
            const closed = mechOrders.filter(o => o.is_confirmed).length
            return (
              <div key={mechId} className="card overflow-hidden">
                <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                  <span className="font-semibold text-blue-900">{name}</span>
                  <span className="text-sm text-blue-700">
                    {t('wo_total')}: <strong>{mechOrders.length}</strong> · {t('wo_closed')}: <strong className="text-green-600">{closed}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="table-th">{t('wo_number')}</th>
                      <th className="table-th">{t('lbl_date')}</th>
                      <th className="table-th hidden sm:table-cell">{t('wo_car')}</th>
                      <th className="table-th hidden md:table-cell">{t('lbl_notes')}</th>
                      <th className="table-th">{t('lbl_status')}</th>
                      <th className="table-th w-20" />
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {mechOrders.map(o => <WORow key={o.id} o={o} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {grouped.size === 0 && <div className="card p-8 text-center text-gray-400">{t('wo_no_data')}</div>}
        </div>
      ) : (
        // Flat view
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">{t('wo_number')}</th>
                <th className="table-th">{t('wo_mechanic')}</th>
                <th className="table-th">{t('lbl_date')}</th>
                <th className="table-th hidden sm:table-cell">{t('wo_car')}</th>
                <th className="table-th hidden md:table-cell">{t('lbl_notes')}</th>
                <th className="table-th">{t('lbl_status')}</th>
                <th className="table-th w-20" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length === 0
                  ? <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('wo_no_data')}</td></tr>
                  : orders.map(o => <WORow key={o.id} o={o} />)
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      <KeyHints hints={[{ key: 'Insert', label: t('wo_new') }]} />

      {/* New WO modal */}
      {newModal && (
        <Modal title={t('wo_new')} onClose={() => setNewModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">{t('wo_number')} *</label>
              <input
                id="wo-number-input"
                className={`input font-mono text-lg ${woExists ? 'border-orange-400 bg-orange-50' : ''}`}
                placeholder="12345 или сканируй штрихкод"
                autoFocus
                value={form.work_order_number}
                onChange={e => handleWONumber(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    // Move focus to next field instead of submitting
                    document.querySelector<HTMLSelectElement>('#wo-worktype-select')?.focus()
                  }
                }}
              />
              {woExists && (
                <p className="text-xs text-orange-600 mt-1 font-medium">
                  ⚠ ЗН с номером «{form.work_order_number}» уже существует
                </p>
              )}
            </div>
            <div>
              <label className="label">Тип работы</label>
              <select id="wo-worktype-select" className="input" value={form.work_type}
                onChange={e => setForm(f => ({ ...f, work_type: e.target.value }))}>
                <option value="">—</option>
                {WORK_TYPES.map(wt => <option key={wt} value={wt}>{wt}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('wo_mechanic')} *</label>
              <select className="input" value={form.mechanic_id}
                onChange={e => setForm(f => ({ ...f, mechanic_id: parseInt(e.target.value) }))}>
                <option value={0}>—</option>
                {activeMechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Второй механик (необязательно)</label>
              <select className="input" value={form.mechanic_id_2}
                onChange={e => setForm(f => ({ ...f, mechanic_id_2: parseInt(e.target.value) || 0 }))}>
                <option value={0}>—</option>
                {activeMechanics.filter(m => m.id !== form.mechanic_id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {form.mechanic_id_2 > 0 && (
              <div>
                <label className="label">Доля первого механика: {form.mechanic_share}% / {100 - form.mechanic_share}%</label>
                <input type="range" min="10" max="90" step="10" className="w-full"
                  value={form.mechanic_share}
                  onChange={e => setForm(f => ({ ...f, mechanic_share: parseInt(e.target.value) }))} />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>{activeMechanics.find(m => m.id === form.mechanic_id)?.name}</span>
                  <span>{activeMechanics.find(m => m.id === form.mechanic_id_2)?.name}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">{t('wo_car_plate')}</label>
                <input className="input font-mono" value={form.car_plate} onChange={e => setForm(f => ({ ...f, car_plate: e.target.value }))} />
              </div>
              <div>
                <label className="label">{t('lbl_make')}</label>
                <input className="input" placeholder="BMW, Yamaha..." value={form.car_make} onChange={e => setForm(f => ({ ...f, car_make: e.target.value }))} />
              </div>
              <div>
                <label className="label">{t('lbl_model')}</label>
                <input className="input" placeholder="R1200GS, MT-07..." value={form.car_model} onChange={e => setForm(f => ({ ...f, car_model: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">{t('lbl_notes')}</label>
              <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setNewModal(false)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
