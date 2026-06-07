import api from './client'

export interface IssueItem {
  id: number
  part_id: number
  part_name: string
  quantity: number
  notes?: string
  barcode?: string
  oem_number?: string
  part_unit?: string
  default_issue_qty?: number
  is_passthrough?: boolean
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

export const fetchIssueOrders = async (filters?: { work_order_id?: number } | number): Promise<IssueOrderList[]> => {
  const params: Record<string, number> = {}
  if (typeof filters === 'number') {
    if (filters) params.work_order_id = filters
  } else if (filters?.work_order_id) {
    params.work_order_id = filters.work_order_id
  }
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

export const reopenIssueOrder = async (id: number): Promise<IssueOrder> => {
  const res = await api.post(`/issues/${id}/reopen`)
  return res.data
}

export const deleteIssueOrder = async (id: number): Promise<void> => {
  await api.delete(`/issues/${id}`)
}

export const addIssueItem = async (orderId: number, part_id: number, quantity: number, notes?: string, is_passthrough?: boolean): Promise<IssueOrder> => {
  const res = await api.post(`/issues/${orderId}/items`, { part_id, quantity, notes, is_passthrough })
  return res.data
}

export const removeIssueItem = async (orderId: number, itemId: number): Promise<IssueOrder> => {
  const res = await api.delete(`/issues/${orderId}/items/${itemId}`)
  return res.data
}

export const updateIssueItemQty = async (orderId: number, itemId: number, quantity: number): Promise<IssueOrder> => {
  const res = await api.patch(`/issues/${orderId}/items/${itemId}`, null, { params: { quantity } })
  return res.data
}
