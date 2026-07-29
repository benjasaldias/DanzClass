import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { logger } from '@/lib/logger'
import { formatBillingPeriod, isChargeOverdue, todayInChile } from '@danceclass/shared'

// Vercel Cron, diario a las 06:00 UTC.
//
// Cobro mensual de entrenamientos (audit.md S4, migración 068):
//   1. Emite los cargos faltantes de cada inscripción activa de entrenamiento
//      llamando a `generate_monthly_charges()`. La función genera TODOS los
//      períodos que falten, no sólo el del mes en curso, así que un día en que
//      el cron no corra no deja huecos en la deuda.
//   2. Avisa al alumno de cada cargo nuevo, y otra vez cuando ese cargo vence
//      (que es el momento en que pierde el acceso por QR a la clase).
//
// Lo que este cron NO hace, a propósito: no cancela ninguna inscripción. En un
// entrenamiento el alumno queda inscrito de forma permanente tras la audición y
// la única consecuencia de no pagar es perder el QR (audit.md §0). La deuda se
// acumula; ningún mes se borra ni se anula.

export const runtime = 'nodejs'
export const maxDuration = 60

// Ventana de deduplicación de avisos: basta con cubrir holgadamente la vida de
// un cargo impago reciente. Un cargo mucho más viejo ya avisó en su momento.
const NOTIFY_LOOKBACK_DAYS = 120

async function pingHealthcheck(uuid: string | undefined) {
  if (!uuid) return
  try {
    await fetch(`https://hc-ping.com/${uuid}`, { signal: AbortSignal.timeout(5000) })
  } catch {
    // non-critical
  }
}

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    logger.error('monthly-charges', 'CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const errors: string[] = []

  // ── 1. Emitir los cargos faltantes ────────────────────────────────────────
  let created = 0
  const { data: genData, error: genErr } = await (admin as any).rpc('generate_monthly_charges')
  if (genErr) {
    errors.push(`generate: ${genErr.message}`)
    logger.error('monthly-charges:generate_failed', genErr.message)
  } else {
    created = Number(genData ?? 0)
  }

  // ── 2. Avisos al alumno ───────────────────────────────────────────────────
  // Un aviso por cargo y por hito ('due' al emitirse, 'overdue' al vencer). La
  // deduplicación es por la existencia de la notificación, no por una marca de
  // tiempo en el cargo: así el aviso se manda una sola vez aunque el cron corra
  // varias veces el mismo día, y el hito 'overdue' se dispara exactamente el día
  // en que el cargo cruza su vencimiento.
  const today = todayInChile()

  const { data: unpaid, error: unpaidErr } = await (admin as any)
    .from('payments')
    .select(`
      id, amount, status, billing_period,
      enrollment:enrollments!inner(
        id, student_id, status,
        class:classes!inner(id, title, type, status, billing_day)
      )
    `)
    .not('billing_period', 'is', null)
    .in('status', ['due', 'rejected'])

  if (unpaidErr) {
    errors.push(`unpaid: ${unpaidErr.message}`)
    logger.error('monthly-charges:unpaid_query_failed', unpaidErr.message)
    await pingHealthcheck(process.env.HEALTHCHECK_MONTHLY_CHARGES_UUID)
    return NextResponse.json({ created, notified: 0, errors })
  }

  const pending = (unpaid ?? []).filter(
    (p: any) =>
      p.enrollment?.status !== 'cancelled' &&
      p.enrollment?.class?.type === 'entrenamiento' &&
      p.enrollment?.class?.status === 'active'
  )

  let notified = 0
  if (pending.length > 0) {
    const studentIds = Array.from(new Set(pending.map((p: any) => p.enrollment.student_id)))
    const since = new Date(Date.now() - NOTIFY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: sent } = await (admin as any)
      .from('notifications')
      .select('user_id, data')
      .eq('type', 'payment_reminder')
      .in('user_id', studentIds)
      .gte('created_at', since)

    const alreadySent = new Set(
      (sent ?? [])
        .filter((n: any) => n.data?.billing_period)
        .map((n: any) => `${n.user_id}|${n.data.class_id}|${n.data.billing_period}|${n.data.charge_stage}`)
    )

    const rows: any[] = []
    const pushes: { userId: string; title: string; body: string; classId: string; enrollmentId: string }[] = []

    for (const p of pending) {
      const cls = p.enrollment.class
      const overdue = isChargeOverdue(
        { billing_period: p.billing_period, status: p.status },
        cls.billing_day ?? 1,
        today
      )
      const stage = overdue ? 'overdue' : 'due'
      const key = `${p.enrollment.student_id}|${cls.id}|${p.billing_period}|${stage}`
      if (alreadySent.has(key)) continue
      alreadySent.add(key)

      const month = formatBillingPeriod(p.billing_period)
      rows.push({
        user_id: p.enrollment.student_id,
        type: 'payment_reminder',
        data: {
          class_id: cls.id,
          class_title: cls.title,
          enrollment_id: p.enrollment.id,
          billing_period: p.billing_period,
          charge_stage: stage,
          amount: p.amount,
        },
      })
      pushes.push({
        userId: p.enrollment.student_id,
        title: overdue ? 'Mensualidad vencida' : 'Nueva mensualidad',
        body: overdue
          ? `Debes ${month} de "${cls.title}". Mientras tanto tu QR de acceso no funciona.`
          : `${month} de "${cls.title}": ${clp(p.amount)}`,
        classId: cls.id,
        enrollmentId: p.enrollment.id,
      })
    }

    if (rows.length > 0) {
      const { error: insErr } = await (admin as any).from('notifications').insert(rows)
      if (insErr) {
        errors.push(`notify: ${insErr.message}`)
        logger.error('monthly-charges:notify_failed', insErr.message)
      } else {
        notified = rows.length
        // Push best-effort: nunca bloquea ni falla el cron (D-6 del audit — los
        // recordatorios son justamente las notificaciones que más valen fuera
        // de la app).
        for (const p of pushes) {
          sendPushToUsers([p.userId], {
            title: p.title,
            body: p.body,
            data: { type: 'payment_reminder', class_id: p.classId, enrollment_id: p.enrollmentId },
          }).catch(() => {})
        }
      }
    }
  }

  logger.info('monthly-charges:done', { created, notified, pending: pending.length, errors: errors.length })
  await pingHealthcheck(process.env.HEALTHCHECK_MONTHLY_CHARGES_UUID)

  return NextResponse.json({ created, notified, pending: pending.length, errors })
}
