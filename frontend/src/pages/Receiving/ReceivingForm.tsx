import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchReceivingOrder, createReceivingOrder, confirmReceivingOrder,
  deleteReceivingOrder, cancelReceivingOrder, reopenReceivingOrder, updateReceivingItems
} from '../../api/receiving'
import { fetchSuppliers } from '../../api/suppliers'
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle, RotateCcw, Save } from 'lucide-react'
import PartSearch from '../../components/PartSearch'
import type { Part } from '../../types'
import toast from 'react-hot-toast'
import { useT } from '../../i18n'
import { canAdmin, canWarehouse } from '../../store/permissions'
import { getUser } from '../../store/auth'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import KeyHints from '../../components/KeyHints'

interface LineItem { part: Part; quantity: number; notes: string }

// Minimal Part stub used when reconstructing items from existing order
function stubPart(id: number, name: string, unit = 'шт'): Part {
  return { id, name, unit, brand: '', category: '', location: '', min_stock: 0, track_min_stock: false, default_issue_qty: 1, stock_qty: 0, barcodes: [], oem_numbers: [], car_applications: [], created_at: '' }
}

export default function ReceivingForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useT()

  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ['receiving-order', id],
    queryFn: () => fetchReceivingOrder(Number(id)),
    enabled: !isNew,
  })

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: fetchSuppliers })

  const me = getUser()
  const isAdmin = me ? canAdmin(me.role) : false
  const isWarehouse = me ? canWarehouse(me.role) : false

  // ─── New order state ───────────────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNum, setInvoiceNum] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])

  // ─── Draft editing state (existing order) ─────────────────────────────────
  const [draftItems, setDraftItems] = useState<LineItem[]>([])
  const [draftInitialized, setDraftInitialized] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [loading, setLoading] = useState(false)
  const [qtyDisplay, setQtyDisplay] = useState<Record<string, string>>({})

  // Initialize draftItems when existing draft loads
  useEffect(() => {
    if (!isNew && existing && !existing.is_confirmed && !existing.is_cancelled && !draftInitialized) {
      setDraftItems(existing.items.map(i => ({
        part: stubPart(i.part_id, i.part_name, i.part_unit || 'шт'),
        quantity: i.quantity,
        notes: i.notes || '',
      })))
      setDraftInitialized(true)
    }
  }, [existing, isNew, draftInitialized])

  // Auto-save draftItems after 1.5s of no changes
  const autoSaveDraft = useCallback(async (newItems: LineItem[]) => {
    if (!existing || existing.is_confirmed || existing.is_cancelled) return
    clearTimeout(saveTimer.current)
    setSaveStatus('idle')
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await updateReceivingItems(existing.id, newItems.map(i => ({
          part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined
        })))
        qc.invalidateQueries({ queryKey: ['receiving-order', id] })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (err: any) {
        setSaveStatus('idle')
        toast.error(err.response?.data?.detail || t('err_generic'))
      }
    }, 1500)
  }, [existing, id, qc, t])

  function updateDraftItems(newItems: LineItem[]) {
    setDraftItems(newItems)
    autoSaveDraft(newItems)
  }

  function addPartToDraft(part: Part) {
    const defQty = part.default_issue_qty ?? 1
    const ex = draftItems.find(i => i.part.id === part.id)
    const newItems = ex
      ? draftItems.map(i => i.part.id === part.id
          ? { ...i, quantity: Math.round((i.quantity + defQty) * 1000) / 1000 }
          : i)
      : [...draftItems, { part, quantity: defQty, notes: '' }]
    const updated = ex
      ? Math.round((ex.quantity + defQty) * 1000) / 1000
      : defQty
    toast.success(`${ex ? '' : '+ '}${part.name}: ${updated} ${part.unit}`, { duration: 1200, icon: '📦' })
    updateDraftItems(newItems)
  }

  function addPartToNew(part: Part) {
    const defQty = part.default_issue_qty ?? 1
    const ex = items.find(i => i.part.id === part.id)
    if (ex) {
      const newQty = Math.round((ex.quantity + defQty) * 1000) / 1000
      setItems(prev => prev.map(i => i.part.id === part.id ? { ...i, quantity: newQty } : i))
      toast.success(`${part.name}: ${newQty} ${part.unit}`, { duration: 1200, icon: '📦' })
      return
    }
    setItems(prev => [...prev, { part, quantity: defQty, notes: '' }])
    toast.success(`+ ${part.name}: ${defQty} ${part.unit}`, { duration: 1200 })
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  async function handleSaveNew() {
    if (items.length === 0) { toast.error(t('err_no_items')); return }
    setLoading(true)
    try {
      const order = await createReceivingOrder({
        supplier_id: supplierId ? parseInt(supplierId) : undefined,
        invoice_number: invoiceNum || undefined,
        notes: orderNotes || undefined,
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

  async function handleSaveDraftNow() {
    if (!existing || draftItems.length === 0) return
    clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    try {
      await updateReceivingItems(existing.id, draftItems.map(i => ({
        part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined
      })))
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      toast.success(t('parts_saved'))
    } catch (err: any) {
      setSaveStatus('idle')
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleConfirm() {
    if (!existing || existing.is_confirmed) return
    // Save any pending changes first
    clearTimeout(saveTimer.current)
    setLoading(true)
    try {
      if (draftItems.length > 0) {
        await updateReceivingItems(existing.id, draftItems.map(i => ({
          part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined
        })))
      }
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
      setDraftInitialized(false) // re-init from fresh data
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
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
    insert: () => document.querySelector<HTMLInputElement>('.part-search-wrapper input')?.focus(),
    ctrlEnter: () => {
      if (isNew) { handleSaveNew(); return }
      if (existing && !existing.is_confirmed && !existing.is_cancelled && isWarehouse) handleConfirm()
    },
    f9: () => { if (!isNew && existing) handleCopy() },
  })

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!isNew && existingLoading) return <div className="text-center py-16 text-gray-400">{t('rec_loading')}</div>
  if (!isNew && !existing) return <div className="text-center py-16 text-gray-400">{t('rec_loading')}</div>

  // View/Edit existing order
  if (!isNew && existing) {
    const isDraft = !existing.is_confirmed && !existing.is_cancelled
    const displayItems = isDraft ? draftItems : existing.items

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{t('rec_title')} #{existing.id}</h1>
            <div className="text-sm text-gray-500">
              {new Date(existing.date).toLocaleDateString('ru-RU')} · {existing.created_by_name}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && <span className="text-xs text-blue-500">{t('autosave_saving')}</span>}
            {saveStatus === 'saved' && <span className="text-xs text-green-600">{t('autosave_saved')}</span>}
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

        {/* Order metadata */}
        <div className="card p-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">{t('lbl_supplier')}:</span> <span className="font-medium">{existing.supplier_name || '—'}</span></div>
          <div><span className="text-gray-500">{t('rec_invoice')}:</span> <span className="font-mono font-medium">{existing.invoice_number || '—'}</span></div>
          {existing.notes && <div className="sm:col-span-2"><span className="text-gray-500">{t('lbl_notes')}:</span> {existing.notes}</div>}
        </div>

        {/* Items — always editable for draft */}
        <div className="card overflow-hidden">
          {isDraft && isWarehouse && (
            <div className="px-6 py-4 border-b border-gray-100 bg-blue-50">
              <div className="part-search-wrapper">
                <PartSearch
                  onSelect={addPartToDraft}
                  placeholder={t('rec_add_part_placeholder')}
                  autoFocus
                />
              </div>
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th w-28 text-right">{t('lbl_quantity')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_notes')}</th>
                {isDraft && isWarehouse && <th className="table-th w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayItems.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center text-gray-400 py-8">{t('rec_no_items')}</td></tr>
              ) : isDraft ? (
                // Editable rows for draft
                draftItems.map((item, idx) => (
                  <tr key={`${item.part.id}-${idx}`}>
                    <td className="table-td">
                      <div className="font-medium text-sm">{item.part.name}</div>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          min="0"
                          step={item.part.default_issue_qty ?? 0.05}
                          className="input text-right w-20 text-green-700 font-semibold"
                          key={`${item.part.id}-${item.quantity}`}
                          defaultValue={item.quantity}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v > 0 && v !== item.quantity) {
                              const newItems = draftItems.map((it, i) => i === idx ? { ...it, quantity: v } : it)
                              updateDraftItems(newItems)
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        />
                        <span className="text-xs text-gray-500 shrink-0">{item.part.unit}</span>
                      </div>
                    </td>
                    <td className="table-td hidden sm:table-cell">
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder={t('rec_optional_note')}
                        value={item.notes}
                        onChange={e => {
                          const newItems = draftItems.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it)
                          updateDraftItems(newItems)
                        }}
                      />
                    </td>
                    {isWarehouse && (
                      <td className="table-td">
                        <button
                          onClick={() => updateDraftItems(draftItems.filter((_, i) => i !== idx))}
                          className="p-1 text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                // Read-only rows for confirmed/cancelled
                existing.items.map(item => (
                  <tr key={item.id}>
                    <td className="table-td">
                      <div className="font-medium">{item.part_name}</div>
                      {item.barcode && (
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                          ▌{item.barcode}
                        </span>
                      )}
                    </td>
                    <td className="table-td text-right font-semibold text-green-700">+{item.quantity}</td>
                    <td className="table-td hidden sm:table-cell text-gray-500">{item.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="table-td font-semibold text-sm" colSpan={isDraft && isWarehouse ? 4 : 3}>
                  {t('rec_total_positions')}: {isDraft ? draftItems.length : existing.items.length}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Draft actions */}
        {isDraft && isWarehouse && (
          <div className="flex gap-3 justify-end flex-wrap items-center">
            {saveStatus === 'idle' && draftItems.length > 0 && (
              <button className="btn-secondary text-xs py-1.5" onClick={handleSaveDraftNow}>
                <Save className="w-3.5 h-3.5" /> {t('btn_save')}
              </button>
            )}
            <button className="btn-danger" onClick={handleDelete}>{t('rec_delete_draft')}</button>
            <button className="btn-success" onClick={handleConfirm} disabled={loading || draftItems.length === 0}>
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

        {/* Cancelled — admin can reopen */}
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

        <KeyHints hints={[
          { key: 'Insert', label: t('rec_add_part_placeholder').slice(0, 20) + '...' },
          ...(isDraft && isWarehouse ? [{ key: 'Ctrl+Enter', label: t('rec_confirm_btn') }] : []),
          { key: 'F9', label: t('btn_copy') },
        ]} />
      </div>
    )
  }

  // ─── New order form ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
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
            <input className="input" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('rec_items_title')}</h2>
        <div className="part-search-wrapper">
          <PartSearch onSelect={addPartToNew} placeholder={t('rec_add_part_placeholder')} autoFocus />
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
                      {item.part.brand && <div className="text-xs text-gray-500">{item.part.brand}</div>}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          min="0"
                          step={item.part.default_issue_qty ?? 0.05}
                          className="input text-right w-20 text-green-700 font-semibold"
                          defaultValue={item.quantity}
                          key={`new-${idx}-${item.quantity}`}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v > 0)
                              setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v } : it))
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
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

      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={() => navigate('/receiving')}>{t('btn_cancel')}</button>
        <button className="btn-primary" onClick={handleSaveNew} disabled={loading || items.length === 0}>
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
