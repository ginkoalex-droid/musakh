import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWorkOrder, confirmWorkOrder, deleteWorkOrder, updateWorkOrder, fetchMechanics } from '../../api/workOrders'
import { fetchIssueOrders, fetchIssueOrder, confirmIssueOrder, deleteIssueOrder } from '../../api/issues'
import { ArrowLeft, CheckCircle, Clock, Package, Trash2, Plus, Edit2 } from 'lucide-react'
import { WORK_TYPES } from '../../api/workOrders'
import { useT } from '../../i18n'
import { getUser } from '../../store/auth'
import { canAdmin, canWarehouse } from '../../store/permissions'
import toast from 'react-hot-toast'

export default function WorkOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useT()
  const qc = useQueryClient()
  const me = getUser()
  const isAdmin = me ? canAdmin(me.role) : false
  const isWarehouse = me ? canWarehouse(me.role) : false

  const [editMechanics, setEditMechanics] = useState(false)
  const [mechForm, setMechForm] = useState({ mechanic_id_2: 0, mechanic_share: 50, work_type: '' })

  const { data: mechanics = [] } = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const activeMechanics = mechanics.filter(m => m.is_active)

  async function handleUpdateMechanics() {
    if (!wo) return
    try {
      await updateWorkOrder(wo.id, {
        work_order_number: wo.work_order_number,
        mechanic_id: wo.mechanic_id,
        mechanic_id_2: mechForm.mechanic_id_2 || undefined,
        mechanic_share: mechForm.mechanic_id_2 ? mechForm.mechanic_share : 100,
        work_type: mechForm.work_type || wo.work_type || undefined,
      })
      toast.success('Обновлено')
      setEditMechanics(false)
      qc.invalidateQueries({ queryKey: ['work-order', id] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  const { data: wo } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => fetchWorkOrder(parseInt(id!)),
    enabled: !!id,
  })

  const { data: issues = [] } = useQuery({
    queryKey: ['issues-for-wo', id],
    queryFn: () => fetchIssueOrders(parseInt(id!)),
    enabled: !!id,
  })

  async function handleConfirmIssue(issueId: number) {
    if (!confirm(t('issue_confirm_title'))) return
    try {
      await confirmIssueOrder(issueId)
      toast.success(t('issue_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['issues-for-wo', id] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  async function handleDeleteIssue(issueId: number) {
    if (!confirm(t('issue_delete_confirm'))) return
    try {
      await deleteIssueOrder(issueId)
      qc.invalidateQueries({ queryKey: ['issues-for-wo', id] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  async function handleConfirm() {
    if (!wo || !confirm(t('wo_confirm_title'))) return
    try {
      await confirmWorkOrder(wo.id)
      toast.success(t('wo_confirmed_toast'))
      qc.invalidateQueries({ queryKey: ['work-orders-all'] })
      qc.invalidateQueries({ queryKey: ['wo-summary'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  async function handleDelete() {
    if (!wo || !confirm(t('wo_delete_confirm'))) return
    try {
      await deleteWorkOrder(wo.id)
      navigate('/work-orders')
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  if (!wo) return <div className="text-center py-16 text-gray-400">{t('rec_loading')}</div>

  const totalParts = issues.reduce((s, i) => s + i.total_qty, 0)
  const totalPositions = issues.reduce((s, i) => s + i.item_count, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/work-orders')} className="btn-secondary py-1.5 px-2 mt-1">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{wo.work_order_number}</h1>
            {wo.is_confirmed ? (
              <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> {t('wo_confirmed')}
              </span>
            ) : (
              <span className="badge bg-blue-100 text-blue-700 flex items-center gap-1">
                <Clock className="w-4 h-4" /> {t('wo_open')}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {new Date(wo.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' · '}{wo.created_by_name}
          </div>
        </div>
      </div>

      {/* WO info card */}
      <div className="card p-5 grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-center justify-between sm:col-span-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <span className="text-gray-500">{t('wo_mechanic')}:</span>
              <span className="font-semibold text-gray-900 ml-2 text-base">{wo.mechanic_name}</span>
              {wo.mechanic2_name && (
                <span className="text-gray-500 ml-2">
                  {wo.mechanic_share}% + <span className="font-semibold text-gray-900">{wo.mechanic2_name}</span> {100 - wo.mechanic_share}%
                </span>
              )}
            </div>
            {wo.work_type && (
              <span className="badge bg-purple-100 text-purple-700">{wo.work_type}</span>
            )}
          </div>
          {isWarehouse && (
            <button onClick={() => {
              setMechForm({
                mechanic_id_2: wo.mechanic_id_2 || 0,
                mechanic_share: wo.mechanic_share || 50,
                work_type: wo.work_type || '',
              })
              setEditMechanics(true)
            }} className="btn-secondary py-1.5 px-2">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {wo.car_plate && (
          <div>
            <span className="text-gray-500">{t('wo_car_plate')}:</span>
            <span className="font-mono font-semibold ml-2">{wo.car_plate}</span>
          </div>
        )}
        {(wo.car_make || wo.car_model) && (
          <div>
            <span className="text-gray-500">{t('wo_car')}:</span>
            <span className="ml-2">{wo.car_make} {wo.car_model}</span>
          </div>
        )}
        {wo.notes && (
          <div className="sm:col-span-2">
            <span className="text-gray-500">{t('lbl_notes')}:</span>
            <span className="ml-2">{wo.notes}</span>
          </div>
        )}
      </div>

      {/* Parts summary */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-red-500" />
            {t('nav_issues')}
            {issues.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">
                — {issues.length} {t('issue_title').toLowerCase()}, {totalPositions} {t('lbl_positions')}, {totalParts} {t('lbl_pieces')}
              </span>
            )}
          </h2>
          <Link to={`/issues/new`} className="btn-danger py-1.5 text-sm">
            <Plus className="w-3.5 h-3.5" /> {t('issue_new')}
          </Link>
        </div>

        {issues.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">
            {t('issue_no_data')}
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map(issue => (
              <div key={issue.id} className="card overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link to={`/issues/${issue.id}`} className="font-semibold text-blue-700 hover:underline">
                      {t('issue_title')} #{issue.id}
                    </Link>
                    <span className="text-xs text-gray-500">
                      {new Date(issue.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      {' · '}{issue.created_by_name}
                    </span>
                    {issue.is_cancelled ? (
                      <span className="badge bg-gray-100 text-gray-500 text-xs">{t('issue_status_cancelled')}</span>
                    ) : issue.is_confirmed ? (
                      <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {t('status_confirmed')}
                      </span>
                    ) : (
                      <span className="badge bg-yellow-100 text-yellow-700 text-xs">{t('status_draft')}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Draft: confirm + delete */}
                    {!issue.is_confirmed && !issue.is_cancelled && (<>
                      <button onClick={() => handleDeleteIssue(issue.id)}
                        className="btn-secondary py-1 px-2 text-xs text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleConfirmIssue(issue.id)}
                        className="btn-success py-1 px-2 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" /> {t('issue_confirm_btn')}
                      </button>
                    </>)}
                    {/* Cancelled: delete only */}
                    {issue.is_cancelled && isAdmin && (
                      <button onClick={() => handleDeleteIssue(issue.id)}
                        className="btn-secondary py-1 px-2 text-xs text-red-500">
                        <Trash2 className="w-3.5 h-3.5" /> {t('btn_delete')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Fetch full issue to show items - use IssueOrderOut */}
                <IssueItemsPreview issueId={issue.id} />

                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-right text-sm font-semibold text-red-700">
                  -{issue.total_qty} {t('lbl_pieces')} ({issue.item_count} {t('lbl_positions')})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {!wo.is_confirmed && isWarehouse && (
          <>
            <button onClick={handleDelete} className="btn-secondary text-red-500">
              <Trash2 className="w-4 h-4" /> {t('wo_delete_confirm').replace('?', '')}
            </button>
            <button onClick={handleConfirm} className="btn-success">
              <CheckCircle className="w-4 h-4" /> {t('wo_confirm_btn')}
            </button>
          </>
        )}
        {wo.is_confirmed && isAdmin && (
          <button onClick={handleDelete} className="btn-secondary text-red-500">
            <Trash2 className="w-4 h-4" /> {t('btn_delete')}
          </button>
        )}
      {/* Edit mechanics modal */}
      {editMechanics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Изменить механиков</h2>
            <div>
              <label className="label">Тип работы</label>
              <select className="input" value={mechForm.work_type}
                onChange={e => setMechForm(f => ({ ...f, work_type: e.target.value }))}>
                <option value="">—</option>
                {WORK_TYPES.map(wt => <option key={wt} value={wt}>{wt}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Второй механик</label>
              <select className="input" value={mechForm.mechanic_id_2}
                onChange={e => setMechForm(f => ({ ...f, mechanic_id_2: parseInt(e.target.value) || 0 }))}>
                <option value={0}>— нет —</option>
                {activeMechanics.filter(m => m.id !== wo.mechanic_id).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            {mechForm.mechanic_id_2 > 0 && (
              <div>
                <label className="label">
                  Доля {wo.mechanic_name}: {mechForm.mechanic_share}% / {mechanics.find(m => m.id === mechForm.mechanic_id_2)?.name}: {100 - mechForm.mechanic_share}%
                </label>
                <input type="range" min="10" max="90" step="10" className="w-full"
                  value={mechForm.mechanic_share}
                  onChange={e => setMechForm(f => ({ ...f, mechanic_share: parseInt(e.target.value) }))} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditMechanics(false)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleUpdateMechanics}>{t('btn_save')}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// Sub-component to show items of a specific issue
function IssueItemsPreview({ issueId }: { issueId: number }) {
  const { data: issue } = useQuery({
    queryKey: ['issue-order', String(issueId)],
    queryFn: () => fetchIssueOrder(issueId),
  })

  if (!issue) return <div className="px-4 py-3 text-sm text-gray-400">...</div>

  return (
    <div className="divide-y divide-gray-50">
      {issue.items.map(item => (
        <div key={item.id} className="px-4 py-2 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-900">{item.part_name}</span>
            <div className="flex gap-2 mt-0.5">
              {item.oem_number && (
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1 rounded">{item.oem_number}</span>
              )}
              {item.barcode && (
                <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1 rounded">▌{item.barcode}</span>
              )}
            </div>
          </div>
          <span className="text-sm font-semibold text-red-700">-{item.quantity}</span>
        </div>
      ))}
    </div>
  )
}
