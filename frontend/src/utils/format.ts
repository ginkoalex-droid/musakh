/**
 * Format quantity: remove trailing zeros, max 3 decimals
 * 9.500 → "9.5", 1.000 → "1", 0.250 → "0.25"
 */
export function fmtQty(value: number): string {
  if (value === undefined || value === null) return '0'
  const n = parseFloat(Number(value).toFixed(3))
  return n.toString()
}

export function parseQty(val: string): number {
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000
}

/** Decimal input step based on unit: liters/kg/meters → 0.001, others → 1 */
export function qtyStep(unit: string): string {
  const u = unit?.toLowerCase()
  return ['л', 'l', 'кг', 'kg', 'м', 'm', 'г', 'g'].includes(u) ? '0.001' : '1'
}

/** Min value based on unit */
export function qtyMin(unit: string): string {
  return qtyStep(unit) === '1' ? '1' : '0.001'
}
