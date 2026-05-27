import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReceivingOrder, createReceivingOrder, confirmReceivingOrder, deleteReceivingOrder } from '../../api/receiving'
import { fetchSuppliers } from '../../api/suppliers'
import { ArrowLeft, Plus, Trash2, CheckCircle } from 'lucide-react'
import PartSearch from '../../components/PartSearch'
import type { Part } from '../../types'
import toast from 'react-hot-toast'
import { useT } from '../../i18n'

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

  const [supplierId, setSupplierId] = useState<string>('')
  const [invoiceNum, setInvoiceNum] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(false)

  function addPart(part: Part) {
    if (items.find(i => i.part.id === part.id)) {
      toast(t('rec_already_added'), { icon: 'ℹ️' })
      return
    }
    setItems(prev => [...prev, { part, quantity: 1, notes: '' }])
  }

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
            {existing.is_confirmed
              ? <span className="badge bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {t('status_confirmed')}</span>
              : <span className="badge bg-yellow-100 text-yellow-700">{t('status_draft')}</span>
            }
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
                  <td className="table-td font-medium">{item.part_name}</td>
                  <td className="table-td text-right font-semibold text-green-700">+{item.quantity}</td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{item.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="table-td font-semibold">{t('rec_total_positions')}: {existing.items.length}</td>
                <td className="table-td text-right font-bold text-green-700">
                  +{existing.items.reduce((s, i) => s + i.quantity, 0)} {t('lbl_pieces')}
                </td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>

        {!existing.is_confirmed && (
          <div className="flex gap-3 justify-end">
            <button className="btn-danger" onClick={handleDelete}>{t('rec_delete_draft')}</button>
            <button className="btn-success" onClick={handleConfirm} disabled={loading}>
              <CheckCircle className="w-4 h-4" /> {t('rec_confirm_btn')}
            </button>
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
        <PartSearch onSelect={addPart} placeholder={t('rec_add_part_placeholder')} />

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
                      <input type="number" min="1" className="input text-right w-24" value={item.quantity}
                        onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))} />
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
                  <td className="table-td font-semibold">{t('rec_total_positions')}: {items.length}</td>
                  <td className="table-td text-right font-bold text-green-700">
                    {items.reduce((s, i) => s + i.quantity, 0)} {t('lbl_pieces')}
                  </td>
                  <td className="hidden sm:table-cell" /><td />
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
        <button className="btn-primary" onClick={handleSave} disabled={loading || items.length === 0}>
          {t('rec_create_draft')}
        </button>
      </div>
    </div>
  )
}
