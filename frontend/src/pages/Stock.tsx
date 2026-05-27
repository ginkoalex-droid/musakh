import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchStock, adjustStock, issueParts, exportStock, exportMovements } from '../api/stock'
import { fetchCategories } from '../api/parts'
import { AlertTriangle, Download, Settings, Minus } from 'lucide-react'
import Modal from '../components/Modal'
import PartSearch from '../components/PartSearch'
import type { Part, StockRow } from '../types'
import toast from 'react-hot-toast'

export default function Stock() {
  const qc = useQueryClient()
  const [lowOnly, setLowOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [adjustModal, setAdjustModal] = useState<StockRow | null>(null)
  const [issueModal, setIssueModal] = useState(false)
  const [issuePart, setIssuePart] = useState<Part | null>(null)
  const [issueQty, setIssueQty] = useState(1)
  const [issueWO, setIssueWO] = useState('')
  const [issueNote, setIssueNote] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['stock', lowOnly, category],
    queryFn: () => fetchStock(lowOnly, category || undefined),
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  async function handleAdjust() {
    if (!adjustModal) return
    const qty = parseInt(adjustQty)
    if (isNaN(qty) || qty < 0) { toast.error('Введите корректное количество'); return }
    if (!adjustNote.trim()) { toast.error('Укажите причину корректировки'); return }
    setLoading(true)
    try {
      await adjustStock(adjustModal.part_id, qty, adjustNote)
      toast.success('Остаток скорректирован')
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustNote('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleIssue() {
    if (!issuePart) { toast.error('Выберите запчасть'); return }
    if (issueQty <= 0) { toast.error('Укажите количество'); return }
    if (!issueWO.trim()) { toast.error('Укажите номер заказ-наряда'); return }
    setLoading(true)
    try {
      await issueParts(issuePart.id, issueQty, issueWO, issueNote || undefined)
      toast.success(`Списано: ${issuePart.name} × ${issueQty}`)
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setIssueModal(false)
      setIssuePart(null)
      setIssueQty(1)
      setIssueWO('')
      setIssueNote('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Склад</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIssueModal(true)} className="btn-danger">
            <Minus className="w-4 h-4" /> Списать
          </button>
          <button onClick={exportStock} className="btn-secondary">
            <Download className="w-4 h-4" /> Склад Excel
          </button>
          <button onClick={exportMovements} className="btn-secondary">
            <Download className="w-4 h-4" /> Движения Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} className="rounded" />
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Только заканчивающиеся
        </label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto">
          <option value="">Все категории</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Название</th>
                <th className="table-th hidden sm:table-cell">Бренд</th>
                <th className="table-th hidden md:table-cell">Категория</th>
                <th className="table-th hidden lg:table-cell">Место</th>
                <th className="table-th text-right">Остаток</th>
                <th className="table-th text-right hidden sm:table-cell">Мин.</th>
                <th className="table-th text-center">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">Загрузка...</td></tr>
              ) : stock.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">Нет данных</td></tr>
              ) : stock.map(row => (
                <tr key={row.part_id} className={row.is_low ? 'bg-red-50' : ''}>
                  <td className="table-td font-medium">
                    {row.part_name}
                    {row.is_low && <AlertTriangle className="inline w-3.5 h-3.5 text-red-500 ml-1.5" />}
                  </td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{row.brand || '—'}</td>
                  <td className="table-td hidden md:table-cell text-gray-500">{row.category || '—'}</td>
                  <td className="table-td hidden lg:table-cell text-gray-500">{row.location || '—'}</td>
                  <td className="table-td text-right font-semibold">
                    <span className={row.is_low ? 'text-red-600' : 'text-gray-900'}>
                      {row.quantity} {row.unit}
                    </span>
                  </td>
                  <td className="table-td text-right hidden sm:table-cell text-gray-400">{row.min_stock}</td>
                  <td className="table-td text-center">
                    <button
                      onClick={() => { setAdjustModal(row); setAdjustQty(String(row.quantity)) }}
                      className="btn-secondary py-1 px-2 text-xs"
                      title="Скорректировать остаток"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust modal */}
      {adjustModal && (
        <Modal title={`Корректировка: ${adjustModal.part_name}`} onClose={() => setAdjustModal(null)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="label">Фактический остаток</label>
              <input type="number" min="0" className="input" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} autoFocus />
              <p className="text-xs text-gray-500 mt-1">Было: {adjustModal.quantity} {adjustModal.unit}</p>
            </div>
            <div>
              <label className="label">Причина корректировки *</label>
              <input type="text" className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Инвентаризация, пересчет..." />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setAdjustModal(null)}>Отмена</button>
              <button className="btn-primary" onClick={handleAdjust} disabled={loading}>Сохранить</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Issue modal */}
      {issueModal && (
        <Modal title="Списание на заказ-наряд" onClose={() => { setIssueModal(false); setIssuePart(null) }}>
          <div className="space-y-4">
            <div>
              <label className="label">Запчасть *</label>
              <PartSearch onSelect={p => { setIssuePart(p); setIssueQty(1) }} />
              {issuePart && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="font-medium text-blue-900">{issuePart.name}</div>
                  <div className="text-blue-700">На складе: {issuePart.stock_qty} {issuePart.unit}</div>
                </div>
              )}
            </div>
            <div>
              <label className="label">Количество *</label>
              <input type="number" min="1" max={issuePart?.stock_qty} className="input" value={issueQty}
                onChange={e => setIssueQty(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">Номер заказ-наряда *</label>
              <input type="text" className="input font-mono" placeholder="ЗН-12345" value={issueWO}
                onChange={e => setIssueWO(e.target.value)} autoFocus={!!issuePart} />
            </div>
            <div>
              <label className="label">Примечание</label>
              <input type="text" className="input" placeholder="Необязательно" value={issueNote}
                onChange={e => setIssueNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setIssueModal(false); setIssuePart(null) }}>Отмена</button>
              <button className="btn-danger" onClick={handleIssue} disabled={loading}>
                <Minus className="w-4 h-4" /> Списать
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
