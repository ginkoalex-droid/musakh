import { useQuery } from '@tanstack/react-query'
import { fetchReceivingOrders } from '../../api/receiving'
import { Plus, CheckCircle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ReceivingList() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['receiving'],
    queryFn: fetchReceivingOrders,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Приемка</h1>
        <Link to="/receiving/new" className="btn-primary">
          <Plus className="w-4 h-4" /> Новая приемка
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">№</th>
                <th className="table-th">Поставщик</th>
                <th className="table-th hidden sm:table-cell">Дата</th>
                <th className="table-th hidden md:table-cell">Накладная</th>
                <th className="table-th hidden sm:table-cell text-right">Поз.</th>
                <th className="table-th hidden sm:table-cell text-right">Шт.</th>
                <th className="table-th">Статус</th>
                <th className="table-th hidden lg:table-cell">Кто создал</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">Загрузка...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">Нет приемок</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium">
                    <Link to={`/receiving/${o.id}`} className="text-blue-700 hover:underline">#{o.id}</Link>
                  </td>
                  <td className="table-td">{o.supplier_name || <span className="text-gray-400">—</span>}</td>
                  <td className="table-td hidden sm:table-cell text-gray-500">
                    {new Date(o.date).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="table-td hidden md:table-cell font-mono text-sm text-gray-500">
                    {o.invoice_number || '—'}
                  </td>
                  <td className="table-td hidden sm:table-cell text-right">{o.item_count}</td>
                  <td className="table-td hidden sm:table-cell text-right font-medium">{o.total_qty}</td>
                  <td className="table-td">
                    {o.is_confirmed ? (
                      <span className="badge bg-green-100 text-green-700 flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3" /> Проведено
                      </span>
                    ) : (
                      <span className="badge bg-yellow-100 text-yellow-700 flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" /> Черновик
                      </span>
                    )}
                  </td>
                  <td className="table-td hidden lg:table-cell text-gray-500">{o.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
