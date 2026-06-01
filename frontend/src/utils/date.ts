/**
 * Parse date string from API (stored as UTC without Z suffix).
 * Appends Z so browser correctly converts to local timezone (Israel UTC+3).
 */
export function parseApiDate(s: string | undefined | null): Date {
  if (!s) return new Date(0)
  // If no timezone info, treat as UTC
  if (!s.endsWith('Z') && !s.includes('+') && !s.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(s + 'Z')
  }
  return new Date(s)
}

export function fmtDateTime(s: string | undefined | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!s) return '—'
  return parseApiDate(s).toLocaleString('default', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
    ...opts,
  })
}

export function fmtDate(s: string | undefined | null): string {
  if (!s) return '—'
  return parseApiDate(s).toLocaleDateString('default', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function fmtTime(s: string | undefined | null): string {
  if (!s) return '—'
  return parseApiDate(s).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })
}
