import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    rehearsal_id, title, description, city, location,
    date_mode, rehearsal_date, rehearsal_time, custom_dates,
    coordinate_month, duration_minutes,
  } = body

  if (!rehearsal_id) return NextResponse.json({ error: 'rehearsal_id requerido' }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })

  // Verify ownership
  const { data: existing } = await (supabase as any)
    .from('rehearsals')
    .select('id, creator_id')
    .eq('id', rehearsal_id)
    .eq('creator_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Ensayo no encontrado o sin permisos' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from('rehearsals')
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      city: city?.trim() || null,
      location: location?.trim() || null,
      date_mode,
      rehearsal_date: date_mode === 'single' ? rehearsal_date || null : null,
      rehearsal_time: date_mode === 'single' ? rehearsal_time || null : null,
      custom_dates: date_mode === 'custom' ? (custom_dates ?? []) : null,
      coordinate_month: date_mode === 'coordinate' ? coordinate_month || null : null,
      duration_minutes: duration_minutes ?? 60,
    })
    .eq('id', rehearsal_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rehearsal_id } = await req.json()

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
