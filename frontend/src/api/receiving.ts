import api from './client'
import type { ReceivingOrder, ReceivingOrderList } from '../types'

export const fetchReceivingOrders = async (): Promise<ReceivingOrderList[]> => {
  const res = await api.get('/receiving')
  return res.data
}

export const fetchReceivingOrder = async (id: number): Promise<ReceivingOrder> => {
  const res = await api.get(`/receiving/${id}`)
  return res.data
}

export interface CreateReceivingData {
  supplier_id?: number
  date?: string
  invoice_number?: string
  notes?: string
  items: { part_id: number; quantity: number; notes?: string }[]
}

export const createReceivingOrder = async (data: CreateReceivingData): Promise<ReceivingOrder> => {
  const res = await api.post('/receiving', data)
  return res.data
}

export const confirmReceivingOrder = async (id: number): Promise<ReceivingOrder> => {
  const res = await api.post(`/receiving/${id}/confirm`)
  return res.data
}

export const deleteReceivingOrder = async (id: number): Promise<void> => {
  await api.delete(`/receiving/${id}`)
}
