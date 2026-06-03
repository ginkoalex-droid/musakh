import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchLocations } from '../api/parts'
import api from '../api/client'
import { MapPin, Edit2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '../i18n'

export default function Locations() {
  const { t } = useT()
  const qc = useQueryClient()
  const { data: locations = [], isLoading } = useQuery({ queryKey: ['locations'], queryFn: fetchLocations })

  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleRename(oldName: string) {
    const newName = editVal.trim()
    if (!newName || newName === oldName) { setEditingIdx(null); return }
    setSaving(true)
    try {
      const res = await api.post('/parts/locations/rename', null, { params: { old_name: oldName, new_name: newName } })
      toast.success(`Обновлено: ${res.data.updated} товаров`)
      qc.invalidateQueries({ queryKey: ['locations'] })
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
        <MapPin className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Места хранения</h1>
      </div>
      <p className="text-sm text-gray-500">
        Нажми на карандаш чтобы переименовать место. Изменение применится ко всем товарам с этим местом.
      </p>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('rec_loading')}</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Нет мест хранения</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {locations.map((loc, idx) => (
              <li key={loc} className="px-5 py-3 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                {editingIdx === idx ? (
                  <div className="flex flex-1 gap-2 items-center">
                    <input
                      autoFocus
                      className="input flex-1"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(loc)
                        if (e.key === 'Escape') setEditingIdx(null)
                      }}
                    />
                    <button
                      className="btn-success py-1.5 px-2"
                      onClick={() => handleRename(loc)}
                      disabled={saving}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      className="btn-secondary py-1.5 px-2"
                      onClick={() => setEditingIdx(null)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-gray-800">{loc}</span>
                    <button
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      onClick={() => { setEditingIdx(idx); setEditVal(loc) }}
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
