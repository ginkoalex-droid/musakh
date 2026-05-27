import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPart, createPart, updatePart, addBarcode, deleteBarcode, addOem, deleteOem } from '../../api/parts'
import { ArrowLeft, Plus, Trash2, ScanLine } from 'lucide-react'
import toast from 'react-hot-toast'

const UNITS = ['шт', 'л', 'кг', 'м', 'компл', 'пара', 'набор']
const CATEGORIES = ['Фильтры', 'Тормоза', 'Подвеска', 'Двигатель', 'Трансмиссия', 'Электрика', 'Кузов', 'Расходники', 'Масла', 'Прочее']

export default function PartForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: ['part', id],
    queryFn: () => fetchPart(Number(id)),
    enabled: !isNew,
  })

  const [form, setForm] = useState({
    name: '', brand: '', category: '', unit: 'шт',
    min_stock: 0, location: '', notes: '',
  })
  const [barcodes, setBarcodes] = useState<string[]>([''])
  const [oems, setOems] = useState<{ oem_number: string; brand: string }[]>([{ oem_number: '', brand: '' }])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        brand: existing.brand || '',
        category: existing.category || '',
        unit: existing.unit,
        min_stock: existing.min_stock,
        location: existing.location || '',
        notes: existing.notes || '',
      })
    }
  }, [existing])

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Введите название'); return }
    setLoading(true)
    try {
      if (isNew) {
        const part = await createPart({
          name: form.name,
          brand: form.brand || undefined,
          category: form.category || undefined,
          unit: form.unit,
          min_stock: form.min_stock,
          location: form.location || undefined,
          notes: form.notes || undefined,
          barcodes: barcodes.filter(b => b.trim()),
          oem_numbers: oems.filter(o => o.oem_number.trim()),
        })
        toast.success('Запчасть создана')
        navigate(`/parts/${part.id}`)
      } else if (existing) {
        await updatePart(existing.id, form)
        toast.success('Сохранено')
        qc.invalidateQueries({ queryKey: ['part', id] })
        qc.invalidateQueries({ queryKey: ['parts'] })
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddBarcode(bc: string) {
    if (!bc.trim() || !existing) return
    try {
      await addBarcode(existing.id, bc.trim())
      toast.success('Штрихкод добавлен')
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    }
  }

  async function handleDelBarcode(partId: number, bcId: number) {
    try {
      await deleteBarcode(partId, bcId)
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    }
  }

  async function handleAddOem(oem: string, brand: string) {
    if (!oem.trim() || !existing) return
    try {
      await addOem(existing.id, oem, brand || undefined)
      toast.success('OEM добавлен')
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    }
  }

  async function handleDelOem(partId: number, oemId: number) {
    try {
      await deleteOem(partId, oemId)
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    }
  }

  const [newBc, setNewBc] = useState('')
  const [newOemNum, setNewOemNum] = useState('')
  const [newOemBrand, setNewOemBrand] = useState('')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary py-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'Новая запчасть' : (existing?.name || 'Загрузка...')}
        </h1>
      </div>

      {!isNew && existing && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">Текущий остаток</span>
          <span className={`text-2xl font-bold ${existing.stock_qty <= existing.min_stock ? 'text-red-600' : 'text-green-600'}`}>
            {existing.stock_qty} {existing.unit}
          </span>
        </div>
      )}

      {/* Main fields */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">Основные данные</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Название *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">Бренд</label>
            <input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          </div>
          <div>
            <label className="label">Категория</label>
            <input list="cats" className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <datalist id="cats">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label">Единица измерения</label>
            <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Минимальный остаток</label>
            <input type="number" min="0" className="input" value={form.min_stock}
              onChange={e => setForm(f => ({ ...f, min_stock: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Место на складе</label>
            <input className="input" placeholder="Полка A3, ящик 5..." value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Примечание</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        {/* New part barcodes & OEM inline */}
        {isNew && (
          <>
            <div>
              <label className="label">Штрихкоды (можно несколько)</label>
              {barcodes.map((bc, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="input font-mono" value={bc} onChange={e => {
                    const next = [...barcodes]; next[i] = e.target.value; setBarcodes(next)
                  }} placeholder="Сканируй или введи" />
                  {i > 0 && (
                    <button type="button" onClick={() => setBarcodes(b => b.filter((_, j) => j !== i))} className="btn-secondary py-1.5 px-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setBarcodes(b => [...b, ''])} className="btn-secondary text-xs">
                <Plus className="w-3.5 h-3.5" /> Ещё штрихкод
              </button>
            </div>
            <div>
              <label className="label">OEM-номера</label>
              {oems.map((oem, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="input font-mono" placeholder="OEM номер" value={oem.oem_number}
                    onChange={e => { const next = [...oems]; next[i].oem_number = e.target.value; setOems(next) }} />
                  <input className="input w-32" placeholder="Бренд" value={oem.brand}
                    onChange={e => { const next = [...oems]; next[i].brand = e.target.value; setOems(next) }} />
                  {i > 0 && (
                    <button type="button" onClick={() => setOems(o => o.filter((_, j) => j !== i))} className="btn-secondary py-1.5 px-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setOems(o => [...o, { oem_number: '', brand: '' }])} className="btn-secondary text-xs">
                <Plus className="w-3.5 h-3.5" /> Ещё OEM
              </button>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <button className="btn-primary" onClick={handleSave} disabled={loading}>Сохранить</button>
        </div>
      </div>

      {/* Existing part: barcodes management */}
      {!isNew && existing && (
        <>
          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <ScanLine className="w-4 h-4" /> Штрихкоды
            </h2>
            {existing.barcodes.map(bc => (
              <div key={bc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-mono text-sm">{bc.barcode}</span>
                <div className="flex items-center gap-2">
                  {bc.is_primary && <span className="badge bg-blue-100 text-blue-700">основной</span>}
                  <button onClick={() => handleDelBarcode(existing.id, bc.id)} className="p-1 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input font-mono" placeholder="Новый штрихкод" value={newBc} onChange={e => setNewBc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { handleAddBarcode(newBc); setNewBc('') } }} />
              <button className="btn-secondary" onClick={() => { handleAddBarcode(newBc); setNewBc('') }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-700">OEM-номера</h2>
            {existing.oem_numbers.map(oem => (
              <div key={oem.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <span className="font-mono text-sm">{oem.oem_number}</span>
                  {oem.brand && <span className="text-xs text-gray-500 ml-2">{oem.brand}</span>}
                </div>
                <button onClick={() => handleDelOem(existing.id, oem.id)} className="p-1 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input font-mono" placeholder="OEM номер" value={newOemNum} onChange={e => setNewOemNum(e.target.value)} />
              <input className="input w-32" placeholder="Бренд" value={newOemBrand} onChange={e => setNewOemBrand(e.target.value)} />
              <button className="btn-secondary" onClick={() => { handleAddOem(newOemNum, newOemBrand); setNewOemNum(''); setNewOemBrand('') }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
