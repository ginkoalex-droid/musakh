import { useQuery } from '@tanstack/react-query'
import { fetchIssueOrders } from '../../api/issues'
import { Plus, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'

export default function IssueList() {
  const { t } = useT()
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['issues'],
    queryFn: fetchIssueOrders,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('issue_title')}</h1>
        <Link to="/issues/new" className="btn-danger">
          <Plus className="w-4 h-4" /> {t('issue_new')}
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">№</th>
                <th className="table-th">{t('lbl_work_order')}</th>
                <th className="table-th hidden sm:table-cell">{t('lbl_date')}</th>
                <th className="table-th hidden sm:table-cell text-right">{t('lbl_positions')}</th>
                <th className="table-th hidden sm:table-cell text-right">{t('lbl_pieces')}</th>
                <th className="table-th">{t('lbl_status')}</th>
                <th className="table-th hidden lg:table-cell">{t('lbl_employee')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('rec_loading')}</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('issue_no_data')}</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium">
                    <Link to={`/issues/${o.id}`} className="text-blue-700 hover:underline">#{o.id}</Link>
                  </td>
                  <td className="table-td font-mono font-semibold text-blue-800">{o.work_order_number}</td>
                  <td className="table-td hidden sm:table-cell text-gray-500">
                    {new Date(o.date).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="table-td hidden sm:table-cell text-right">{o.item_count}</td>
                  <td className="table-td hidden sm:table-cell text-right font-medium">{o.total_qty}</td>
                  <td className="table-td">
                    {o.is_cancelled ? (
                      <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1 w-fit">
                        <XCircle className="w-3 h-3" /> {t('issue_status_cancelled')}
                      </span>
                    ) : o.is_confirmed ? (
                      <span className="badge bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3" /> {t('status_confirmed')}
                      </span>
                    ) : (
                      <span className="badge bg-yellow-100 text-yellow-700 flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" /> {t('status_draft')}
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
