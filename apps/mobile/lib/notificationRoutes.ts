// Fuente única de "a qué pantalla lleva esta notificación" — compartida por el
// tap en la lista (`app/(app)/notifications.tsx`) y el tap sobre un push
// (`app/(app)/_layout.tsx`, audit3 P1-6).
//
// Antes cada canal tenía su propia historia: la lista sí navegaba (con esta
// misma lógica, copiada ahí) y el listener de push era un callback vacío con
// el comentario "Navigation on tap is handled by expo-router's deep link
// support" — premisa falsa, porque `sendPushToUsers` nunca manda un campo
// `url` (lo único que expo-router sigue automáticamente). Tocar un push no
// llevaba a ningún lado: la app se abría donde ya estaba.

export type NotificationRouteResolver = (data: Record<string, any>) => string

export const NOTIFICATION_ROUTES: Record<string, NotificationRouteResolver> = {
  follow: () => '/(app)/(tabs)/explore',
  friend_request: () => '/(app)/(tabs)/explore',
  friend_accepted: () => '/(app)/(tabs)/explore',
  new_class: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/explore',
  class_updated: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  class_cancelled: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  // `data.event_id` → el pago es de una entrada a evento.
  payment_confirmed: (data) => data.event_id ? `/(app)/event/${data.event_id}` : '/(app)/(tabs)/my-classes',
  payment_rejected: (data) => data.event_id ? `/(app)/event/${data.event_id}` : '/(app)/(tabs)/my-classes',
  '2x_request': () => '/(app)/(tabs)/feed',
  '2x_match': () => '/(app)/(tabs)/my-classes',
  '2x_payment_turn': () => '/(app)/(tabs)/my-classes',
  debt_warning: () => '/(app)/(tabs)/my-classes',
  new_report: () => '/(app)/(tabs)/feed',
  class_discount: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  audition_accepted: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  audition_rejected: () => '/(app)/(tabs)/explore',
  new_audition: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/my-classes',
  class_reminder: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/my-classes',
  waitlist_available: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  rehearsal_invite: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  rehearsal_accepted: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  rehearsal_rejected: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  payment_reminder: (data) =>
    data.role === 'teacher'
      ? (data.payment_id ? `/(app)/payment/review/${data.payment_id}` : '/(app)/(tabs)/my-classes')
      : (data.enrollment_id ? `/(app)/payment/${data.enrollment_id}` : '/(app)/(tabs)/my-classes'),
  event_invite: (data) => data.event_id ? `/(app)/event/${data.event_id}` : '/(app)/(tabs)/feed',
  event_invite_accepted: (data) => data.event_id ? `/(app)/event/${data.event_id}` : '/(app)/(tabs)/feed',
  event_invite_rejected: (data) => data.event_id ? `/(app)/event/${data.event_id}` : '/(app)/(tabs)/feed',
  posts_expiring: () => '/(app)/(tabs)/profile',
  // El video pedido es del destinatario: su perfil es donde vive su grilla.
  teach_request: () => '/(app)/(tabs)/profile',
  mp_connection_expiring: () => '/(app)/profile/payment-info',
  payment_refunded: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/my-classes',
}

/**
 * Resuelve la ruta de una notificación. `follow`/`friend_request`/
 * `friend_accepted` son casos especiales: su destino real es el perfil de
 * `from_user_id`, no una ruta fija — necesitan resolver el username, así que
 * reciben el cliente de Supabase. Sin `from_user_id` o sin perfil encontrado,
 * caen al fallback fijo del mapa de arriba.
 */
export async function resolveNotificationRoute(
  type: string,
  data: Record<string, any>,
  supabase: any
): Promise<string | null> {
  if (
    (type === 'follow' || type === 'friend_request' || type === 'friend_accepted') &&
    data?.from_user_id
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', data.from_user_id)
      .maybeSingle()
    if (profile?.username) return `/(app)/teacher/${profile.username}`
  }

  const resolver = NOTIFICATION_ROUTES[type]
  return resolver ? resolver(data ?? {}) : null
}
