import api from './client'
import type { StockRow, Movement } from '../types'

export const fetchStock = async (lowOnly?: boolean, category?: string): Promise<StockRow[]> => {
  const params: Record<string, string | boolean> = {}
  if (lowOnly) params.low_only = true
  if (category) params.category = category
  const res = await api.get('/stock', { params })
  return res.data
}

export interface MovementFilters {
  partId?: number
  userId?: number
  fromDate?: string
  toDate?: string
  movementType?: string
  limit?: number
}

export const fetchMovements = async (filters: MovementFilters = {}): Promise<Movement[]> => {
  const params: Record<string, string | number> = { limit: filters.limit || 500 }
  if (filters.partId) params.part_id = filters.partId
  if (filters.userId) params.user_id = filters.userId
  if (filters.fromDate) params.from_date = filters.fromDate
  if (filters.toDate) params.to_date = filters.toDate
  if (filters.movementType) params.movement_type = filters.movementType
  const res = await api.get('/stock/movements', { params })
  return res.data
}

export const adjustStock = async (part_id: number, quantity: number, notes: string): Promise<Movement> => {
  const res = await api.post('/stock/adjust', { part_id, quantity, notes })
  return res.data
}

export const issueParts = async (part_id: number, quantity: number, work_order_number: string, notes?: string): Promise<Movement> => {
  const res = await api.post('/stock/issue', { part_id, quantity, work_order_number, notes })
  return res.data
}

export const exportStock = () => {
  window.open('/api/export/stock', '_blank')
}

export const exportMovements = () => {
  window.open('/api/export/movements', '_blank')
}
