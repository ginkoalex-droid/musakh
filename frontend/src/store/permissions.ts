import type { UserRole } from '../types'

/** Mechanic + Warehouse + Admin: can create/confirm WO and issue parts */
export function canIssue(role: UserRole): boolean {
  return role === 'admin' || role === 'warehouse' || role === 'mechanic'
}

/** Warehouse + Admin: receiving, parts catalog, stock adjustment, export */
export function canWarehouse(role: UserRole): boolean {
  return role === 'admin' || role === 'warehouse'
}

/** Admin only: cancel confirmations, delete confirmed docs, adjustments reversal */
export function canAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export const roleLabels: Record<string, { ru: string; en: string; he: string }> = {
  admin:     { ru: 'Администратор',  en: 'Admin',     he: 'מנהל מערכת' },
  warehouse: { ru: 'Склад',          en: 'Warehouse', he: 'מחסנאי' },
  mechanic:  { ru: 'Механик',        en: 'Mechanic',  he: 'מכונאי' },
  readonly:  { ru: 'Только просмотр',en: 'Read only', he: 'צפייה בלבד' },
}
