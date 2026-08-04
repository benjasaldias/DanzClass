import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const UpdateSchema = z.object({
  rehearsal_id: z.string().uuid('rehearsal_id inválido'),
  title: z.string().min(1, 'El título es requerido').max(100),
  description: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  date_mode: z.enum(['single', 'custom', 'coordinate']),
  rehearsal_date: z.string().max(10).optional().nullable(),
  rehearsal_time: z.string().max(5).optional().nullable(),
  custom_dates: z.array(z.string().max(10)).max(60).optional().nullable(),
  coordinate_month: z.string().max(7).optional().nullable(),
  duration_minutes: z.number().int().min(10).max(480).optional(),
})

const DeleteSchema = z.object({
  rehearsal_id: z.string().uuid('rehearsal_id inválido'),
})

export async function PUT(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await req.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { rehearsal_id, title, description, city, location, date_mode, rehearsal_date, rehearsal_time, custom_dates, coordinate_month, duration_minutes } = parsed.data

  // Verify ownership
  const { data: existing } = await (supabase as any)
    .from('rehearsals')
    .select('id, creator_id, date_mode, rehearsal_date, rehearsal_time, duration_minutes, confirmed_at')
    .eq('id', rehearsal_id)
    .eq('creator_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Ensayo no encontrado o sin permisos' }, { status: 404 })

  // Un ensayo `coordinate` que YA fijó fecha por votación la conserva al
  // editarlo: el `: null` de las tres ramas de abajo la borraba en silencio, así
  // que cambiarle el título a un ensayo ya coordinado lo devolvía a "sin fecha"
  // —y con él, su caducidad volvía a ser el fin del mes— sin que nadie se
  // enterara. Cambiar una fecha ya fijada es un flujo aparte (volver a
  // `single`), no un efecto lateral de guardar el formulario.
  const keepsSettledDate =
    date_mode === 'coordinate' && existing.date_mode === 'coordinate' && !!existing.rehearsal_date

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from('rehearsals')
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      city: city?.trim() || null,
      location: location?.trim() || null,
      date_mode,
      rehearsal_date: date_mode === 'single'
        ? rehearsal_date || null
        : (keepsSettledDate ? existing.rehearsal_date : null),
      rehearsal_time: date_mode === 'single'
        ? rehearsal_time || null
        : (keepsSettledDate ? existing.rehearsal_time : null),
      custom_dates: date_mode === 'custom' ? (custom_dates ?? []) : null,
      coordinate_month: date_mode === 'coordinate' ? coordinate_month || null : null,
      // La duración de una fecha fijada sale del rango que se votó; el input del
      // formulario no puede pisarla.
      duration_minutes: keepsSettledDate
        ? (existing.duration_minutes ?? 60)
        : (duration_minutes ?? 60),
      confirmed_at: keepsSettledDate ? existing.confirmed_at : null,
    })
    .eq('id', rehearsal_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { rehearsal_id } = parsed.data

  const { data: existing } = await (supabase as any)
    .from('rehearsals')
    .select('id, creator_id')
    .eq('id', rehearsal_id)
    .eq('creator_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const admin = createAdminClient()
  await (admin as any).from('rehearsals').update({ status: 'cancelled' }).eq('id', rehearsal_id)

  return NextResponse.json({ ok: true })
}
