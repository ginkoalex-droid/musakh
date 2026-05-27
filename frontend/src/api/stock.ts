import api from './client'
import type { StockRow, Movement } from '../types'

export const fetchStock = async (lowOnly?: boolean, category?: string): Promise<StockRow[]> => {
  const params: Record<string, string | boolean> = {}
  if (lowOnly) params.low_only = true
  if (category) params.category = category
  const res = await api.get('/stock', { params })
  return res.data
}

export const fetchMovements = async (partId?: number, limit = 100): Promise<Movement[]> => {
  const params: Record<string, number> = { limit }
  if (partId) params.part_id = partId
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
