import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Truck, Package, ArrowLeftRight, Users, LogOut, Menu, X, Wrench } from 'lucide-react'
import { useState } from 'react'
import { logout, getUser } from '../store/auth'
import { useT, langNames, type Lang } from '../i18n'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const user = getUser()
  const { t, setLang, lang, dir } = useT()

  const nav = [
    { to: '/', label: t('nav_stock'), icon: BarChart3 },
    { to: '/receiving', label: t('nav_receiving'), icon: Truck },
    { to: '/parts', label: t('nav_parts'), icon: Package },
    { to: '/movements', label: t('nav_movements'), icon: ArrowLeftRight },
    { to: '/suppliers', label: t('nav_suppliers'), icon: Users },
  ]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="bg-blue-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-lg shrink-0">
            <Wrench className="w-5 h-5" />
            <span className="hidden sm:inline">{t('nav_stock')}</span>
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
    </div>
  )
}
