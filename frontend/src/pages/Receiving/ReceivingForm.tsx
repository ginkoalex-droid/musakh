import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReceivingOrder, createReceivingOrder, confirmReceivingOrder, deleteReceivingOrder, cancelReceivingOrder, reopenReceivingOrder, updateReceivingItems } from '../../api/receiving'
import { fetchSuppliers } from '../../api/suppliers'
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle, RotateCcw, Edit2 } from 'lucide-react'
import PartSearch from '../../components/PartSearch'
import type { Part } from '../../types'
import toast from 'react-hot-toast'
import { useT } from '../../i18n'
import { qtyStep, qtyMin } from '../../utils/format'
import { canAdmin, canWarehouse } from '../../store/permissions'
import { getUser } from '../../store/auth'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useAutoSave } from '../../hooks/useAutoSave'
import KeyHints from '../../components/KeyHints'

interface LineItem { part: Part; quantity: number; notes: string }

export default function ReceivingForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useT()

  const { data: existing } = useQuery({
    queryKey: ['receiving-order', id],
    queryFn: () => fetchReceivingOrder(Number(id)),
    enabled: !isNew,
  })

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: fetchSuppliers })

  const me = getUser()
  const isAdmin = me ? canAdmin(me.role) : false
  const isWarehouse = me ? canWarehouse(me.role) : false
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<LineItem[]>([])

  const [supplierId, setSupplierId] = useState<string>('')
  const [invoiceNum, setInvoiceNum] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(false)
  // Raw display strings for qty inputs (avoids losing "0." while typing)
  const [qtyDisplay, setQtyDisplay] = useState<Record<string, string>>({})
  const searchRef = useRef<HTMLInputElement | null>(null)

  function addPart(part: Part) {
    const existing = items.find(i => i.part.id === part.id)
    if (existing) {
      setItems(prev => prev.map(i =>
        i.part.id === part.id ? { ...i, quantity: Math.round((i.quantity + (part.default_issue_qty ?? 1)) * 1000) / 1000 } : i
      ))
      toast.success(`${part.name}: ${Math.round((existing.quantity + (part.default_issue_qty ?? 1)) * 1000) / 1000} ${part.unit}`, { duration: 1200, icon: '📦' })
      return
    }
    setItems(prev => [...prev, { part, quantity: part.default_issue_qty ?? 1, notes: '' }])
    toast.success(`+ ${part.name}: ${part.default_issue_qty ?? 1} ${part.unit}`, { duration: 1200 })
  }

  async function handleCopy() {
    if (!existing || existing.items.length === 0) return
    setLoading(true)
    try {
      const copy = await createReceivingOrder({
        supplier_id: existing.supplier_id || undefined,
        invoice_number: existing.invoice_number ? `${existing.invoice_number}-copy` : undefined,
        notes: existing.notes || undefined,
        items: existing.items.map(i => ({ part_id: i.part_id, quantity: i.quantity })),
      })
      toast.success('Копия создана')
      qc.invalidateQueries({ queryKey: ['receiving'] })
      navigate(`/receiving/${copy.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  useKeyboardShortcuts({
    insert: () => document.querySelector<HTMLInputElement>('.part-search-input')?.focus(),
    ctrlEnter: () => {
      if (isNew) { handleSave(); return }
      if (existing && !existing.is_confirmed && !existing.is_cancelled && isWarehouse) handleConfirmDirect()
    },
    f9: () => { if (!isNew && existing) handleCopy() },
  })

  async function handleConfirmDirect() {
    if (!existing) return
    setLoading(true)
    try {
      await confirmReceivingOrder(existing.id)
      toast.success(t('rec_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  // Auto-save trigger: changes to items or form fields
  const autoSaveTrigger = JSON.stringify({ items: items.map(i => i.part.id + ':' + i.quantity), supplierId, invoiceNum })
  const autoSaveStatus = useAutoSave(
    autoSaveTrigger,
    async () => { if (items.length > 0) await handleSave() },
    isNew && items.length > 0,
  )

  async function handleSave() {
    if (items.length === 0) { toast.error(t('err_no_items')); return }
    setLoading(true)
    try {
      const order = await createReceivingOrder({
        supplier_id: supplierId ? parseInt(supplierId) : undefined,
        invoice_number: invoiceNum || undefined,
        notes: notes || undefined,
        items: items.map(i => ({ part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined })),
      })
      toast.success(t('rec_draft_created'))
      qc.invalidateQueries({ queryKey: ['receiving'] })
      navigate(`/receiving/${order.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!existing || existing.is_confirmed) return
    if (!confirm(t('rec_confirm_title'))) return
    setLoading(true)
    try {
      await confirmReceivingOrder(existing.id)
      toast.success(t('rec_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!existing || !confirm(t('rec_delete_confirm'))) return
    try {
      await deleteReceivingOrder(existing.id)
      navigate('/receiving')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleCancel() {
    if (!existing || !confirm(t('rec_cancel_confirm'))) return
    setLoading(true)
    try {
      await cancelReceivingOrder(existing.id)
      toast.success(t('rec_cancelled_toast'))
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleReopen() {
    if (!existing || !confirm(t('rec_reopen_confirm'))) return
    setLoading(true)
    try {
      await reopenReceivingOrder(existing.id)
      toast.success(t('rec_reopened_toast'))
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!existing || editItems.length === 0) { toast.error(t('err_no_items')); return }
    setLoading(true)
    try {
      await updateReceivingItems(existing.id, editItems.map(i => ({ part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined })))
      toast.success(t('parts_saved'))
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  if (!isNew && !existing) return <div className="text-center py-16 text-gray-400">{t('rec_loading')}</div>

  // View existing order
  if (!isNew && existing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('rec_title')} #{existing.id}</h1>
            <div className="text-sm text-gray-500">
              {new Date(existing.date).toLocaleDateString('ru-RU')} · {existing.created_by_name}
            </div>
          </div>
          <div className="ml-auto">
            {existing.is_cancelled ? (
              <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> {t('rec_status_cancelled')}
              </span>
            ) : existing.is_confirmed ? (
              <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> {t('status_confirmed')}
              </span>
            ) : (
              <span className="badge bg-yellow-100 text-yellow-700">{t('status_draft')}</span>
            )}
          </div>
        </div>

        <div className="card p-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">{t('lbl_supplier')}:</span> <span className="font-medium">{existing.supplier_name || '—'}</span></div>
          <div><span className="text-gray-500">{t('rec_invoice')}:</span> <span className="font-mono font-medium">{existing.invoice_number || '—'}</span></div>
          {existing.notes && <div className="sm:col-span-2"><span className="text-gray-500">{t('lbl_notes')}:</span> {existing.notes}</div>}
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
                  <td className="table-td">
                    <div className="font-medium">{item.part_name}</div>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {item.oem_number && (
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {item.oem_number}
                        </span>
                      )}
                      {item.barcode && (
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          ▌{item.barcode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-td text-right font-semibold text-green-700">+{item.quantity}</td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{item.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="table-td font-semibold" colSpan={3}>{t('rec_total_positions')}: {existing.items.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Draft actions */}
        {!existing.is_confirmed && !existing.is_cancelled && isWarehouse && (
          <div className="flex gap-3 justify-end flex-wrap">
            {isAdmin && (
              <button className="btn-secondary" onClick={() => { setEditMode(true); setEditItems(existing.items.map(i => ({ part: { id: i.part_id, name: i.part_name, stock_qty: 0, unit: 'шт', min_stock: 0, track_min_stock: false, default_issue_qty: 1, barcodes: [], oem_numbers: [], car_applications: [], created_at: '' }, quantity: i.quantity, notes: i.notes || '' }))) }}>
                <Edit2 className="w-4 h-4" /> {t('btn_edit')}
              </button>
            )}
            <button className="btn-danger" onClick={handleDelete}>{t('rec_delete_draft')}</button>
            <button className="btn-success" onClick={handleConfirm} disabled={loading}>
              <CheckCircle className="w-4 h-4" /> {t('rec_confirm_btn')}
            </button>
          </div>
        )}

        {/* Confirmed — admin can cancel */}
        {existing.is_confirmed && isAdmin && (
          <div className="flex gap-3 justify-end">
            <button className="btn-danger" onClick={handleCancel} disabled={loading}>
              <XCircle className="w-4 h-4" /> {t('rec_cancel_btn')}
            </button>
          </div>
        )}

        {/* Cancelled — admin can reopen for editing */}
        {existing.is_cancelled && isAdmin && (
          <div className="space-y-4">
            {existing.cancelled_by_name && (
              <p className="text-sm text-gray-500 text-right">
                {t('rec_cancelled_by')}: <strong>{existing.cancelled_by_name}</strong>
                {existing.cancelled_at && ` · ${new Date(existing.cancelled_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}`}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={handleReopen} disabled={loading}>
                <RotateCcw className="w-4 h-4" /> {t('rec_reopen_btn')}
              </button>
            </div>
          </div>
        )}

        {/* Edit mode (for draft after reopen) */}
        {editMode && !existing.is_confirmed && !existing.is_cancelled && (
          <div className="card p-6 space-y-4 border-2 border-blue-200">
            <h2 className="font-semibold text-blue-700 flex items-center gap-2"><Edit2 className="w-4 h-4" /> {t('rec_items_title')}</h2>
            <PartSearch onSelect={p => {
              const defQty = p.default_issue_qty ?? 1
              const ex = editItems.find(i => i.part.id === p.id)
              if (ex) setEditItems(prev => prev.map(i => i.part.id === p.id ? { ...i, quantity: Math.round((i.quantity + defQty) * 1000) / 1000 } : i))
              else setEditItems(prev => [...prev, { part: p, quantity: defQty, notes: '' }])
            }} />
            {editItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="flex-1 text-sm font-medium">{item.part.name}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input w-20 text-right"
                    value={qtyDisplay[`edit-${idx}-${item.part.id}`] ?? String(item.quantity)}
                    onChange={e => {
                      const raw = e.target.value.replace(',', '.')
                      setQtyDisplay(prev => ({ ...prev, [`edit-${idx}-${item.part.id}`]: raw }))
                      const val = parseFloat(raw)
                      if (!isNaN(val) && val > 0)
                        setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it))
                    }}
                    onBlur={e => {
                      const raw = e.target.value.replace(',', '.')
                      const val = parseFloat(raw)
                      const final = (!isNaN(val) && val > 0) ? val : item.quantity
                      setQtyDisplay(prev => ({ ...prev, [`edit-${idx}-${item.part.id}`]: String(final) }))
                      setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: final } : it))
                    }}
                  />
                  <span className="text-xs text-gray-500">{item.part.unit}</span>
                </div>
                <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))} className="p-1 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setEditMode(false)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleSaveEdit} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // New form
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-2xl font-bold text-gray-900">{t('rec_new')}</h1>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('rec_data_title')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('lbl_supplier')}</label>
            <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">{t('rec_no_supplier')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('lbl_invoice')}</label>
            <input className="input font-mono" placeholder="12345" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('lbl_notes')}</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('rec_items_title')}</h2>
        <div className="part-search-wrapper">
          <PartSearch onSelect={addPart} placeholder={t('rec_add_part_placeholder')} />
        </div>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">{t('lbl_name')}</th>
                  <th className="table-th w-28 text-right">{t('lbl_quantity')}</th>
                  <th className="table-th hidden sm:table-cell">{t('lbl_notes')}</th>
                  <th className="table-th w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="table-td">
                      <div className="font-medium">{item.part.name}</div>
                      <div className="text-xs text-gray-500">{item.part.brand}</div>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          className="input text-right w-20"
                          value={qtyDisplay[`${idx}-${item.part.id}`] ?? String(item.quantity)}
                          onChange={e => {
                            const raw = e.target.value.replace(',', '.')
                            setQtyDisplay(prev => ({ ...prev, [`${idx}-${item.part.id}`]: raw }))
                            const val = parseFloat(raw)
                            if (!isNaN(val) && val >= 0)
                              setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it))
                          }}
                          onBlur={e => {
                            const raw = e.target.value.replace(',', '.')
                            const val = parseFloat(raw)
                            const final = (!isNaN(val) && val > 0) ? val : item.quantity
                            setQtyDisplay(prev => ({ ...prev, [`${idx}-${item.part.id}`]: String(final) }))
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: final } : it))
                          }}
                        />
                        <span className="text-xs text-gray-500 shrink-0">{item.part.unit}</span>
                      </div>
                    </td>
                    <td className="table-td hidden sm:table-cell">
                      <input type="text" className="input" placeholder={t('rec_optional_note')} value={item.notes}
                        onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))} />
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
                  <td className="table-td font-semibold" colSpan={4}>{t('rec_total_positions')}: {items.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">{t('rec_no_items')}</div>
        )}
      </div>

      <div className="flex justify-end gap-3 items-center">
        {autoSaveStatus === 'pending' && items.length > 0 && (
          <span className="text-xs text-gray-400">Автосохранение через 10с...</span>
        )}
        {autoSaveStatus === 'saving' && (
          <span className="text-xs text-blue-500">Сохраняю...</span>
        )}
        {autoSaveStatus === 'saved' && (
          <span className="text-xs text-green-600">✓ Сохранено</span>
        )}
        <button className="btn-secondary" onClick={() => navigate('/receiving')}>{t('btn_cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={loading || items.length === 0}>
          {t('rec_create_draft')}
        </button>
      </div>
      <KeyHints hints={[
        { key: 'Insert', label: t('rec_add_part_placeholder').slice(0, 20) + '...' },
        { key: 'Ctrl+Enter', label: t('rec_create_draft') },
      ]} />
    </div>
  )
}
