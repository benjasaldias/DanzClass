import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CreateEventForm from '@/components/event/CreateEventForm'

export default async function CreateEventPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('city')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">Crear evento</h1>
      <p className="text-sm text-gray-500 dark:text-dark-text2 mb-8">
        Batallas, masterclasses y otros eventos de la comunidad
      </p>
      <CreateEventForm userId={user.id} userCity={profile?.city ?? null} />
    </div>
  )
}
