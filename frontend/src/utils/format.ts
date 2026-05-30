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
