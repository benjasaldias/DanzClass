import { test, expect } from '@playwright/test'
import { NOTIFICATION_ROUTES, resolveNotificationRoute } from '../../apps/mobile/lib/notificationRoutes'

// P1-6: el listener de push era un callback vacío ("Navigation on tap is
// handled by expo-router's deep link support" — premisa falsa, `sendPushToUsers`
// nunca manda `url`). Este mapa es ahora la fuente única para "a qué pantalla
// lleva esta notificación", compartida por el tap en la lista y el tap sobre
// un push. Estos tests fijan el contrato del mapa, no el listener en sí (que
// necesita un runtime de Expo/React Native para probarse de verdad).

function fakeSupabase(username: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: username ? { username } : null }),
        }),
      }),
    }),
  }
}

// Los 30 tipos de `NotificationType` (packages/shared/src/types/index.ts).
// Copiado a propósito en vez de importado: si algún día divergen, este test
// debe fallar por la comparación explícita, no quedarse mudo porque ambos
// leyeron la misma lista.
const ALL_NOTIFICATION_TYPES = [
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected', 'follow',
  'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report',
  'audition_accepted', 'audition_rejected', 'new_audition',
  'class_reminder', 'waitlist_available',
  'rehearsal_invite', 'rehearsal_accepted', 'rehearsal_rejected',
  'payment_reminder',
  'event_invite', 'event_invite_accepted', 'event_invite_rejected',
  'posts_expiring', 'mp_connection_expiring', 'payment_refunded',
  'teach_request',
]

test.describe('NOTIFICATION_ROUTES', () => {
  test('cubre los 30 tipos de notificación — ninguno queda sin ruta', async () => {
    expect(ALL_NOTIFICATION_TYPES).toHaveLength(30)
    for (const type of ALL_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_ROUTES[type], `falta el tipo ${type}`).toBeTruthy()
    }
    expect(Object.keys(NOTIFICATION_ROUTES).sort()).toEqual([...ALL_NOTIFICATION_TYPES].sort())
  })

  test('resuelve una ruta concreta con datos completos', async () => {
    const cases: Array<[string, Record<string, any>, string]> = [
      ['new_class', { class_id: 'c1' }, '/(app)/class/c1'],
      ['class_updated', { class_id: 'c1' }, '/(app)/class/c1'],
      ['class_cancelled', { class_id: 'c1' }, '/(app)/class/c1'],
      ['payment_confirmed', { event_id: 'e1' }, '/(app)/event/e1'],
      ['payment_rejected', { event_id: 'e1' }, '/(app)/event/e1'],
      ['class_discount', { class_id: 'c1' }, '/(app)/class/c1'],
      ['audition_accepted', { class_id: 'c1' }, '/(app)/class/c1'],
      ['new_audition', { class_id: 'c1' }, '/(app)/class/c1'],
      ['class_reminder', { class_id: 'c1' }, '/(app)/class/c1'],
      ['waitlist_available', { class_id: 'c1' }, '/(app)/class/c1'],
      ['rehearsal_invite', { rehearsal_id: 'r1' }, '/(app)/rehearsal/r1'],
      ['rehearsal_accepted', { rehearsal_id: 'r1' }, '/(app)/rehearsal/r1'],
      ['rehearsal_rejected', { rehearsal_id: 'r1' }, '/(app)/rehearsal/r1'],
      ['event_invite', { event_id: 'e1' }, '/(app)/event/e1'],
      ['event_invite_accepted', { event_id: 'e1' }, '/(app)/event/e1'],
      ['event_invite_rejected', { event_id: 'e1' }, '/(app)/event/e1'],
      ['payment_refunded', { class_id: 'c1' }, '/(app)/class/c1'],
      ['mp_connection_expiring', {}, '/(app)/profile/payment-info'],
      ['posts_expiring', {}, '/(app)/(tabs)/profile'],
    ]
    for (const [type, data, expected] of cases) {
      expect(NOTIFICATION_ROUTES[type], `falta el tipo ${type}`).toBeTruthy()
      expect(NOTIFICATION_ROUTES[type](data), type).toBe(expected)
    }
  })

  test('payment_reminder se ramifica por role, como el resto de la app', async () => {
    expect(NOTIFICATION_ROUTES.payment_reminder({ role: 'teacher', payment_id: 'p1' }))
      .toBe('/(app)/payment/review/p1')
    expect(NOTIFICATION_ROUTES.payment_reminder({ role: 'teacher' }))
      .toBe('/(app)/(tabs)/my-classes')
    expect(NOTIFICATION_ROUTES.payment_reminder({ enrollment_id: 'en1' }))
      .toBe('/(app)/payment/en1')
    expect(NOTIFICATION_ROUTES.payment_reminder({}))
      .toBe('/(app)/(tabs)/my-classes')
  })

  test('sin el id esperado, cae al fallback fijo en vez de armar una ruta rota', async () => {
    expect(NOTIFICATION_ROUTES.new_class({})).toBe('/(app)/(tabs)/explore')
    expect(NOTIFICATION_ROUTES.class_reminder({})).toBe('/(app)/(tabs)/my-classes')
    expect(NOTIFICATION_ROUTES.event_invite({})).toBe('/(app)/(tabs)/feed')
  })
})

test.describe('resolveNotificationRoute', () => {
  test('follow/friend_* resuelven al perfil real cuando existe', async () => {
    const supabase = fakeSupabase('bailarina99')
    const route = await resolveNotificationRoute('follow', { from_user_id: 'u1' }, supabase)
    expect(route).toBe('/(app)/teacher/bailarina99')
  })

  test('follow/friend_* caen al fallback si el perfil no aparece', async () => {
    const supabase = fakeSupabase(null)
    const route = await resolveNotificationRoute('friend_request', { from_user_id: 'u1' }, supabase)
    expect(route).toBe('/(app)/(tabs)/explore')
  })

  test('un tipo sin mapear no revienta: devuelve null', async () => {
    const supabase = fakeSupabase(null)
    const route = await resolveNotificationRoute('unknown_type', {}, supabase)
    expect(route).toBeNull()
  })
})
