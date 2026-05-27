import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../store/auth'
import { useT, langNames, type Lang } from '../i18n'

export default function Login() {
  const navigate = useNavigate()
  const { t, setLang, lang, dir } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      toast.error(t('login_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100" dir={dir}>
      <div className="card w-full max-w-sm p-8">
        {/* Language switcher */}
        <div className="flex justify-end mb-4">
          <div className="flex items-center rounded-lg overflow-hidden border border-gray-200 text-xs">
            {(Object.keys(langNames) as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  lang === l ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {langNames[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-3">
            <Wrench className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('login_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('login_subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label">{t('login_email')}</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="label">{t('login_password')}</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary justify-center py-2.5 mt-2" disabled={loading}>
            {loading ? t('login_loading') : t('login_submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
