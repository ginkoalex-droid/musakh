import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import { Car, Edit2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '../i18n'

export default function CarModels() {
  const { t } = useT()
  const qc = useQueryClient()

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['car-models-for-stock'],
    queryFn: async () => {
      const res = await api.get('/parts/wo-models-all')
      return res.data as string[]
    },
  })

  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleRename(oldName: string) {
    const newName = editVal.trim()
    if (!newName || newName.toUpperCase() === oldName.toUpperCase()) { setEditingIdx(null); return }
    setSaving(true)
    try {
      const res = await api.post('/parts/car-models/rename', null, { params: { old_name: oldName, new_name: newName } })
      toast.success(`${res.data.updated} ${t('car_models_updated')}`)
      qc.invalidateQueries({ queryKey: ['car-models-for-stock'] })
      qc.invalidateQueries({ queryKey: ['parts'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      setEditingIdx(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Car className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('car_models_title')}</h1>
      </div>
      <p className="text-sm text-gray-500">{t('car_models_desc')}</p>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('rec_loading')}</div>
        ) : models.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{t('car_models_empty')}</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {models.map((model, idx) => (
              <li key={model} className="px-5 py-3 flex items-center gap-3">
                <Car className="w-4 h-4 text-gray-400 shrink-0" />
                {editingIdx === idx ? (
                  <div className="flex flex-1 gap-2 items-center">
                    <input
                      autoFocus
                      className="input flex-1"
                      value={editVal}
                      style={{ textTransform: 'uppercase' }}
                      onChange={e => setEditVal(e.target.value.replace(/[^\x00-\x7F]/g, '').toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(model)
                        if (e.key === 'Escape') setEditingIdx(null)
                      }}
                    />
                    <button className="btn-success py-1.5 px-2" onClick={() => handleRename(model)} disabled={saving}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button className="btn-secondary py-1.5 px-2" onClick={() => setEditingIdx(null)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-gray-800 font-mono">{model}</span>
                    <button
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      onClick={() => { setEditingIdx(idx); setEditVal(model) }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
