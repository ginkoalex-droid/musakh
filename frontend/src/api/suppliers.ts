import api from './client'
import type { Supplier } from '../types'

export const fetchSuppliers = async (): Promise<Supplier[]> => {
  const res = await api.get('/suppliers')
  return res.data
}

export const createSupplier = async (data: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> => {
  const res = await api.post('/suppliers', data)
  return res.data
}

export const updateSupplier = async (id: number, data: Partial<Supplier>): Promise<Supplier> => {
  const res = await api.put(`/suppliers/${id}`, data)
  return res.data
}

export const deleteSupplier = async (id: number): Promise<void> => {
  await api.delete(`/suppliers/${id}`)
}
