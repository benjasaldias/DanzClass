import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditEventForm from '@/components/event/EditEventForm'

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: event } = await (supabase as any)
    .from('events')
    .select('*')
    .eq('id', params.id)
    .eq('creator_id', user.id)
    .single()

  if (!event) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">Editar evento</h1>
      <p className="text-sm text-gray-500 dark:text-dark-text2 mb-8">{event.title}</p>
      <EditEventForm event={event} userId={user.id} />
    </div>
  )
}
