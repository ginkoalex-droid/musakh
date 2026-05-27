import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Package, Truck, BarChart3, ArrowLeftRight, Users, LogOut, Menu, X, Wrench
} from 'lucide-react'
import { useState } from 'react'
import { logout, getUser } from '../store/auth'

const nav = [
  { to: '/', label: 'Склад', icon: BarChart3 },
  { to: '/receiving', label: 'Приемка', icon: Truck },
  { to: '/parts', label: 'Запчасти', icon: Package },
  { to: '/movements', label: 'Движения', icon: ArrowLeftRight },
  { to: '/suppliers', label: 'Поставщики', icon: Users },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-blue-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Wrench className="w-5 h-5" />
            <span className="hidden sm:inline">Склад</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
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

          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-blue-200">{user?.name}</span>
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200">
              <LogOut className="w-4 h-4" />
            </button>
            <button className="md:hidden p-1.5 rounded-lg hover:bg-white/10" onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
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
