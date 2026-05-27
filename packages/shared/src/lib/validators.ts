// Shared field validators (reusable in web + mobile)

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/

export function validateUsername(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!v) return 'El usuario es requerido'
  if (v.length < 3) return 'Mínimo 3 caracteres'
  if (v.length > 20) return 'Máximo 20 caracteres'
  if (!USERNAME_REGEX.test(v)) return 'Solo letras minúsculas, números y _ (sin espacios ni símbolos)'
  return null
}

export function validateFullName(value: string): string | null {
  const v = value.trim()
  if (!v) return 'El nombre es requerido'
  if (v.length > 100) return 'Máximo 100 caracteres'
  return null
}

export function validateBio(value: string): string | null {
  if (value.length > 300) return 'Máximo 300 caracteres'
  return null
}

export function validateInstagramHandle(value: string): string | null {
  if (!value) return null
  const v = value.trim().replace(/^@/, '')
  if (v.length > 30) return 'Máximo 30 caracteres'
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(v)) return 'Formato inválido (solo letras, números, . y _)'
  return null
}

export function validateChileanPhone(value: string): string | null {
  if (!value) return null
  const v = value.trim().replace(/\s/g, '')
  if (!/^(\+56|56)?[9][0-9]{8}$/.test(v)) return 'Ingresa un número celular chileno válido (ej: +569 1234 5678)'
  return null
}

/** Validates Chilean RUT including check digit */
export function validateRut(rut: string): string | null {
  if (!rut) return 'El RUT es requerido'
  const cleaned = rut.replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return 'RUT inválido'
  const digits = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  let sum = 0
  let mul = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const expected = 11 - (sum % 11)
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  if (dv !== expectedDv) return 'Dígito verificador incorrecto'
  return null
}
