import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

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

initAuth()

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, forceUpdate] = useState(0)
  useEffect(() => subscribeAuth(() => forceUpdate(n => n + 1)), [])
  if (!getUser()) return <Navigate to="/login" replace />
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
                  <Route path="/parts" element={
                    getUser() && canWarehouse(getUser()!.role) ? <Parts /> : <Navigate to="/" />
                  } />
                  <Route path="/parts/:id" element={
                    getUser() && canWarehouse(getUser()!.role) ? <PartForm /> : <Navigate to="/" />
                  } />
                  <Route path="/receiving" element={
                    getUser() && canWarehouse(getUser()!.role) ? <ReceivingList /> : <Navigate to="/" />
                  } />
                  <Route path="/receiving/:id" element={
                    getUser() && canWarehouse(getUser()!.role) ? <ReceivingForm /> : <Navigate to="/" />
                  } />
                  <Route path="/suppliers" element={
                    getUser() && canWarehouse(getUser()!.role) ? <Suppliers /> : <Navigate to="/" />
                  } />
                  <Route path="/users" element={
                    getUser() && canAdmin(getUser()!.role) ? <Users /> : <Navigate to="/" />
                  } />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
