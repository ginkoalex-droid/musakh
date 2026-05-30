export type UserRole = 'admin' | 'warehouse' | 'mechanic' | 'readonly'

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Barcode {
  id: number
  barcode: string
  is_primary: boolean
}

export interface CarApplication {
  id: number
  make: string
  model?: string
}

export interface OemNumber {
  id: number
  oem_number: string
  brand?: string
}

export interface Part {
  id: number
  name: string
  brand?: string
  category?: string
  unit: string
  min_stock: number
  track_min_stock: boolean
  location?: string
  notes?: string
  stock_qty: number
  barcodes: Barcode[]
  oem_numbers: OemNumber[]
  car_applications: CarApplication[]
  created_at: string
}

export interface Supplier {
  id: number
  name: string
  phone?: string
  contact_name?: string
  email?: string
  notes?: string
  created_at: string
}

export interface ReceivingItem {
  id: number
  part_id: number
  part_name: string
  quantity: number   // float
  notes?: string
  barcode?: string
  oem_number?: string
}

export interface ReceivingOrder {
  id: number
  supplier_id?: number
  supplier_name?: string
  date: string
  invoice_number?: string
  notes?: string
  is_confirmed: boolean
  is_cancelled: boolean
  cancelled_by_name?: string
  cancelled_at?: string
  created_by_name: string
  created_at: string
  items: ReceivingItem[]
}

export interface ReceivingOrderList {
  id: number
  supplier_name?: string
  date: string
  invoice_number?: string
  is_confirmed: boolean
  is_cancelled: boolean
  item_count: number
  total_qty: number
  created_by_name: string
  created_at: string
}

export type MovementType = 'receiving' | 'issue' | 'adjustment' | 'return' | 'cancellation'

export interface Movement {
  id: number
  part_id: number
  part_name: string
  movement_type: MovementType
  quantity: number   // float
  quantity_before: number
  quantity_after: number
  reference_type?: string
  reference_id?: number
  work_order_number?: string
  notes?: string
  created_by_name: string
  created_at: string
}

export interface StockRow {
  part_id: number
  part_name: string
  brand?: string
  category?: string
  unit: string
  location?: string
  quantity: number
  min_stock: number
  track_min_stock: boolean
  is_low: boolean
  first_oem?: string
  first_barcode?: string
  car_labels: string[]
}
