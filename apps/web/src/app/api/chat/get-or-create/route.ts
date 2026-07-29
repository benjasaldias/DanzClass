import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

// POST /api/chat/get-or-create
// Body for class chat: { type: 'class', class_id: string }
// Body for rehearsal chat: { type: 'rehearsal', rehearsal_id: string }
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const rlHit = await checkRateLimit(`chat:${auth.user.id}`, 'social')
  if (rlHit) return rlHit

  const admin = createAdminClient()
  const body = await request.json()
  const { type } = body as { type: 'class' | 'rehearsal' }

  if (type === 'class') {
    const { class_id } = body as { class_id: string }
    if (!class_id) return NextResponse.json({ error: 'missing_class_id' }, { status: 400 })

    // Verify the requesting user is enrolled (active) in this class
    const { data: enrollment } = await (admin as any)
      .from('enrollments')
      .select('id, student_id')
      .eq('class_id', class_id)
      .eq('student_id', auth.user.id)
      .neq('status', 'cancelled')
      .maybeSingle()

    // OR they could be the teacher
    const { data: cls } = await (admin as any)
      .from('classes')
      .select('teacher_id')
      .eq('id', class_id)
      .single()

    if (!cls) return NextResponse.json({ error: 'class_not_found' }, { status: 404 })

    const isTeacher = cls.teacher_id === auth.user.id
    if (!enrollment && !isTeacher) {
      return NextResponse.json({ error: 'not_enrolled' }, { status: 403 })
    }

    // Determine the student_id (teacher opens chat with specific student via student_id param)
    let studentId = auth.user.id
    if (isTeacher) {
      const { student_id } = body as { student_id?: string }
      if (!student_id) return NextResponse.json({ error: 'teacher_must_provide_student_id' }, { status: 400 })
      // El `student_id` venía del cliente sin verificar: un profesor podía abrir
      // un chat con CUALQUIER usuario de la plataforma (los ids son enumerables
      // desde Explorar) y quedar como participante para escribirle. El chat de
      // clase existe sólo entre el profesor y alguien inscrito en esa clase.
      const { data: studentEnrollment } = await (admin as any)
        .from('enrollments')
        .select('id')
        .eq('class_id', class_id)
        .eq('student_id', student_id)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (!studentEnrollment) {
        return NextResponse.json({ error: 'student_not_enrolled' }, { status: 403 })
      }
      studentId = student_id
    }

    // Get or create chat
    const { data: existingChat } = await (admin as any)
      .from('chats')
      .select('id')
      .eq('type', 'class')
      .eq('class_id', class_id)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existingChat) return NextResponse.json({ chat_id: existingChat.id })

    // Create chat
    const { data: newChat } = await (admin as any)
      .from('chats')
      .insert({ type: 'class', class_id, student_id: studentId })
      .select()
      .single()

    // Add participants: student + teacher
    await (admin as any).from('chat_participants').insert([
      { chat_id: newChat.id, user_id: studentId },
      { chat_id: newChat.id, user_id: cls.teacher_id },
    ])

    return NextResponse.json({ chat_id: newChat.id })
  }

  if (type === 'rehearsal') {
    const { rehearsal_id } = body as { rehearsal_id: string }
    if (!rehearsal_id) return NextResponse.json({ error: 'missing_rehearsal_id' }, { status: 400 })

    // Verify user is creator or accepted invitee
    const { data: rehearsal } = await (admin as any)
      .from('rehearsals')
      .select('id, creator_id')
      .eq('id', rehearsal_id)
      .single()

    if (!rehearsal) return NextResponse.json({ error: 'rehearsal_not_found' }, { status: 404 })

    const isCreator = rehearsal.creator_id === auth.user.id
    if (!isCreator) {
      const { data: invite } = await (admin as any)
        .from('rehearsal_invites')
        .select('id')
        .eq('rehearsal_id', rehearsal_id)
        .eq('user_id', auth.user.id)
        .eq('status', 'accepted')
        .maybeSingle()
      if (!invite) return NextResponse.json({ error: 'not_participant' }, { status: 403 })
    }

    // Get or create group chat
    const { data: existingChat } = await (admin as any)
      .from('chats')
      .select('id')
      .eq('type', 'rehearsal')
      .eq('rehearsal_id', rehearsal_id)
      .maybeSingle()

    if (existingChat) {
      // Ensure this user is a participant
      await (admin as any)
        .from('chat_participants')
        .upsert({ chat_id: existingChat.id, user_id: auth.user.id }, { onConflict: 'chat_id,user_id' })
      return NextResponse.json({ chat_id: existingChat.id })
    }

    // Create group chat with all accepted participants
    const { data: newChat } = await (admin as any)
      .from('chats')
      .insert({ type: 'rehearsal', rehearsal_id })
      .select()
      .single()

    // Add creator + all accepted invitees
    const { data: invites } = await (admin as any)
      .from('rehearsal_invites')
      .select('user_id')
      .eq('rehearsal_id', rehearsal_id)
      .eq('status', 'accepted')

    const participantIds = [rehearsal.creator_id, ...((invites ?? []) as any[]).map((i: any) => i.user_id)]
    const uniqueIds = [...new Set(participantIds)]
    await (admin as any).from('chat_participants').insert(
      uniqueIds.map((uid) => ({ chat_id: newChat.id, user_id: uid }))
    )

    return NextResponse.json({ chat_id: newChat.id })
  }

  return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
}
