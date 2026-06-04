/**
 * PartsPicker — modal to select multiple parts from catalog and add to issue.
 * Shows catalog with filters. User checks parts, sets quantity, clicks Add.
 * Quantity pre-filled from default_issue_qty; items with qty=1 (generic default)
 * are visually flagged so user doesn't forget to adjust.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchParts, fetchCategories } from '../api/parts'
import { Search, X, Plus, AlertTriangle } from 'lucide-react'
import type { Part } from '../types'
import { useT } from '../i18n'
import { useUnit } from '../utils/useUnit'

interface SelectedItem { part: Part; qty: number }

interface Props {
  onAdd: (items: SelectedItem[]) => void
  onClose: () => void
}

export default function PartsPicker({ onAdd, onClose }: Props) {
  const { t } = useT()
  const u = useUnit()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<Map<number, SelectedItem>>(new Map())
  const timer = useState<ReturnType<typeof setTimeout>>()[0]

  function handleSearch(val: string) {
    setQ(val)
    clearTimeout(timer as any)
    setTimeout(() => setDq(val), 300)
  }

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts-picker', dq, category],
    queryFn: () => fetchParts(dq || undefined, category || undefined),
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  function toggle(part: Part) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(part.id)) {
        next.delete(part.id)
      } else {
        next.set(part.id, { part, qty: part.default_issue_qty ?? 1 })
      }
      return next
    })
  }

  function setQty(partId: number, qty: number) {
    setSelected(prev => {
      const next = new Map(prev)
      const item = next.get(partId)
      if (item) next.set(partId, { ...item, qty })
      return next
    })
  }

  function handleAdd() {
    const items = Array.from(selected.values()).filter(i => i.qty > 0)
    if (items.length === 0) return
    onAdd(items)
    onClose()
  }

  // Parts that might need qty attention (default_issue_qty not set → qty=1 could be wrong for fluids)
  const needsAttention = (p: Part) => selected.has(p.id) && !p.default_issue_qty && p.unit !== 'шт' && p.unit !== 'pcs'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-lg">{t('issue_new')} — {t('parts_title')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input autoFocus type="text" className="input pl-9 text-sm" placeholder={t('parts_search')}
              value={q} onChange={e => handleSearch(e.target.value)} />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto text-sm">
            <option value="">{t('stock_all_categories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Parts list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">{t('rec_loading')}</div>
          ) : parts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">{t('rec_no_data')}</div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white shadow-sm z-10">
                <tr>
                  <th className="table-th w-8" />
                  <th className="table-th">{t('lbl_name')}</th>
                  <th className="table-th hidden sm:table-cell text-gray-500 text-xs">{t('lbl_brand')}</th>
                  <th className="table-th text-right text-gray-500 text-xs">{t('lbl_quantity')}</th>
                  <th className="table-th text-right w-28">{t('lbl_quantity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parts.map(p => {
                  const isSelected = selected.has(p.id)
                  const item = selected.get(p.id)
                  const warn = needsAttention(p)
                  return (
                    <tr key={p.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(p)}
                    >
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggle(p)}
                          className="w-4 h-4 rounded accent-blue-600" />
                      </td>
                      <td className="table-td">
                        <div className="font-medium text-sm text-gray-900">{p.name}</div>
                        {p.barcodes[0] && (
                          <span className="text-xs font-mono text-blue-600">▌{p.barcodes[0].barcode}</span>
                        )}
                      </td>
                      <td className="table-td hidden sm:table-cell text-xs text-gray-500">{p.brand || '—'}</td>
                      <td className="table-td text-right text-xs text-gray-500">
                        <span className={p.stock_qty <= 0 ? 'text-red-500 font-medium' : ''}>
                          {p.stock_qty} {u(p.unit)}
                        </span>
                      </td>
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step={p.default_issue_qty ?? (p.unit === 'шт' || p.unit === 'pcs' ? 1 : 0.05)}
                              className={`input text-right w-20 text-sm font-semibold ${warn ? 'border-orange-400 bg-orange-50' : 'border-blue-300'}`}
                              value={item?.qty ?? 1}
                              onClick={e => (e.target as HTMLInputElement).select()}
                              onChange={e => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v)) setQty(p.id, v)
                              }}
                            />
                            {warn && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selected.size > 0
              ? `${t('lbl_selected')}: ${selected.size} ${t('lbl_positions')}`
              : t('parts_picker_hint')}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>{t('btn_cancel')}</button>
            <button
              className="btn-primary"
              disabled={selected.size === 0}
              onClick={handleAdd}
            >
              <Plus className="w-4 h-4" /> {t('parts_picker_add')} ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
