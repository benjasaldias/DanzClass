import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { createAdminClient } from './supabase/admin'
import { logger } from './logger'

// Emisión y revocación de tokens QR de asistencia (migración 054).
//
// El token que porta el QR es OPACO y NO FORJABLE: su valor es un HMAC-SHA256
// (con QR_TOKEN_SECRET, secreto de servidor que NUNCA toca la DB) sobre
// enrollment_id + student_id + nonce. El nonce aleatorio por token añade
// entropía (los UUID de enrollment/student son adivinables) y permite ROTAR el
// token al reactivar una inscripción, invalidando cualquier screenshot del QR
// revocado. La DB guarda el nonce + el token resultante (lookup indexado en la
// validación); el secreto solo vive en env.
//
// Este módulo NO se ejecuta en el hot path del alumno: la emisión se dispara
// dentro de autoConfirmPayment() (los 3 caminos de confirmación de pago) y toda
// falla se loguea sin romper la confirmación del pago.

type AdminClient = ReturnType<typeof createAdminClient>

function computeToken(enrollmentId: string, studentId: string, nonce: string): string {
  const secret = process.env.QR_TOKEN_SECRET
  if (!secret) throw new Error('QR_TOKEN_SECRET no configurado')
  return createHmac('sha256', secret)
    .update(`${enrollmentId}:${studentId}:${nonce}`)
    .digest('base64url')
}

// Verifica que un token escaneado corresponda al HMAC de su fila
// (enrollment_id + student_id + nonce) con el secreto de servidor ACTUAL.
// Comparación en tiempo constante. Devuelve false si el secreto no está
// configurado, si el token fue alterado, o si el secreto rotó (invalida
// tokens viejos → deben re-emitirse). Nunca lanza.
export function verifyAttendanceToken(params: {
  enrollmentId: string
  studentId: string
  nonce: string
  token: string
}): boolean {
  try {
    const expected = computeToken(params.enrollmentId, params.studentId, params.nonce)
    const a = Buffer.from(expected)
    const b = Buffer.from(params.token)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Emite (o reactiva/rota) el token QR de una inscripción confirmada.
// Idempotente por UNIQUE(enrollment_id): en re-inscripción rota nonce+token,
// pone status='active' y limpia revoked_at. Best-effort: nunca lanza.
//
// Un token ACTIVO no se rota: desde el cobro mensual de entrenamientos
// (migración 068) esta función se llama una vez por mes pagado, y rotar en cada
// pago invalidaría el QR que el alumno ya tiene guardado como captura de
// pantalla — cada mes tendría que volver a abrir la app antes de entrar a
// clase. La rotación se conserva donde importa: si el token está revocado (el
// alumno se salió y volvió), se emite uno nuevo y la captura vieja deja de
// servir, que es exactamente la garantía que da la revocación.
export async function issueAttendanceToken(
  admin: AdminClient,
  params: { enrollmentId: string; studentId: string; classId: string }
): Promise<void> {
  try {
    const { data: current } = await (admin as any)
      .from('qr_tokens')
      .select('id, status')
      .eq('enrollment_id', params.enrollmentId)
      .maybeSingle()

    if (current?.status === 'active') return

    const nonce = randomBytes(16).toString('hex')
    const token = computeToken(params.enrollmentId, params.studentId, nonce)

    const { error } = await (admin as any)
      .from('qr_tokens')
      .upsert(
        {
          enrollment_id: params.enrollmentId,
          student_id: params.studentId,
          class_id: params.classId,
          token,
          nonce,
          status: 'active',
          revoked_at: null,
        },
        { onConflict: 'enrollment_id' }
      )

    if (error) {
      logger.error('qr_token_issue_failed', error, { enrollmentId: params.enrollmentId })
    }
  } catch (err) {
    logger.error('qr_token_issue_failed', err, { enrollmentId: params.enrollmentId })
  }
}

// Revoca (soft) el token QR de una inscripción. No borra la fila — la asistencia
// histórica debe preservarse. Best-effort: nunca lanza.
export async function revokeAttendanceToken(
  admin: AdminClient,
  enrollmentId: string
): Promise<void> {
  try {
    const { error } = await (admin as any)
      .from('qr_tokens')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('enrollment_id', enrollmentId)
      .eq('status', 'active')

    if (error) {
      logger.error('qr_token_revoke_failed', error, { enrollmentId })
    }
  } catch (err) {
    logger.error('qr_token_revoke_failed', err, { enrollmentId })
  }
}
