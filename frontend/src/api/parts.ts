import api from './client'
import type { Part } from '../types'

export const fetchParts = async (q?: string, category?: string, lowStock?: boolean, make?: string, model?: string): Promise<Part[]> => {
  const params: Record<string, string | boolean> = {}
  if (q) params.q = q
  if (category) params.category = category
  if (lowStock) params.low_stock = true
  if (make) params.make = make
  if (model) params.model = model
  const res = await api.get('/parts', { params })
  return res.data
}

export const fetchMakes = async (): Promise<string[]> => {
  const res = await api.get('/parts/makes')
  return res.data
}

export const fetchModelsForMake = async (make: string): Promise<string[]> => {
  const res = await api.get(`/parts/makes/${encodeURIComponent(make)}/models`)
  return res.data
}

export const addCarApplication = async (partId: number, make: string, model?: string): Promise<void> => {
  await api.post(`/parts/${partId}/cars`, null, { params: { make, model } })
}

export const deleteCarApplication = async (partId: number, carId: number): Promise<void> => {
  await api.delete(`/parts/${partId}/cars/${carId}`)
}

export const fetchPart = async (id: number): Promise<Part> => {
  const res = await api.get(`/parts/${id}`)
  return res.data
}

export const fetchPartByBarcode = async (barcode: string): Promise<Part> => {
  const res = await api.get(`/parts/by-barcode/${encodeURIComponent(barcode)}`)
  return res.data
}

export const fetchCategories = async (): Promise<string[]> => {
  const res = await api.get('/parts/categories')
  return res.data
}

export const createPart = async (data: Omit<Partial<Part>, 'barcodes' | 'oem_numbers'> & { barcodes?: string[]; oem_numbers?: { oem_number: string; brand?: string }[] }): Promise<Part> => {
  const res = await api.post('/parts', data)
  return res.data
}

export const updatePart = async (id: number, data: Partial<Part>): Promise<Part> => {
  const res = await api.put(`/parts/${id}`, data)
  return res.data
}

export const addBarcode = async (partId: number, barcode: string, isPrimary = false): Promise<void> => {
  await api.post(`/parts/${partId}/barcodes`, null, { params: { barcode, is_primary: isPrimary } })
}

export const deleteBarcode = async (partId: number, barcodeId: number): Promise<void> => {
  await api.delete(`/parts/${partId}/barcodes/${barcodeId}`)
}

export const addOem = async (partId: number, oem_number: string, brand?: string): Promise<void> => {
  await api.post(`/parts/${partId}/oem`, null, { params: { oem_number, brand } })
}

export const deleteOem = async (partId: number, oemId: number): Promise<void> => {
  await api.delete(`/parts/${partId}/oem/${oemId}`)
}
