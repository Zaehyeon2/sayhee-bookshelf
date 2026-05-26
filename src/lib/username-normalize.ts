const FORBIDDEN = /[\s/?#@&]/

export function normalizeUsername(input: string): string {
  return input.trim().normalize('NFC').toLowerCase()
}

export function isValidUsername(value: string): boolean {
  if (value.length < 2 || value.length > 20) return false
  if (FORBIDDEN.test(value)) return false
  return true
}
