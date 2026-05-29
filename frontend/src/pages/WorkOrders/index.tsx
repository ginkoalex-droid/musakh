import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWorkOrders, fetchWOSummary, fetchMechanics, confirmWorkOrder, deleteWorkOrder, createWorkOrder } from '../../api/workOrders'
import { Plus, CheckCircle, Clock, Users, Trash2, Edit2 } from 'lucide-react'
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

  // New WO form state
  const [form, setForm] = useState({ work_order_number: '', mechanic_id: 0, car_plate: '', car_make: '', car_model: '', notes: '' })

  const { from, to } = period === 'custom' ? { from: customFrom, to: customTo } : getPeriod(period)

  const { data: orders = [] } = useQuery({
    queryKey: ['work-orders', from, to, mechFilter],
    queryFn: () => fetchWorkOrders({ from_date: from || undefined, to_date: to || undefined, mechanic_id: mechFilter || undefined }),
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
    setLoading(true)
    try {
      await createWorkOrder({
        work_order_number: form.work_order_number,
        mechanic_id: form.mechanic_id,
        car_plate: form.car_plate || undefined,
        car_make: form.car_make || undefined,
        car_model: form.car_model || undefined,
        notes: form.notes || undefined,
      })
      toast.success(t('wo_created_toast'))
      qc.invalidateQueries({ queryKey: ['work-orders'] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
      setNewModal(false)
      setForm({ work_order_number: '', mechanic_id: 0, car_plate: '', car_make: '', car_model: '', notes: '' })
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
      <td className="table-td font-mono font-semibold text-blue-800">{o.work_order_number}</td>
      {!groupBy && <td className="table-td font-medium">{o.mechanic_name}</td>}
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
        <div className="flex flex-wrap gap-2">
          {periods.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
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
                <div className="text-3xl font-bold text-blue-700 mt-1">{s.total}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t('wo_closed')}: <span className="text-green-600 font-medium">{s.confirmed}</span>
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
              <input className="input font-mono text-lg" placeholder="12345" autoFocus
                value={form.work_order_number}
                onChange={e => setForm(f => ({ ...f, work_order_number: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div>
              <label className="label">{t('wo_mechanic')} *</label>
              <select className="input" value={form.mechanic_id}
                onChange={e => setForm(f => ({ ...f, mechanic_id: parseInt(e.target.value) }))}>
                <option value={0}>—</option>
                {activeMechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">{t('wo_car_plate')}</label>
                <input className="input font-mono" value={form.car_plate} onChange={e => setForm(f => ({ ...f, car_plate: e.target.value }))} />
              </div>
              <div>
                <label className="label">{t('lbl_make')}</label>
                <input className="input" placeholder="BMW" value={form.car_make} onChange={e => setForm(f => ({ ...f, car_make: e.target.value }))} />
              </div>
              <div>
                <label className="label">{t('lbl_model')}</label>
                <input className="input" placeholder="3 Series" value={form.car_model} onChange={e => setForm(f => ({ ...f, car_model: e.target.value }))} />
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
