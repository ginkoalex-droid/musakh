import { useQuery } from '@tanstack/react-query'
import { fetchStock } from '../api/stock'
import { fetchReceivingOrders } from '../api/receiving'
import { AlertTriangle, Package, Truck, ArrowDown, ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: stock = [] } = useQuery({ queryKey: ['stock'], queryFn: () => fetchStock() })
  const { data: orders = [] } = useQuery({ queryKey: ['receiving'], queryFn: fetchReceivingOrders })

  const lowStock = stock.filter(s => s.is_low)
  const recentOrders = orders.slice(0, 5)
  const totalParts = stock.length
  const confirmedToday = orders.filter(o => {
    const d = new Date(o.created_at)
    const today = new Date()
    return o.is_confirmed && d.toDateString() === today.toDateString()
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Главная</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <Package className="w-5 h-5" />
            <span className="text-sm font-medium">Позиций</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalParts}</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-red-500 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">Мало на складе</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{lowStock.length}</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Truck className="w-5 h-5" />
            <span className="text-sm font-medium">Приемок сегодня</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{confirmedToday.length}</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-orange-500 mb-2">
            <Truck className="w-5 h-5" />
            <span className="text-sm font-medium">Ожидают подтверждения</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{orders.filter(o => !o.is_confirmed).length}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Low stock */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Заканчивается на складе
            </h2>
            <Link to="/?low=1" className="text-sm text-blue-600 hover:underline">Все</Link>
          </div>
          {lowStock.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Всё в норме</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {lowStock.slice(0, 8).map(row => (
                <div key={row.part_id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{row.part_name}</div>
                    {row.brand && <div className="text-xs text-gray-500">{row.brand}</div>}
                  </div>
                  <div className="text-right">
                    <span className="badge bg-red-100 text-red-700">{row.quantity} {row.unit}</span>
                    <div className="text-xs text-gray-400 mt-0.5">мин: {row.min_stock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent receiving */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-500" />
              Последние приемки
            </h2>
            <Link to="/receiving" className="text-sm text-blue-600 hover:underline">Все</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Нет приемок</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentOrders.map(o => (
                <Link key={o.id} to={`/receiving/${o.id}`} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 block">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      #{o.id} {o.supplier_name || 'Без поставщика'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(o.date).toLocaleDateString('ru-RU')} · {o.item_count} поз. · {o.total_qty} шт
                    </div>
                  </div>
                  <span className={`badge ${o.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {o.is_confirmed ? 'Проведено' : 'Черновик'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
