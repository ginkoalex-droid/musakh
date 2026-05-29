import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPart, createPart, updatePart, addBarcode, deleteBarcode, addOem, deleteOem, addCarApplication, deleteCarApplication, fetchCategories } from '../../api/parts'
import { ArrowLeft, Plus, Trash2, ScanLine, Car } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '../../i18n'

const UNITS = ['шт', 'л', 'кг', 'м', 'компл', 'пара', 'набор']
const DEFAULT_CATEGORIES = ['Filters', 'Brakes', 'Suspension', 'Engine', 'Transmission', 'Electrical', 'Wheels & Tyres', 'Chain & Sprockets', 'Exhaust', 'Body & Fairings', 'Oils & Fluids', 'Consumables', 'Other']

export default function PartForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { t } = useT()
  // Pre-fill barcode when coming from unknown scan
  const prefillBarcode = (location.state as any)?.barcode as string | undefined

  const { data: existing } = useQuery({
    queryKey: ['part', id],
    queryFn: () => fetchPart(Number(id)),
    enabled: !isNew,
  })

  const { data: existingCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  // Merge hardcoded defaults with existing DB categories, deduplicated
  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...existingCategories]))

  const [form, setForm] = useState({
    name: '', brand: '', category: '', unit: 'шт',
    min_stock: 0, location: '', notes: '',
  })
  const [barcodes, setBarcodes] = useState<string[]>([prefillBarcode || ''])
  const [oems, setOems] = useState<{ oem_number: string; brand: string }[]>([{ oem_number: '', brand: '' }])
  const [loading, setLoading] = useState(false)
  const [newBc, setNewBc] = useState('')
  const [newOemNum, setNewOemNum] = useState('')
  const [newOemBrand, setNewOemBrand] = useState('')
  const [newCarMake, setNewCarMake] = useState('')
  const [newCarModel, setNewCarModel] = useState('')

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
    if (!form.name.trim()) { toast.error(t('err_no_name')); return }
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
        toast.success(t('parts_created'))
        navigate(`/parts/${part.id}`)
      } else if (existing) {
        await updatePart(existing.id, form)
        toast.success(t('parts_saved'))
        qc.invalidateQueries({ queryKey: ['part', id] })
        qc.invalidateQueries({ queryKey: ['parts'] })
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddBarcode(bc: string) {
    if (!bc.trim() || !existing) return
    try {
      await addBarcode(existing.id, bc.trim())
      toast.success(t('parts_barcode_added'))
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleDelBarcode(partId: number, bcId: number) {
    try {
      await deleteBarcode(partId, bcId)
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleAddOem(oem: string, brand: string) {
    if (!oem.trim() || !existing) return
    try {
      await addOem(existing.id, oem, brand || undefined)
      toast.success(t('parts_oem_added'))
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleDelOem(partId: number, oemId: number) {
    try {
      await deleteOem(partId, oemId)
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleAddCar(make: string, model: string) {
    if (!make.trim() || !existing) return
    try {
      await addCarApplication(existing.id, make.trim(), model.trim() || undefined)
      toast.success(t('btn_add') + ' ✓')
      qc.invalidateQueries({ queryKey: ['part', id] })
      qc.invalidateQueries({ queryKey: ['makes'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  async function handleDelCar(partId: number, carId: number) {
    try {
      await deleteCarApplication(partId, carId)
      qc.invalidateQueries({ queryKey: ['part', id] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary py-1.5 px-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? t('parts_new_title') : (existing?.name || t('rec_loading'))}
        </h1>
      </div>

      {!isNew && existing && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">{t('lbl_current_stock')}</span>
          <span className={`text-2xl font-bold ${existing.stock_qty <= existing.min_stock ? 'text-red-600' : 'text-green-600'}`}>
            {existing.stock_qty} {existing.unit}
          </span>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('parts_basic_data')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">{t('lbl_name')} *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">{t('lbl_brand')}</label>
            <input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('lbl_category')}</label>
            <select
              className="input"
              value={allCategories.includes(form.category) ? form.category : '__custom__'}
              onChange={e => {
                if (e.target.value !== '__custom__') setForm(f => ({ ...f, category: e.target.value }))
              }}
            >
              <option value="">—</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              {form.category && !allCategories.includes(form.category) && (
                <option value="__custom__">{form.category}</option>
              )}
              <option value="__custom__">+ {t('btn_add')} свою...</option>
            </select>
            {/* Custom category input */}
            {(!form.category || !allCategories.includes(form.category)) && (
              <input
                className="input mt-1"
                placeholder="Введите категорию..."
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              />
            )}
          </div>
          <div>
            <label className="label">{t('lbl_unit')}</label>
            <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('lbl_min_stock')}</label>
            <input type="number" min="0" className="input" value={form.min_stock}
              onChange={e => setForm(f => ({ ...f, min_stock: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('lbl_location')}</label>
            <input className="input" placeholder={t('parts_shelf_placeholder')} value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('lbl_notes')}</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        {isNew && (
          <>
            <div>
              <label className="label">{t('parts_barcodes_title')}</label>
              {barcodes.map((bc, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="input font-mono" value={bc} onChange={e => {
                    const next = [...barcodes]; next[i] = e.target.value; setBarcodes(next)
                  }} placeholder={t('parts_scan_placeholder')} />
                  {i > 0 && (
                    <button type="button" onClick={() => setBarcodes(b => b.filter((_, j) => j !== i))} className="btn-secondary py-1.5 px-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setBarcodes(b => [...b, ''])} className="btn-secondary text-xs">
                <Plus className="w-3.5 h-3.5" /> {t('parts_add_barcode')}
              </button>
            </div>
            <div>
              <label className="label">{t('parts_oem_title')}</label>
              {oems.map((oem, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="input font-mono" placeholder={t('lbl_oem')} value={oem.oem_number}
                    onChange={e => { const next = [...oems]; next[i].oem_number = e.target.value; setOems(next) }} />
                  <input className="input w-32" placeholder={t('lbl_brand')} value={oem.brand}
                    onChange={e => { const next = [...oems]; next[i].brand = e.target.value; setOems(next) }} />
                  {i > 0 && (
                    <button type="button" onClick={() => setOems(o => o.filter((_, j) => j !== i))} className="btn-secondary py-1.5 px-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setOems(o => [...o, { oem_number: '', brand: '' }])} className="btn-secondary text-xs">
                <Plus className="w-3.5 h-3.5" /> {t('parts_add_oem')}
              </button>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <button className="btn-primary" onClick={handleSave} disabled={loading}>{t('btn_save')}</button>
        </div>
      </div>

      {!isNew && existing && (
        <>
          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <ScanLine className="w-4 h-4" /> {t('parts_barcodes_title')}
            </h2>
            {existing.barcodes.map(bc => (
              <div key={bc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-mono text-sm">{bc.barcode}</span>
                <div className="flex items-center gap-2">
                  {bc.is_primary && <span className="badge bg-blue-100 text-blue-700">{t('status_primary')}</span>}
                  <button onClick={() => handleDelBarcode(existing.id, bc.id)} className="p-1 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input font-mono" placeholder={t('parts_scan_placeholder')} value={newBc}
                onChange={e => setNewBc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { handleAddBarcode(newBc); setNewBc('') } }} />
              <button className="btn-secondary" onClick={() => { handleAddBarcode(newBc); setNewBc('') }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-700">{t('parts_oem_title')}</h2>
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
              <input className="input font-mono" placeholder={t('lbl_oem')} value={newOemNum} onChange={e => setNewOemNum(e.target.value)} />
              <input className="input w-32" placeholder={t('lbl_brand')} value={newOemBrand} onChange={e => setNewOemBrand(e.target.value)} />
              <button className="btn-secondary" onClick={() => { handleAddOem(newOemNum, newOemBrand); setNewOemNum(''); setNewOemBrand('') }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Car className="w-4 h-4 text-blue-600" /> {t('parts_cars_title')}
            </h2>
            {existing.car_applications.map(car => (
              <div key={car.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-blue-800">
                  {car.make}{car.model ? ` — ${car.model}` : ''}
                </span>
                <button onClick={() => handleDelCar(existing.id, car.id)} className="p-1 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input" placeholder={t('car_make_placeholder')} value={newCarMake}
                onChange={e => setNewCarMake(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { handleAddCar(newCarMake, newCarModel); setNewCarMake(''); setNewCarModel('') } }}
              />
              <input className="input" placeholder={`${t('car_model_placeholder')} (${t('rec_optional_note')})`} value={newCarModel}
                onChange={e => setNewCarModel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { handleAddCar(newCarMake, newCarModel); setNewCarMake(''); setNewCarModel('') } }}
              />
              <button className="btn-secondary" onClick={() => { handleAddCar(newCarMake, newCarModel); setNewCarMake(''); setNewCarModel('') }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
