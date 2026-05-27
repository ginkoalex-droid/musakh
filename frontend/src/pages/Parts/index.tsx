import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchParts, fetchCategories } from '../../api/parts'
import { Plus, Package, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'

export default function Parts() {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const timer = useState<ReturnType<typeof setTimeout>>()[0]

  function handleSearch(val: string) {
    setQ(val)
    clearTimeout(timer as any)
    setTimeout(() => setDebouncedQ(val), 300)
  }

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts', debouncedQ, category],
    queryFn: () => fetchParts(debouncedQ || undefined, category || undefined),
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('parts_title')}</h1>
        <Link to="/parts/new" className="btn-primary">
          <Plus className="w-4 h-4" /> {t('parts_new')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('parts_search')}
            className="input pl-9"
            value={q}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto">
          <option value="">{t('stock_all_categories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('lbl_name')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_brand')}</th>
                <th className="table-th hidden md:table-cell">{t('lbl_category')}</th>
                <th className="table-th hidden lg:table-cell">{t('parts_oem_barcodes')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_location')}</th>
                <th className="table-th text-right">{t('parts_stock_qty')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-td text-center py-12">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <div className="text-gray-400">{t('parts_no_results')}</div>
                  </td>
                </tr>
              ) : parts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <Link to={`/parts/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.name}</Link>
                  </td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{p.brand || '—'}</td>
                  <td className="table-td hidden md:table-cell">
                    {p.category ? <span className="badge bg-gray-100 text-gray-600">{p.category}</span> : '—'}
                  </td>
                  <td className="table-td hidden lg:table-cell text-xs font-mono text-gray-500">
                    {p.oem_numbers[0]?.oem_number || p.barcodes[0]?.barcode || '—'}
                  </td>
                  <td className="table-td hidden sm:table-cell text-gray-500">{p.location || '—'}</td>
                  <td className="table-td text-right">
                    <span className={`font-semibold ${p.stock_qty <= p.min_stock ? 'text-red-600' : 'text-gray-900'}`}>
                      {p.stock_qty} {p.unit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
