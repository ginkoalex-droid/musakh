import { useQuery } from '@tanstack/react-query'
import { fetchMovements } from '../api/stock'
import { ArrowDown, ArrowUp, Settings, RotateCcw } from 'lucide-react'
import type { MovementType } from '../types'

const typeConfig: Record<MovementType, { label: string; color: string; Icon: any }> = {
  receiving: { label: 'Приход', color: 'bg-green-100 text-green-700', Icon: ArrowDown },
  issue:     { label: 'Списание', color: 'bg-red-100 text-red-700',   Icon: ArrowUp },
  adjustment:{ label: 'Корректировка', color: 'bg-yellow-100 text-yellow-700', Icon: Settings },
  return:    { label: 'Возврат', color: 'bg-blue-100 text-blue-700',  Icon: RotateCcw },
}

export default function Movements() {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements'],
    queryFn: () => fetchMovements(undefined, 200),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">История движений</h1>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Дата</th>
                <th className="table-th">Запчасть</th>
                <th className="table-th">Тип</th>
                <th className="table-th text-right">Кол-во</th>
                <th className="table-th text-right hidden sm:table-cell">До</th>
                <th className="table-th text-right hidden sm:table-cell">После</th>
                <th className="table-th hidden md:table-cell">Заказ-наряд</th>
                <th className="table-th hidden lg:table-cell">Примечание</th>
                <th className="table-th hidden md:table-cell">Сотрудник</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">Загрузка...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">Нет движений</td></tr>
              ) : movements.map(mv => {
                const cfg = typeConfig[mv.movement_type]
                const Icon = cfg.Icon
                return (
                  <tr key={mv.id} className="hover:bg-gray-50">
                    <td className="table-td whitespace-nowrap text-xs text-gray-500">
                      {new Date(mv.created_at).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="table-td font-medium max-w-[180px]">
                      <span className="line-clamp-2">{mv.part_name}</span>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${cfg.color} flex items-center gap-1 w-fit`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="table-td text-right font-semibold">
                      <span className={mv.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                        {mv.quantity > 0 ? '+' : ''}{mv.quantity}
                      </span>
                    </td>
                    <td className="table-td text-right text-gray-500 hidden sm:table-cell">{mv.quantity_before}</td>
                    <td className="table-td text-right font-medium hidden sm:table-cell">{mv.quantity_after}</td>
                    <td className="table-td hidden md:table-cell">
                      {mv.work_order_number ? (
                        <span className="font-mono text-blue-700 font-medium">{mv.work_order_number}</span>
                      ) : '—'}
                    </td>
                    <td className="table-td text-gray-500 hidden lg:table-cell max-w-[200px]">
                      <span className="line-clamp-1">{mv.notes || '—'}</span>
                    </td>
                    <td className="table-td text-gray-500 hidden md:table-cell">{mv.created_by_name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
