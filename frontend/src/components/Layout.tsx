import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Truck, Package, ArrowLeftRight, Users, LogOut, Menu, X, Wrench, Key, Minus } from 'lucide-react'
import { useState } from 'react'
import { logout, getUser } from '../store/auth'
import { useT, langNames, type Lang } from '../i18n'
import { canAdmin } from '../store/permissions'
import Modal from './Modal'
import toast from 'react-hot-toast'
import api from '../api/client'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const user = getUser()
  const { t, setLang, lang, dir } = useT()

  const isAdmin = user ? canAdmin(user.role) : false

  const isWarehouse = user ? canAdmin(user.role) || user.role === 'warehouse' : false

  const nav = [
    { to: '/', label: t('nav_stock'), icon: BarChart3, show: true },
    { to: '/receiving', label: t('nav_receiving'), icon: Truck, show: isWarehouse },
    { to: '/issues', label: t('nav_issues'), icon: Minus, show: true },
    { to: '/parts', label: t('nav_parts'), icon: Package, show: isWarehouse },
    { to: '/movements', label: t('nav_movements'), icon: ArrowLeftRight, show: true },
    { to: '/suppliers', label: t('nav_suppliers'), icon: Users, show: isWarehouse },
    { to: '/users', label: t('nav_users'), icon: Users, show: isAdmin },
  ].filter(n => n.show)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  async function handleChangePassword() {
    if (!curPw || !newPw) return
    if (newPw.length < 6) { toast.error('Min 6 chars'); return }
    setPwLoading(true)
    try {
      await api.post('/auth/change-password', { current_password: curPw, new_password: newPw })
      toast.success(t('users_password_changed'))
      setPwModal(false)
      setCurPw('')
      setNewPw('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('err_generic'))
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="bg-blue-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <Wrench className="w-5 h-5" />
            <div className="hidden sm:block">
              <div className="font-bold text-lg leading-tight">{t('nav_stock')}</div>
              <div className="text-xs text-blue-200 font-normal leading-tight">Nir Dr. Cycle</div>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === to
                    ? 'bg-white/20 text-white'
                    : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            {/* Language switcher */}
            <div className="flex items-center rounded-lg overflow-hidden border border-white/20 text-xs">
              {(Object.keys(langNames) as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2 py-1 font-medium transition-colors ${
                    lang === l ? 'bg-white text-blue-700' : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  {langNames[l]}
                </button>
              ))}
            </div>

            <span className="hidden sm:block text-sm text-blue-200 mx-1">{user?.name}</span>
            <button onClick={() => setPwModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200" title={t('users_change_password')}>
              <Key className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200">
              <LogOut className="w-4 h-4" />
            </button>
            <button className="md:hidden p-1.5 rounded-lg hover:bg-white/10" onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-blue-600 px-4 py-2 flex flex-col gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === to ? 'bg-white/20' : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {pwModal && (
        <Modal title={t('users_change_password')} onClose={() => setPwModal(false)} size="sm">
          <div className="space-y-3">
            <div><label className="label">{t('users_current_password')}</label>
              <input className="input" type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoFocus />
            </div>
            <div><label className="label">{t('users_new_password')}</label>
              <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setPwModal(false)}>{t('btn_cancel')}</button>
              <button className="btn-primary" onClick={handleChangePassword} disabled={pwLoading}>{t('btn_save')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
