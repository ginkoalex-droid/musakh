import api from './client'

export interface IssueItem {
  id: number
  part_id: number
  part_name: string
  quantity: number
  notes?: string
  barcode?: string
  oem_number?: string
}

export interface IssueOrder {
  id: number
  work_order_id?: number
  work_order_number: string
  mechanic_name?: string
  date: string
  notes?: string
  is_confirmed: boolean
  is_cancelled: boolean
  cancelled_by_name?: string
  cancelled_at?: string
  created_by_name: string
  created_at: string
  items: IssueItem[]
}

export interface IssueOrderList {
  id: number
  work_order_id?: number
  work_order_number: string
  mechanic_name?: string
  date: string
  notes?: string
  is_confirmed: boolean
  is_cancelled: boolean
  item_count: number
  total_qty: number
  created_by_name: string
  created_at: string
}

export const fetchIssueOrders = async (workOrderId?: number): Promise<IssueOrderList[]> => {
  const params: Record<string, number> = {}
  if (workOrderId) params.work_order_id = workOrderId
  const res = await api.get('/issues', { params })
  return res.data
}

export const fetchIssueOrder = async (id: number): Promise<IssueOrder> => {
  const res = await api.get(`/issues/${id}`)
  return res.data
}

export const createIssueOrder = async (data: {
  work_order_id?: number
  work_order_number: string
  notes?: string
  items: { part_id: number; quantity: number; notes?: string }[]
}): Promise<IssueOrder> => {
  const res = await api.post('/issues', data)
  return res.data
}

export const confirmIssueOrder = async (id: number): Promise<IssueOrder> => {
  const res = await api.post(`/issues/${id}/confirm`)
  return res.data
}

export const cancelIssueOrder = async (id: number): Promise<IssueOrder> => {
  const res = await api.post(`/issues/${id}/cancel`)
  return res.data
}

export const deleteIssueOrder = async (id: number): Promise<void> => {
  await api.delete(`/issues/${id}`)
}
