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

/** Decimal input step based on unit */
export function qtyStep(unit: string): string {
  const u = (unit || '').toLowerCase()
  if (['л', 'l'].includes(u)) return '0.05'           // litres: 50ml steps
  if (['кг', 'kg', 'г', 'g', 'м', 'm'].includes(u)) return '0.001'
  return '1'
}

/** Min value based on unit — always 0 for fractional units so step grid starts correctly */
export function qtyMin(unit: string): string {
  return qtyStep(unit) === '1' ? '1' : '0'
}
