import type { UserRole } from '../types'

export function canIssue(role: UserRole): boolean {
  return role !== 'readonly'
}

export function canWarehouse(role: UserRole): boolean {
  return role === 'admin' || role === 'warehouse'
}

export function canAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export const roleLabels: Record<UserRole, { ru: string; en: string; he: string }> = {
  admin:     { ru: 'Администратор', en: 'Admin',         he: 'מנהל מערכת' },
  warehouse: { ru: 'Склад',         en: 'Warehouse',     he: 'מחסנאי' },
  mechanic:  { ru: 'Механик',       en: 'Mechanic',      he: 'מכונאי' },
  readonly:  { ru: 'Только просмотр', en: 'Read only',   he: 'צפייה בלבד' },
}
