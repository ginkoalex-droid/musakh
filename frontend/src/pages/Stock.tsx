import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchStock, adjustStock, issueParts, exportStock, exportMovements } from '../api/stock'
import { fetchCategories, fetchMakes, fetchModelsForMake } from '../api/parts'
import { AlertTriangle, Download, Settings, Minus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtQty } from '../utils/format'
import Modal from '../components/Modal'
import PartSearch from '../components/PartSearch'
import type { Part, StockRow } from '../types'
import toast from 'react-hot-toast'
import { useT } from '../i18n'
import { getUser } from '../store/auth'
import { canWarehouse } from '../store/permissions'

export default function Stock() {
  const qc = useQueryClient()
  const { t } = useT()
  const me = getUser()
  const isWarehouse = me ? canWarehouse(me.role) : false
  const [lowOnly, setLowOnly] = useState(false)
  const [needOrder, setNeedOrder] = useState(false)
  const [category, setCategory] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [adjustModal, setAdjustModal] = useState<StockRow | null>(null)
  const [issueModal, setIssueModal] = useState(false)
  const [issuePart, setIssuePart] = useState<Part | null>(null)
  const [issueQty, setIssueQty] = useState(1)
  const [issueWO, setIssueWO] = useState('')
  const [issueNote, setIssueNote] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useState<ReturnType<typeof setTimeout>>()[0]

  function handleSearch(val: string) {
    setSearch(val)
    clearTimeout(searchTimer as any)
    setTimeout(() => setDebouncedSearch(val), 300)
  }

  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['stock', lowOnly, category, make, model, debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch || make || model) {
        const { fetchParts } = await import('../api/parts')
        const parts = await fetchParts(
          debouncedSearch || undefined,
          category || undefined,
          false,
          make || undefined,
          model || undefined
        )
        const partIds = new Set(parts.map(p => p.id))
        const allStock = await fetchStock(lowOnly)
        return allStock.filter(s => partIds.has(s.part_id))
      }
      return fetchStock(lowOnly, category || undefined)
    },
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: makes = [] } = useQuery({ queryKey: ['makes'], queryFn: fetchMakes })
  const { data: models = [] } = useQuery({
    queryKey: ['models', make],
    queryFn: () => fetchModelsForMake(make),
    enabled: !!make,
  })

  async function handleAdjust() {
    if (!adjustModal) return
    const qty = parseInt(adjustQty)
    if (isNaN(qty) || qty < 0) { toast.error(t('err_invalid_qty')); return }
    if (!adjustNote.trim()) { toast.error(t('err_no_reason')); return }
    setLoading(true)
    try {
      await adjustStock(adjustModal.part_id, qty, adjustNote)
      toast.success(t('stock_adjusted'))
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustNote('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleIssue() {
    if (!issuePart) { toast.error(t('err_no_part')); return }
    if (issueQty <= 0) { toast.error(t('err_no_qty')); return }
    if (!issueWO.trim()) { toast.error(t('err_no_wo')); return }
    setLoading(true)
    try {
      await issueParts(issuePart.id, issueQty, issueWO, issueNote || undefined)
      toast.success(`${t('stock_issued')}: ${issuePart.name} × ${issueQty}`)
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setIssueModal(false)
      setIssuePart(null)
      setIssueQty(1)
      setIssueWO('')
      setIssueNote('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('stock_title')}</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIssueModal(true)} className="btn-danger">
            <Minus className="w-4 h-4" /> {t('stock_issue')}
          </button>
          {isWarehouse && <>
            <button onClick={exportStock} className="btn-secondary">
              <Download className="w-4 h-4" /> {t('stock_excel')}
            </button>
            <button onClick={exportMovements} className="btn-secondary">
              <Download className="w-4 h-4" /> {t('stock_movements_excel')}
            </button>
          </>}
        </div>
      </div>

      {/* Search by OEM / barcode / name */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Поиск по названию, OEM, штрихкоду..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); if (e.target.checked) setNeedOrder(false) }} className="rounded" />
          <AlertTriangle className="w-4 h-4 text-red-500" />
          {t('stock_low_only')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={needOrder} onChange={e => { setNeedOrder(e.target.checked); if (e.target.checked) setLowOnly(false) }} className="rounded" />
          <span className="text-orange-500">🛒</span>
          {t('stock_need_order')}
        </label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto">
          <option value="">{t('stock_all_categories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={make} onChange={e => { setMake(e.target.value); setModel('') }} className="input w-auto">
          <option value="">{t('filter_all_makes')}</option>
          {makes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {make && (
          <select value={model} onChange={e => setModel(e.target.value)} className="input w-auto">
            <option value="">{t('filter_all_models')}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th hidden md:table-cell">{t('parts_oem_barcodes')} / {t('lbl_cars')}</th>
                <th className="table-th hidden lg:table-cell">{t('lbl_category')}</th>
                <th className="table-th hidden lg:table-cell">{t('lbl_location')}</th>
                <th className="table-th text-right">{t('parts_stock_qty')}</th>
                <th className="table-th text-right hidden sm:table-cell">{t('lbl_min_stock')}</th>
                <th className="table-th text-center">{t('stock_adjust')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
              ) : stock.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('stock_no_data')}</td></tr>
              ) : stock
                  .filter(row => {
                    if (needOrder) return row.quantity <= row.min_stock
                    return true
                  })
                  .map(row => {
                    const tracked = row.track_min_stock
                    const isZero = tracked && row.quantity === 0
                    const isLow = tracked && !isZero && row.quantity <= row.min_stock
                    const rowClass = isZero ? 'bg-red-50' : isLow ? 'bg-yellow-50' : ''
                    const qtyClass = isZero ? 'text-red-600' : isLow ? 'text-yellow-700' : 'text-gray-900'
                    return (
                      <tr key={row.part_id} className={rowClass}>
                        <td className="table-td">
                          <Link to={`/parts/${row.part_id}`} className="font-medium text-blue-700 hover:underline">
                            {row.part_name}
                            {isZero && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500 align-middle" />}
                            {isLow && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-yellow-400 align-middle" />}
                          </Link>
                          {row.brand && <div className="text-xs text-gray-400 mt-0.5">{row.brand}</div>}
                        </td>
                        <td className="table-td hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {row.first_oem && (
                              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{row.first_oem}</span>
                            )}
                            {row.first_barcode && (
                              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">▌{row.first_barcode}</span>
                            )}
                            {row.car_labels.slice(0, 2).map((c, i) => (
                              <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{c}</span>
                            ))}
                            {row.car_labels.length > 2 && (
                              <span className="text-xs text-gray-400">+{row.car_labels.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="table-td hidden lg:table-cell text-gray-500">{row.category || '—'}</td>
                        <td className="table-td hidden lg:table-cell text-gray-500">{row.location || '—'}</td>
                        <td className="table-td text-right font-semibold">
                          <span className={qtyClass}>{fmtQty(row.quantity)} {row.unit}</span>
                        </td>
                        <td className="table-td text-right hidden sm:table-cell text-gray-400">{row.min_stock}</td>
                        <td className="table-td text-center">
                          {isWarehouse && (
                            <button
                              onClick={() => { setAdjustModal(row); setAdjustQty(String(row.quantity)) }}
                              className="btn-secondary py-1 px-2 text-xs"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {adjustModal && (
        <Modal title={`${t('stock_adjust_title')}: ${adjustModal.part_name}`} onClose={() => setAdjustModal(null)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="label">{t('lbl_quantity')}</label>
              <input type="number" min="0" step="0.001" className="input" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} autoFocus />
              <p className="text-xs text-gray-500 mt-1">{t('stock_was')}: {adjustModal.quantity} {adjustModal.unit}</p>
            </div>
            <div>
              <label className="label">{t('stock_adjust_reason')}</label>
              <input type="text" className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder={t('stock_reason_placeholder')} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setAdjustModal(null)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleAdjust} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}

      {issueModal && (
        <Modal title={t('stock_issue_title')} onClose={() => { setIssueModal(false); setIssuePart(null) }}>
          <div className="space-y-4">
            <div>
              <label className="label">{t('stock_issue_part')}</label>
              <PartSearch onSelect={p => { setIssuePart(p); setIssueQty(1) }} />
              {issuePart && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="font-medium text-blue-900">{issuePart.name}</div>
                  <div className="text-blue-700">{t('stock_on_stock')}: {issuePart.stock_qty} {issuePart.unit}</div>
                </div>
              )}
            </div>
            <div>
              <label className="label">{t('lbl_quantity')} *</label>
              <input type="number" min="1" max={issuePart?.stock_qty} className="input" value={issueQty}
                onChange={e => setIssueQty(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">{t('stock_work_order_required')}</label>
              <input type="text" className="input font-mono" placeholder={t('stock_work_order_placeholder')} value={issueWO}
                onChange={e => setIssueWO(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('lbl_notes')}</label>
              <input type="text" className="input" placeholder={t('rec_optional_note')} value={issueNote}
                onChange={e => setIssueNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setIssueModal(false); setIssuePart(null) }}>{t('btn_cancel')}</button>
              <button className="btn-danger" onClick={handleIssue} disabled={loading}>
                <Minus className="w-4 h-4" /> {t('stock_issue_btn')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
