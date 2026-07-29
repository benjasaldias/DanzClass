// Tipo de archivo de un comprobante de pago, derivado del CONTENIDO.
//
// D-4 del audit: la pantalla de pago validaba los magic bytes del archivo con
// rigor (JPEG/PNG/PDF/WEBP) y después construía el nombre del objeto en Storage
// con `receipt.name.split('.').pop()` — o sea, con la extensión que el usuario
// eligiera. Un PNG válido llamado `comprobante.svg` pasaba la validación de
// contenido y quedaba guardado como `.svg`: `isPdfPath()` no lo reconoce y el
// navegador puede interpretarlo como SVG al abrir la URL firmada en una pestaña
// nueva (y un SVG ejecuta script en el origen de Supabase Storage).
//
// La regla es simple: **la extensión y el content-type salen del tipo ya
// validado, nunca del input del usuario**. Este módulo es la única fuente de
// esa correspondencia, compartida por web y mobile.

export type ReceiptExt = 'jpg' | 'png' | 'webp' | 'pdf'

export interface ReceiptFileType {
  ext: ReceiptExt
  mime: string
}

/** MIME types aceptados para un comprobante. */
export const RECEIPT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/** Bytes necesarios para decidir el tipo (WEBP necesita hasta el byte 11). */
export const RECEIPT_MAGIC_BYTES = 12

function startsWith(bytes: ArrayLike<number>, offset: number, hex: string): boolean {
  for (let i = 0; i * 2 < hex.length; i++) {
    const expected = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (bytes[offset + i] !== expected) return false
  }
  return true
}

/**
 * Identifica el tipo de un comprobante por sus primeros bytes.
 * Devuelve `null` si no es ninguno de los formatos aceptados.
 *
 * `head` son los primeros RECEIPT_MAGIC_BYTES bytes del archivo (basta con los
 * que haya: un archivo más corto simplemente no coincide con nada).
 */
export function detectReceiptType(head: ArrayLike<number>): ReceiptFileType | null {
  if (startsWith(head, 0, 'ffd8ff')) return { ext: 'jpg', mime: 'image/jpeg' }
  if (startsWith(head, 0, '89504e47')) return { ext: 'png', mime: 'image/png' }
  if (startsWith(head, 0, '25504446')) return { ext: 'pdf', mime: 'application/pdf' }
  // WEBP = contenedor RIFF con el tag 'WEBP' en el byte 8. Chequear solo 'RIFF'
  // aceptaría además AVI y WAV, que no son comprobantes de nada.
  if (startsWith(head, 0, '52494646') && startsWith(head, 8, '57454250')) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

/** ¿El path/URL de un comprobante apunta a un PDF? (para elegir visor o <img>) */
export function isPdfReceipt(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false
  return pathOrUrl.split('?')[0].toLowerCase().endsWith('.pdf')
}
