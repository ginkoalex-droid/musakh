import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Lock, Unlock, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { useT, type Lang } from '../i18n'
import { getUser } from '../store/auth'
import { roleLabels } from '../store/permissions'
import type { User, UserRole } from '../types'
import api from '../api/client'

async function fetchUsers(): Promise<User[]> {
  const res = await api.get('/auth/users')
  return res.data
}

const ALL_ROLES: UserRole[] = ['admin', 'warehouse', 'mechanic']

export default function Users() {
  const { t, lang } = useT()
  const qc = useQueryClient()
  const me = getUser()
  const [modal, setModal] = useState<User | 'new' | null>(null)
  const [pwModal, setPwModal] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'warehouse' as UserRole })
  const [newPw, setNewPw] = useState('')

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })

  function openNew() {
    setForm({ name: '', email: '', password: '', role: 'warehouse' })
    setModal('new')
  }

  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
    setModal(u)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) { toast.error(t('err_no_name')); return }
    if (modal === 'new' && !form.password) { toast.error(t('users_password') + ' required'); return }
    setLoading(true)
    try {
      if (modal === 'new') {
        await api.post('/auth/users', form)
        toast.success(t('users_added'))
      } else if (modal && typeof modal === 'object') {
        await api.put(`/auth/users/${modal.id}`, form)
        toast.success(t('users_updated'))
      }
      qc.invalidateQueries({ queryKey: ['users'] })
      setModal(null)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg || t('err_generic') : t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(u: User) {
    try {
      await api.patch(`/auth/users/${u.id}/toggle`)
      qc.invalidateQueries({ queryKey: ['users'] })
    } catch (err: any) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('err_generic'))
    }
  }

  async function handleSetPassword() {
    if (!pwModal || !newPw || newPw.length < 6) { toast.error('Min 6 chars'); return }
    setLoading(true)
    try {
      await api.post(`/auth/users/${pwModal.id}/set-password`, { new_password: newPw })
      toast.success(t('users_password_changed'))
      setPwModal(null)
      setNewPw('')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  function getRoleLabel(role: UserRole) {
    return roleLabels[role]?.[lang as Lang] || role
  }

  const roleBadgeColor: Record<UserRole, string> = {
    admin:     'bg-purple-100 text-purple-700',
    warehouse: 'bg-blue-100 text-blue-700',
    mechanic:  'bg-green-100 text-green-700',
    readonly:  'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('users_title')}</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="w-4 h-4" /> {t('users_new')}
        </button>
      </div>

      {/* Permissions legend */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {ALL_ROLES.map(role => (
            <div key={role} className="space-y-1">
              <span className={`badge ${roleBadgeColor[role]}`}>{getRoleLabel(role)}</span>
              <ul className="text-xs text-gray-500 space-y-0.5 mt-1">
                {role === 'admin' && <>
                  <li>✓ {t('nav_stock')}</li>
                  <li>✓ {t('nav_receiving')}</li>
                  <li>✓ {t('nav_parts')}</li>
                  <li>✓ {t('stock_issue')}</li>
                  <li>✓ {t('nav_users')}</li>
                </>}
                {role === 'warehouse' && <>
                  <li>✓ {t('nav_stock')} + корректировки</li>
                  <li>✓ {t('nav_receiving')}</li>
                  <li>✓ {t('nav_parts')}</li>
                  <li>✓ {t('stock_issue')}</li>
                  <li>— Отмена проводки</li>
                </>}
                {role === 'mechanic' && <>
                  <li>✓ {t('nav_stock')} (просмотр)</li>
                  <li>✓ {t('nav_workorders')}</li>
                  <li>✓ {t('stock_issue')}</li>
                  <li>— {t('nav_receiving')}</li>
                  <li>— {t('stock_adjust')}</li>
                  <li>— Удаление/отмена</li>
                </>}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-100">
          {users.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">{t('users_no_data')}</div>
          ) : users.map(u => (
            <div key={u.id} className={`px-6 py-4 flex items-center justify-between ${!u.is_active ? 'opacity-50' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{u.name}</span>
                  {u.id === me?.id && (
                    <span className="badge bg-blue-50 text-blue-600 text-xs">you</span>
                  )}
                  <span className={`badge ${roleBadgeColor[u.role]}`}>{getRoleLabel(u.role)}</span>
                  {!u.is_active && (
                    <span className="badge bg-red-100 text-red-600">{t('users_inactive')}</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{u.email}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary py-1.5 px-2" onClick={() => { setPwModal(u); setNewPw('') }} title={t('users_set_password')}>
                  <Key className="w-4 h-4" />
                </button>
                <button className="btn-secondary py-1.5 px-2" onClick={() => openEdit(u)}>
                  <Edit2 className="w-4 h-4" />
                </button>
                {u.id !== me?.id && (
                  <button
                    className={`btn-secondary py-1.5 px-2 ${u.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}
                    onClick={() => handleToggle(u)}
                    title={u.is_active ? t('users_deactivate') : t('users_activate')}
                  >
                    {u.is_active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal title={modal === 'new' ? t('users_new') : t('users_edit')} onClose={() => setModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">{t('lbl_name')} *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div><label className="label">{t('lbl_email')} *</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div><label className="label">{t('users_role')}</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
            </div>
            {modal === 'new' && (
              <div><label className="label">{t('users_password')} *</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            )}
            {modal !== 'new' && (
              <p className="text-xs text-gray-400">{t('users_leave_blank')}</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setModal(null)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Set password modal (admin) */}
      {pwModal && (
        <Modal title={`${t('users_set_password')}: ${pwModal.name}`} onClose={() => setPwModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">{t('users_new_password')}</label>
              <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setPwModal(null)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleSetPassword} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
