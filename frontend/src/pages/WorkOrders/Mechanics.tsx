import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMechanics, createMechanic, updateMechanic, toggleMechanic } from '../../api/workOrders'
import { Plus, Edit2, ToggleLeft, ToggleRight, Phone } from 'lucide-react'
import Modal from '../../components/Modal'
import { useT } from '../../i18n'
import toast from 'react-hot-toast'

export default function Mechanics() {
  const { t } = useT()
  const qc = useQueryClient()
  const [modal, setModal] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })

  const { data: mechanics = [] } = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })

  function openNew() { setForm({ name: '', phone: '', notes: '' }); setModal('new') }
  function openEdit(m: any) { setForm({ name: m.name, phone: m.phone || '', notes: m.notes || '' }); setModal(m) }

  async function handleSave() {
    if (!form.name.trim()) { toast.error(t('err_no_name')); return }
    setLoading(true)
    try {
      if (modal === 'new') {
        await createMechanic(form)
        toast.success(t('mech_added'))
      } else {
        await updateMechanic(modal.id, form)
        toast.success(t('mech_updated'))
      }
      qc.invalidateQueries({ queryKey: ['mechanics'] })
      setModal(null)
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
    finally { setLoading(false) }
  }

  async function handleToggle(id: number) {
    try {
      await toggleMechanic(id)
      qc.invalidateQueries({ queryKey: ['mechanics'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || t('err_generic')) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('mech_title')}</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="w-4 h-4" /> {t('mech_new')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-100">
          {mechanics.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">{t('mech_no_data')}</div>
          ) : mechanics.map(m => (
            <div key={m.id} className={`px-6 py-4 flex items-center justify-between ${!m.is_active ? 'opacity-50' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-lg">{m.name}</span>
                  <span className={`badge text-xs ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.is_active ? t('mech_active') : t('mech_inactive')}
                  </span>
                </div>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="flex items-center gap-1 text-sm text-blue-600 mt-1">
                    <Phone className="w-3.5 h-3.5" /> {m.phone}
                  </a>
                )}
                {m.notes && <div className="text-xs text-gray-400 mt-1">{m.notes}</div>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary py-1.5 px-2" onClick={() => openEdit(m)}>
                  <Edit2 className="w-4 h-4" />
                </button>
                <button className="btn-secondary py-1.5 px-2" onClick={() => handleToggle(m.id)}
                  title={m.is_active ? t('users_deactivate') : t('users_activate')}>
                  {m.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal !== null && (
        <Modal title={modal === 'new' ? t('mech_new') : t('mech_title')} onClose={() => setModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">{t('lbl_name')} *</label>
              <input className="input text-lg" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div><label className="label">{t('lbl_phone')}</label>
              <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div><label className="label">{t('lbl_notes')}</label>
              <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setModal(null)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={loading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
