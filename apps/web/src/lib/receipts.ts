import type { createAdminClient } from './supabase/admin'
import { logger } from './logger'

// Acceso al bucket privado de comprobantes desde el servidor.
//
// `payments.receipt_url` guarda un PATH desde la migración 029 (el bucket dejó
// de ser público y se muestra vía signed URL), pero pueden quedar filas viejas
// con la URL pública completa. Toda limpieza tiene que tolerar ambos formatos:
// esa normalización estaba copiada en tres puntos del cron.

const BUCKET = 'payment-receipts'

type AdminClient = ReturnType<typeof createAdminClient>

/** Path dentro del bucket, tolerando el formato legacy de URL completa. */
export function receiptStoragePath(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.includes(`/${BUCKET}/`) ? value.split(`/${BUCKET}/`)[1] : value
  const clean = (raw ?? '').split('?')[0]
  return clean || null
}

/**
 * ¿Existe de verdad el objeto en el bucket? (audit3 P0-1)
 *
 * El archivo lo sube el CLIENTE (necesita los bytes) y el registro del pago va
 * por una ruta de servidor, así que el path llega en el body. Validar sólo el
 * prefijo `<userId>/` —lo que exige la policy de INSERT del bucket— comprueba
 * que el path sea de quien dice ser, no que haya algo ahí: bastaba con saltarse
 * la subida y mandar un nombre inventado para que el pago pasara a "en
 * revisión" sin nada que revisar. En un entrenamiento eso sacaba la deuda de
 * "vencida" y devolvía el QR de acceso; en una clase con reserva borraba el
 * `hold_expires_at` y el cupo quedaba tomado.
 *
 * Se resuelve con `list(dir, { search })` y no con `createSignedUrl`: firmar
 * una URL de un objeto ausente devuelve un error genérico que no distingue
 * "no existe" de "no se pudo firmar", y de paso emitiría una URL válida por
 * cada intento. `search` es una coincidencia parcial, así que el nombre se
 * compara exacto.
 *
 * Ante un error de Storage devuelve `false`: en la duda, el pago no se
 * registra (el alumno reintenta) antes que darlo por bueno.
 */
export async function receiptObjectExists(
  admin: AdminClient,
  value: string | null | undefined
): Promise<boolean> {
  const path = receiptStoragePath(value)
  if (!path) return false
  const slash = path.lastIndexOf('/')
  if (slash <= 0) return false
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  if (!name) return false

  try {
    const { data, error } = await admin.storage.from(BUCKET).list(dir, { search: name, limit: 100 })
    if (error) {
      logger.warn('receipt_exists_check_failed', { path, reason: error.message })
      return false
    }
    return (data ?? []).some((obj: { name: string }) => obj.name === name)
  } catch (err) {
    logger.warn('receipt_exists_check_failed', { path, reason: (err as Error).message })
    return false
  }
}

/** Borra el objeto de un comprobante. Best-effort: nunca lanza. */
export async function deleteReceiptObject(
  admin: AdminClient,
  value: string | null | undefined
): Promise<void> {
  const path = receiptStoragePath(value)
  if (!path) return
  try {
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) logger.warn('receipt_delete_failed', { path, reason: error.message })
  } catch (err) {
    logger.warn('receipt_delete_failed', { path, reason: (err as Error).message })
  }
}
