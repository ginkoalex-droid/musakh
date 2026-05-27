import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReceivingOrder, createReceivingOrder, confirmReceivingOrder, deleteReceivingOrder } from '../../api/receiving'
import { fetchSuppliers } from '../../api/suppliers'
import { ArrowLeft, Plus, Trash2, CheckCircle } from 'lucide-react'
import PartSearch from '../../components/PartSearch'
import type { Part } from '../../types'
import toast from 'react-hot-toast'

interface LineItem {
  part: Part
  quantity: number
  notes: string
}

export default function ReceivingForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

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
    const existing = items.find(i => i.part.id === part.id)
    if (existing) {
      toast('Запчасть уже добавлена — увеличь количество', { icon: 'ℹ️' })
      return
    }
    setItems(prev => [...prev, { part, quantity: 1, notes: '' }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (items.length === 0) { toast.error('Добавьте хотя бы одну запчасть'); return }
    setLoading(true)
    try {
      const order = await createReceivingOrder({
        supplier_id: supplierId ? parseInt(supplierId) : undefined,
        invoice_number: invoiceNum || undefined,
        notes: notes || undefined,
        items: items.map(i => ({ part_id: i.part.id, quantity: i.quantity, notes: i.notes || undefined })),
      })
      toast.success('Приемка создана')
      qc.invalidateQueries({ queryKey: ['receiving'] })
      navigate(`/receiving/${order.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!existing || existing.is_confirmed) return
    if (!confirm('Провести приемку? После этого остатки на складе изменятся.')) return
    setLoading(true)
    try {
      await confirmReceivingOrder(existing.id)
      toast.success('Приемка проведена! Остатки обновлены.')
      qc.invalidateQueries({ queryKey: ['receiving'] })
      qc.invalidateQueries({ queryKey: ['receiving-order', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    if (!confirm('Удалить черновик приемки?')) return
    try {
      await deleteReceivingOrder(existing.id)
      toast.success('Удалено')
      navigate('/receiving')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    }
  }

  if (!isNew && !existing) {
    return <div className="text-center py-16 text-gray-400">Загрузка...</div>
  }

  // View existing order
  if (!isNew && existing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Приемка #{existing.id}</h1>
            <div className="text-sm text-gray-500">
              {new Date(existing.date).toLocaleDateString('ru-RU')} · {existing.created_by_name}
            </div>
          </div>
          <div className="ml-auto">
            {existing.is_confirmed ? (
              <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Проведено
              </span>
            ) : (
              <span className="badge bg-yellow-100 text-yellow-700">Черновик</span>
            )}
          </div>
        </div>

        <div className="card p-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Поставщик:</span> <span className="font-medium">{existing.supplier_name || '—'}</span></div>
          <div><span className="text-gray-500">Накладная:</span> <span className="font-mono font-medium">{existing.invoice_number || '—'}</span></div>
          {existing.notes && <div className="sm:col-span-2"><span className="text-gray-500">Примечание:</span> {existing.notes}</div>}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Запчасть</th>
                <th className="table-th text-right">Количество</th>
                <th className="table-th hidden sm:table-cell">Примечание</th>
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
                <td className="table-td font-semibold">Итого позиций: {existing.items.length}</td>
                <td className="table-td text-right font-bold text-green-700">
                  +{existing.items.reduce((s, i) => s + i.quantity, 0)} шт
                </td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>

        {!existing.is_confirmed && (
          <div className="flex gap-3 justify-end">
            <button className="btn-danger" onClick={handleDelete}>Удалить черновик</button>
            <button className="btn-success" onClick={handleConfirm} disabled={loading}>
              <CheckCircle className="w-4 h-4" /> Провести приемку
            </button>
          </div>
        )}
      </div>
    )
  }

  // New order form
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/receiving')} className="btn-secondary py-1.5 px-2"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-2xl font-bold text-gray-900">Новая приемка</h1>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">Данные поставки</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Поставщик</label>
            <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Без поставщика</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">№ накладной / счета</label>
            <input className="input font-mono" placeholder="12345" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Примечание</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">Позиции</h2>

        <PartSearch onSelect={addPart} placeholder="Сканируй штрихкод или ищи запчасть для добавления..." />

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Запчасть</th>
                  <th className="table-th w-28 text-right">Кол-во</th>
                  <th className="table-th hidden sm:table-cell">Примечание</th>
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
                      <input
                        type="number"
                        min="1"
                        className="input text-right w-24"
                        value={item.quantity}
                        onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))}
                      />
                    </td>
                    <td className="table-td hidden sm:table-cell">
                      <input
                        type="text"
                        className="input"
                        placeholder="Необязательно"
                        value={item.notes}
                        onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))}
                      />
                    </td>
                    <td className="table-td">
                      <button onClick={() => removeItem(idx)} className="p-1 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="table-td font-semibold">Итого: {items.length} поз.</td>
                  <td className="table-td text-right font-bold text-green-700">
                    {items.reduce((s, i) => s + i.quantity, 0)} шт
                  </td>
                  <td className="hidden sm:table-cell" /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Отсканируй штрихкод или найди запчасть выше чтобы добавить
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={() => navigate('/receiving')}>Отмена</button>
        <button className="btn-primary" onClick={handleSave} disabled={loading || items.length === 0}>
          Создать черновик
        </button>
      </div>
    </div>
  )
}
