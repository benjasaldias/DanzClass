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
