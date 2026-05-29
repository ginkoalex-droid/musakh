import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState, type ReactNode } from 'react'

import { initAuth, getUser, subscribeAuth } from './store/auth'
import { canAdmin, canWarehouse } from './store/permissions'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Stock from './pages/Stock'
import Movements from './pages/Movements'
import Parts from './pages/Parts'
import PartForm from './pages/Parts/PartForm'
import ReceivingList from './pages/Receiving'
import ReceivingForm from './pages/Receiving/ReceivingForm'
import Suppliers from './pages/Suppliers'
import Users from './pages/Users'
import IssueList from './pages/Issues'
import IssueForm from './pages/Issues/IssueForm'
import WorkOrders from './pages/WorkOrders'
import WorkOrderDetail from './pages/WorkOrders/WorkOrderDetail'
import Mechanics from './pages/WorkOrders/Mechanics'

initAuth()

function useAuth() {
  const [, forceUpdate] = useState(0)
  useEffect(() => subscribeAuth(() => forceUpdate(n => n + 1)), [])
  return getUser()
}

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireWarehouse({ children }: { children: ReactNode }) {
  const user = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!canWarehouse(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!canAdmin(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Stock />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/movements" element={<Movements />} />
                  <Route path="/parts" element={<RequireWarehouse><Parts /></RequireWarehouse>} />
                  <Route path="/parts/:id" element={<RequireWarehouse><PartForm /></RequireWarehouse>} />
                  <Route path="/receiving" element={<RequireWarehouse><ReceivingList /></RequireWarehouse>} />
                  <Route path="/receiving/:id" element={<RequireWarehouse><ReceivingForm /></RequireWarehouse>} />
                  <Route path="/suppliers" element={<RequireWarehouse><Suppliers /></RequireWarehouse>} />
                  <Route path="/issues" element={<IssueList />} />
                  <Route path="/issues/:id" element={<IssueForm />} />
                  <Route path="/work-orders" element={<WorkOrders />} />
                  <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
                  <Route path="/mechanics" element={<RequireWarehouse><Mechanics /></RequireWarehouse>} />
                  <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
