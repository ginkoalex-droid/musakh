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

/** Mechanic + Admin only: can create/close/edit WOs */
export function canManageWO(role: UserRole): boolean {
  return role === 'admin' || role === 'mechanic'
}

/** Warehouse + Admin + Mechanic: can view WO list (read-only for warehouse) */
export function canViewWO(role: UserRole): boolean {
  return role === 'admin' || role === 'mechanic' || role === 'warehouse'
}

/** Warehouse + Admin: can create non-WO issues (sale, other) */
export function canIssueNonWO(role: UserRole): boolean {
  return role === 'admin' || role === 'warehouse'
}

/** Alias for backward compat */
export const canCloseWO = canManageWO

export const roleLabels: Record<string, { ru: string; en: string; he: string }> = {
  admin:     { ru: 'Администратор',  en: 'Admin',     he: 'מנהל מערכת' },
  warehouse: { ru: 'Склад',          en: 'Warehouse', he: 'מחסנאי' },
  mechanic:  { ru: 'Механик',        en: 'Mechanic',  he: 'מכונאי' },
  readonly:  { ru: 'Только просмотр',en: 'Read only', he: 'צפייה בלבד' },
}
