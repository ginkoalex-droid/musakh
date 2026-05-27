import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers'
import { Plus, Edit2, Trash2, Phone } from 'lucide-react'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import type { Supplier } from '../types'
import { useT } from '../i18n'

export default function Suppliers() {
  const qc = useQueryClient()
  const { t } = useT()
  const [modal, setModal] = useState<Supplier | null | 'new'>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', contact_name: '', email: '', notes: '' })

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: fetchSuppliers })

  function openNew() {
    setForm({ name: '', phone: '', contact_name: '', email: '', notes: '' })
    setModal('new')
  }

  function openEdit(s: Supplier) {
    setForm({ name: s.name, phone: s.phone || '', contact_name: s.contact_name || '', email: s.email || '', notes: s.notes || '' })
    setModal(s)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error(t('err_no_name')); return }
    setLoading(true)
    try {
      if (modal === 'new') {
        await createSupplier(form)
        toast.success(t('sup_added'))
      } else if (modal && typeof modal === 'object') {
        await updateSupplier(modal.id, form)
        toast.success(t('sup_updated'))
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setModal(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('sup_delete_confirm'))) return
    try {
      await deleteSupplier(id)
      toast.success(t('sup_deleted'))
      qc.invalidateQueries({ queryKey: ['suppliers'] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    }
  }

  const modalTitle = modal === 'new' ? t('sup_new_title') : t('sup_edit_title')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('sup_title')}</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="w-4 h-4" /> {t('btn_add')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-100">
          {suppliers.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">{t('sup_no_data')}</div>
          ) : suppliers.map(s => (
            <div key={s.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div>
                <div className="font-medium text-gray-900">{s.name}</div>
                <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
                  {s.contact_name && <span>{s.contact_name}</span>}
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Phone className="w-3.5 h-3.5" />{s.phone}
                    </a>
                  )}
                  {s.email && <span>{s.email}</span>}
                </div>
                {s.notes && <div className="text-xs text-gray-400 mt-1">{s.notes}</div>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary py-1.5 px-2" onClick={() => openEdit(s)}><Edit2 className="w-4 h-4" /></button>
                <button className="btn-secondary py-1.5 px-2 text-red-500" onClick={() => handleDelete(s.id)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal !== null && (
        <Modal title={modalTitle} onClose={() => setModal(null)} size="sm">
          <div className="space-y-3">
            <div><label className="label">{t('lbl_name')} *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div><label className="label">{t('lbl_contact')}</label><input className="input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            <div><label className="label">{t('lbl_phone')}</label><input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label">{t('lbl_email')}</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label className="label">{t('lbl_notes')}</label><textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
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
