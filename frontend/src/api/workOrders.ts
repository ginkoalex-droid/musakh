import api from './client'

export interface Mechanic {
  id: number
  name: string
  phone?: string
  notes?: string
  is_active: boolean
  created_at: string
}

export interface WorkOrder {
  id: number
  work_order_number: string
  mechanic_id: number
  mechanic_name: string
  date: string
  car_plate?: string
  car_make?: string
  car_model?: string
  notes?: string
  is_confirmed: boolean
  created_by_name: string
  created_at: string
}

export interface MechanicSummary {
  mechanic_id: number
  mechanic_name: string
  total: number
  confirmed: number
}

// Mechanics
export const fetchMechanics = async (): Promise<Mechanic[]> => {
  const res = await api.get('/mechanics')
  return res.data
}
export const createMechanic = async (data: Partial<Mechanic>): Promise<Mechanic> => {
  const res = await api.post('/mechanics', data)
  return res.data
}
export const updateMechanic = async (id: number, data: Partial<Mechanic>): Promise<Mechanic> => {
  const res = await api.put(`/mechanics/${id}`, data)
  return res.data
}
export const toggleMechanic = async (id: number): Promise<Mechanic> => {
  const res = await api.patch(`/mechanics/${id}/toggle`)
  return res.data
}

// Work Orders
export interface WOFilters {
  mechanic_id?: number
  from_date?: string
  to_date?: string
  confirmed_only?: boolean
  q?: string
}

export const fetchWorkOrders = async (f: WOFilters = {}): Promise<WorkOrder[]> => {
  const params: Record<string, string | number | boolean> = {}
  if (f.mechanic_id) params.mechanic_id = f.mechanic_id
  if (f.from_date) params.from_date = f.from_date
  if (f.to_date) params.to_date = f.to_date
  if (f.confirmed_only) params.confirmed_only = true
  if (f.q) params.q = f.q
  const res = await api.get('/work-orders', { params })
  return res.data
}

export const fetchWOSummary = async (from_date?: string, to_date?: string): Promise<MechanicSummary[]> => {
  const params: Record<string, string> = {}
  if (from_date) params.from_date = from_date
  if (to_date) params.to_date = to_date
  const res = await api.get('/work-orders/summary', { params })
  return res.data
}

export const createWorkOrder = async (data: Partial<WorkOrder> & { mechanic_id: number }): Promise<WorkOrder> => {
  const res = await api.post('/work-orders', data)
  return res.data
}

export const confirmWorkOrder = async (id: number): Promise<WorkOrder> => {
  const res = await api.post(`/work-orders/${id}/confirm`)
  return res.data
}

export const updateWorkOrder = async (id: number, data: Partial<WorkOrder>): Promise<WorkOrder> => {
  const res = await api.put(`/work-orders/${id}`, data)
  return res.data
}

export const deleteWorkOrder = async (id: number): Promise<void> => {
  await api.delete(`/work-orders/${id}`)
}
