import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchIssueOrder, createIssueOrder, confirmIssueOrder,
  cancelIssueOrder, deleteIssueOrder
} from '../../api/issues'
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react'
import PartSearch from '../../components/PartSearch'
import type { Part } from '../../types'
import toast from 'react-hot-toast'
import { useT } from '../../i18n'
import { getUser } from '../../store/auth'
import { canAdmin, canWarehouse } from '../../store/permissions'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import KeyHints from '../../components/KeyHints'

interface LineItem { part: Part; quantity: number; notes: string }

export default function IssueForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useT()
  const me = getUser()
  const isAdmin = me ? canAdmin(me.role) : false
  const isWarehouse = me ? canWarehouse(me.role) : false

  const { data: existing } = useQuery({
    queryKey: ['issue-order', id],
    queryFn: () => fetchIssueOrder(Number(id)),
    enabled: !isNew,
  })

  const [workOrder, setWorkOrder] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(false)

  async function handleConfirmDirect() {
    if (!existing || existing.is_confirmed || existing.is_cancelled) return
    setLoading(true)
    try {
      await confirmIssueOrder(existing.id)
      toast.success(t('issue_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['issue-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!existing || existing.items.length === 0) return
    setLoading(true)
    try {
      const copy = await createIssueOrder({
        work_order_number: `${existing.work_order_number}-copy`,
        notes: existing.notes || undefined,
        items: existing.items.map(i => ({ part_id: i.part_id, quantity: i.quantity })),
      })
      toast.success('Копия создана')
      qc.invalidateQueries({ queryKey: ['issues'] })
      navigate(`/issues/${copy.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  useKeyboardShortcuts({
    insert: () => document.querySelector<HTMLInputElement>('.part-search-wrapper input')?.focus(),
    ctrlEnter: () => {
      if (isNew) { handleSave(); return }
      if (existing && !existing.is_confirmed && !existing.is_cancelled) handleConfirmDirect()
    },
    f9: () => { if (!isNew && existing) handleCopy() },
  })

  function addPart(part: Part) {
    const ex = items.find(i => i.part.id === part.id)
    if (ex) {
      setItems(prev => prev.map(i => i.part.id === part.id ? { ...i, quantity: i.quantity + 1 } : i))
      toast.success(`${part.name}: ${ex.quantity + 1}`, { duration: 1200, icon: '📦' })
      return
    }
    setItems(prev => [...prev, { part, quantity: 1, notes: '' }])
    toast.success(`+ ${part.name}`, { duration: 1200 })
  }

  async function handleSave() {
    if (!workOrder.trim()) { toast.error(t('issue_wo_label')); return }
    if (items.length === 0) { toast.error(t('err_no_items')); return }
    setLoading(true)
    try {
      const order = await createIssueOrder({
        work_order_number: workOrder,
        notes: notes || undefined,
        items: items.map(i => ({ part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined })),
      })
      toast.success(t('issue_draft_created'))
      qc.invalidateQueries({ queryKey: ['issues'] })
      navigate(`/issues/${order.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!existing || !confirm(t('issue_confirm_title'))) return
    setLoading(true)
    try {
      await confirmIssueOrder(existing.id)
      toast.success(t('issue_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['issue-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!existing || !confirm(t('issue_cancel_confirm'))) return
    setLoading(true)
    try {
      await cancelIssueOrder(existing.id)
      toast.success(t('issue_cancelled_toast'))
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['issue-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!existing || !confirm(t('issue_delete_confirm'))) return
    try {
      await deleteIssueOrder(existing.id)
      toast.success(t('sup_deleted'))
      navigate('/issues')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  if (!isNew && !existing) return <div className="text-center py-16 text-gray-400">{t('rec_loading')}</div>

  // View existing
  if (!isNew && existing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/issues')} className="btn-secondary py-1.5 px-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('issue_title')} #{existing.id}
            </h1>
            <div className="text-sm text-gray-500">
              {new Date(existing.date).toLocaleDateString('ru-RU')} · {existing.created_by_name}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {existing.is_cancelled ? (
              <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> {t('issue_status_cancelled')}
              </span>
            ) : existing.is_confirmed ? (
              <span className="badge bg-red-100 text-red-700 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> {t('status_confirmed')}
              </span>
            ) : (
              <span className="badge bg-yellow-100 text-yellow-700">{t('status_draft')}</span>
            )}
          </div>
        </div>

        <div className="card p-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">{t('lbl_work_order')}:</span>
            <span className="font-mono font-bold text-blue-800 ml-2 text-base">{existing.work_order_number}</span>
          </div>
          {existing.notes && (
            <div><span className="text-gray-500">{t('lbl_notes')}:</span> {existing.notes}</div>
          )}
          {existing.is_cancelled && existing.cancelled_by_name && (
            <div className="sm:col-span-2 text-red-600">
              {t('rec_cancelled_by')}: <strong>{existing.cancelled_by_name}</strong>
              {existing.cancelled_at && ` · ${new Date(existing.cancelled_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}`}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th text-right">{t('lbl_quantity')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {existing.items.map(item => (
                <tr key={item.id}>
                  <td className="table-td font-medium">{item.part_name}</td>
                  <td className="table-td text-right font-semibold text-red-700">-{item.quantity}</td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{item.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="table-td font-semibold">{t('rec_total_positions')}: {existing.items.length}</td>
                <td className="table-td text-right font-bold text-red-700">
                  -{existing.items.reduce((s, i) => s + i.quantity, 0)} {t('lbl_pieces')}
                </td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Draft actions */}
        {!existing.is_confirmed && !existing.is_cancelled && isWarehouse && (
          <div className="flex gap-3 justify-end flex-wrap">
            <button className="btn-secondary text-red-500" onClick={handleDelete}>{t('issue_delete_draft')}</button>
            <button className="btn-danger" onClick={handleConfirm} disabled={loading}>
              <CheckCircle className="w-4 h-4" /> {t('issue_confirm_btn')}
            </button>
          </div>
        )}

        {/* Confirmed — admin can cancel */}
        {existing.is_confirmed && !existing.is_cancelled && isAdmin && (
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary text-red-500" onClick={handleCancel} disabled={loading}>
              <XCircle className="w-4 h-4" /> {t('issue_cancel_btn')}
            </button>
          </div>
        )}

        <KeyHints hints={[
          ...(!existing.is_confirmed && !existing.is_cancelled ? [{ key: 'Ctrl+Enter', label: t('issue_confirm_btn') }] : []),
          { key: 'F9', label: 'Копировать' },
        ]} />
      </div>
    )
  }

  // New form
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/issues')} className="btn-secondary py-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{t('issue_new')}</h1>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('issue_data_title')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">{t('issue_wo_label')}</label>
            <input
              className="input font-mono text-lg"
              placeholder={t('issue_wo_placeholder')}
              value={workOrder}
              onChange={e => setWorkOrder(e.target.value)}
              autoFocus
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('lbl_notes')}</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('issue_items_title')}</h2>
        <div className="part-search-wrapper">
          <PartSearch onSelect={addPart} placeholder={t('issue_add_placeholder')} />
        </div>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">{t('lbl_name')}</th>
                  <th className="table-th text-right">{t('lbl_quantity')}</th>
                  <th className="table-th hidden sm:table-cell text-gray-400 text-xs">
                    {t('stock_on_stock')}
                  </th>
                  <th className="table-th w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="table-td">
                      <div className="font-medium">{item.part.name}</div>
                      {item.part.brand && <div className="text-xs text-gray-500">{item.part.brand}</div>}
                    </td>
                    <td className="table-td">
                      <input
                        type="number" min="1" max={item.part.stock_qty}
                        className={`input text-right w-24 ${item.quantity > item.part.stock_qty ? 'border-red-400' : ''}`}
                        value={item.quantity}
                        onChange={e => setItems(prev => prev.map((it, i) =>
                          i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it
                        ))}
                      />
                    </td>
                    <td className="table-td hidden sm:table-cell">
                      <span className={item.part.stock_qty <= item.part.min_stock ? 'text-red-500' : 'text-gray-500'}>
                        {item.part.stock_qty} {item.part.unit}
                      </span>
                    </td>
                    <td className="table-td">
                      <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="p-1 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="table-td font-semibold">{t('rec_total_positions')}: {items.length}</td>
                  <td className="table-td text-right font-bold text-red-700">
                    -{items.reduce((s, i) => s + i.quantity, 0)} {t('lbl_pieces')}
                  </td>
                  <td className="hidden sm:table-cell" /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">{t('issue_no_items')}</div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={() => navigate('/issues')}>{t('btn_cancel')}</button>
        <button
          className="btn-danger"
          onClick={handleSave}
          disabled={loading || items.length === 0 || !workOrder.trim()}
        >
          {t('issue_create_draft')}
        </button>
      </div>
      <KeyHints hints={[
        { key: 'Insert', label: 'Поиск запчасти' },
        { key: 'Ctrl+Enter', label: t('issue_create_draft') },
      ]} />
    </div>
  )
}
