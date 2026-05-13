# DanceClass — Resumen del proyecto y pasos siguientes

Este documento es un briefing para continuar el desarrollo en una nueva sesión de Claude.

---

## Contexto del problema

DanceClass es una plataforma web + móvil para conectar profesores y estudiantes de baile en Chile. El mercado actual es completamente informal: los profesores usan Instagram Stories y WhatsApp para publicar sus clases, los pagos se hacen por transferencia bancaria enviando captura de pantalla al profesor, y hay problemas de sobrecupo y descuentos de último minuto sin alcance.

---

## Stack técnico

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`), sin Turborepo
- **Web:** Next.js 14 (App Router) + TypeScript + Tailwind CSS — `apps/web/`
- **Mobile:** Expo SDK 51 (Expo Router) + React Native + NativeWind — `apps/mobile/`
- **Backend:** Supabase — PostgreSQL + Auth + Storage + Realtime
- **Shared:** `packages/shared/` — tipos TypeScript compartidos y cliente Supabase base
- **Color de marca:** `#c026d3` (Tailwind `brand-600`, escala morada en ambas apps)

---

## Migraciones SQL aplicadas (en orden)

### 001_initial_schema.sql
Schema base completo con RLS en todas las tablas:
- `profiles` — extiende `auth.users`; campos `role`, `city`, `instagram_handle`, `avatar_url`
- `teacher_payment_info` — datos bancarios (banco, tipo cuenta, número, RUT, titular)
- `follows` — relación follower/following
- `classes` — tipo `suelta` (fecha única) y `periodica` (recurrencia), con `status` ('active'/'cancelled')
- `class_media` — hasta 5 fotos/videos por clase, almacenados en Storage
- `class_sessions` — instancias de clases periódicas
- `enrollments` — estados: pending_payment → payment_submitted → confirmed (o rejected)
- `payments` — comprobantes de transferencia subidos por el estudiante
- `notifications` — notificaciones de usuario con campo JSONB `data`
- Vistas: `class_spots`, `session_spots`
- Triggers: `handle_new_user()`, `update_updated_at()`

### 002_subscription_tiers.sql
- Elimina el campo `role` de `profiles` (ya no existe `student`/`teacher`; todos los usuarios son iguales a nivel de auth)
- Crea tabla `subscriptions` (user_id, tier: none/basic/teacher/pro, status, started_at, expires_at, mp_subscription_id)
- Añade `friendships` (requester_id, addressee_id, status: pending/accepted/rejected)
- Añade `styles_dancing TEXT[]` y `styles_teaching TEXT[]` a `profiles`
- Añade `enrolled_classes_public BOOLEAN DEFAULT TRUE` a `profiles`

### 003_profiles_extra.sql
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS styles_dancing TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS styles_teaching TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enrolled_classes_public BOOLEAN DEFAULT TRUE;
```

### 004_class_schedule_improvements.sql
```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS price_suelta INTEGER;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS custom_dates TEXT[] DEFAULT '{}';
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_recurrence_check;
ALTER TABLE classes ADD CONSTRAINT classes_recurrence_check
  CHECK (recurrence IS NULL OR recurrence IN ('weekly', 'biweekly', 'monthly', 'custom'));
```

### 005_storage_policies.sql
- Crea/upserta bucket `class-media` (público, 50MB, imagen/video)
- Crea/upserta bucket `avatars` (público, 5MB, imagen)
- Añade políticas RLS sobre `storage.objects` para SELECT, INSERT, UPDATE, DELETE en ambos buckets
- **Crítico:** sin estas políticas los uploads fallan silenciosamente

### 006_notification_types.sql
- Extiende constraint de tipo de notificación para incluir: `follow`, `new_class`, `class_updated`, `class_cancelled`
- Añade política `notifications_insert_any`: cualquier usuario autenticado puede insertar notificaciones para cualquier `user_id` (necesario para notificaciones sociales cross-user)
- **Nota:** la política `classes_delete_teacher` ya existía y fue omitida de esta migración

---

## Estado de implementación — Web (apps/web)

### Autenticación y layout
- Login / Register con react-hook-form + zod, manejo de errores Supabase
- **Register muestra pantalla "Revisa tu correo"** tras el signup (no redirige automáticamente); pasa `emailRedirectTo: window.location.origin/feed` a Supabase
- Middleware refresca sesión y protege rutas `/(app)/*`
- Layout `(app)/layout.tsx`: carga perfil, subscripción, count de notificaciones sin leer → pasa a TopBar

### TopBar (`components/ui/TopBar.tsx`)
- Muestra nombre de usuario y avatar
- Botón de campana → `/notifications` con badge rojo (número, "9+" si >9) cuando hay notificaciones sin leer

### Feed (`(app)/feed`)
- Tabs: **Siguiendo** / **Global** / **Cerca** (matching por ciudad)
- Cards de clases con carrusel de media (imagen/video), precio, horario, cupos

### Explorar (`(app)/explore`)
- Búsqueda de clases por texto
- Búsqueda de usuarios con filtros: **Tod@s** / **Amig@s** / **Siguiendo**
- UserCard con botón de seguir y botón de amistad (con estados: enviar / pendiente / aceptar / amig@)

### Clases
- **`/create-class`** — Crear clase con tipo suelta/periódica, campos condicionales, drag-and-drop de media
  - Periodicidad: Semanal, Quincenal, Personalizado (fechas específicas con calendario)
  - Precio mensual + precio clase suelta opcional para periódicas
  - Al publicar: inserta notificación `new_class` a todos los seguidores del profesor
- **`/class/[id]`** — Detalle: carrusel, info, estado de inscripción, CTA de reservar
  - Para el profesor: botones **Editar** y **Eliminar** (con ConfirmDialog)
  - Eliminar: notifica a inscritos con `class_cancelled`, soft-delete (status='cancelled')
  - Seguir/dejar de seguir al profesor (con notificación `follow` al seguir)
- **`/class/[id]/edit`** — Editar clase: igual que CreateClassForm pero pre-rellenado
  - Media existente con botón de eliminar, nueva media con indicador visual diferenciado
  - Al guardar: notifica a inscritos con `class_updated`

### Notificaciones (`(app)/notifications`)
- Lista cronológica, últimas 50
- Tipos soportados: `follow`, `friend_request`, `friend_accepted`, `new_class`, `class_updated`, `class_cancelled`, `payment_confirmed`, `payment_rejected`, `2x_request`, `2x_match`
- Enriquecido con datos de perfil (avatar, username) y título de clase
- Marcadas como leídas al entrar a la página
- Avatar del emisor con icono superpuesto (para notificaciones de persona), icono solo (para clases/pagos)
- Estado vacío con ícono de campana

### Perfil de profesor (`/teacher/[username]`)
- Follow/unfollow con notificación `follow`
- Botón de amistad: enviar solicitud / cancelar / aceptar / ver amig@
- **Eliminar amistad**: clic en "Amig@" muestra ConfirmDialog "¿Seguro que quieres eliminar a @username de tus amigos?"
- Grid de clases publicadas con ClassMiniCard

### Dashboard de profesor (`/dashboard`)
- Lista de clases, inscritos, botones confirmar/rechazar pago
- Al confirmar: inserta notificación `payment_confirmed`
- Al rechazar: inserta notificación `payment_rejected`

### Pagos (`/payment/[enrollmentId]`)
- Muestra datos bancarios del profesor
- react-dropzone para subir comprobante de transferencia
- Sube imagen a bucket `payment-receipts`

### Planes y suscripciones (`/plans`) — ✅ COMPLETO Y FUNCIONANDO EN PRODUCCIÓN

- Cards de planes (Básico / Profesor / Pro) con features y precio
- Muestra plan activo con fecha de vencimiento
- Botón **Cancelar plan** (ConfirmDialog destructivo → `POST /api/subscriptions/cancel`)
- Al suscribirse → redirige a MP checkout → al volver activa la suscripción en Supabase

### Mi perfil (`/profile`)

- Info del usuario con tier activo y link "Suscribirse" / "Cambiar" → `/plans`
- Link a `/profile/payment-info` para profesores (tier teacher o pro)

---

## Componentes UI clave

| Componente | Descripción |
|---|---|
| `ui/TopBar.tsx` | Barra superior con badge de notificaciones |
| `ui/BottomNav.tsx` | Navegación inferior |
| `ui/Avatar.tsx` | Avatar con fallback a iniciales |
| `ui/ConfirmDialog.tsx` | Modal de confirmación con backdrop, modo destructivo, spinner de carga |
| `ui/MonthCalendar.tsx` | Calendario para seleccionar fechas específicas (clases custom) |
| `feed/ClassCard.tsx` | Card de clase en feed/explore |
| `feed/ExploreClient.tsx` | Cliente de explorar con filtros de usuarios |
| `feed/UserCard.tsx` | Card de usuario con follow + amistad + unfriend confirm |
| `class/CreateClassForm.tsx` | Formulario completo de creación |
| `class/EditClassForm.tsx` | Formulario de edición pre-rellenado |
| `class/ClassDetailClient.tsx` | Detalle de clase con acciones de profesor |
| `class/DashboardClient.tsx` | Dashboard del profesor |
| `notifications/NotificationsClient.tsx` | Lista de notificaciones con config por tipo |
| `profile/TeacherProfileClient.tsx` | Perfil público con follow/amistad/unfriend |
| `payment/PaymentClient.tsx` | Pago con comprobante |
| `plans/SubscribeButton.tsx` | Botón cliente que llama a create-preference y redirige a MP |
| `plans/CancelSubscriptionButton.tsx` | Botón cancelar con ConfirmDialog, llama a `/api/subscriptions/cancel` |

---

## Tipos relevantes (packages/shared/src/types/index.ts)

```typescript
type SubscriptionTier = 'none' | 'basic' | 'teacher' | 'pro'
type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
type Recurrence = 'weekly' | 'biweekly' | 'monthly' | 'custom'
type NotificationType =
  | '2x_request' | '2x_match'
  | 'friend_request' | 'friend_accepted'
  | 'payment_confirmed' | 'payment_rejected'
  | 'follow' | 'new_class' | 'class_updated' | 'class_cancelled'

interface Class {
  // ...campos base...
  price_suelta: number | null      // precio clase suelta para periódicas
  custom_dates: string[]           // fechas ISO 'YYYY-MM-DD' para recurrence='custom'
}
```

---

## Decisiones técnicas importantes

- **Roles eliminados:** todos los usuarios tienen `role='user'` desde migración 002. La diferenciación entre estudiante/profesor es por `subscription_tier`. El botón de inscripción en ClassDetail se muestra a cualquier no-profesor (sin chequeo de rol).
- **Notificaciones cross-user:** la política RLS `notifications_insert_any` permite `WITH CHECK (true)` para autenticados, necesario para insertar notificaciones en el `user_id` de otra persona.
- **Friendship delete:** la tabla usa UNIQUE en (requester_id, addressee_id). El delete usa `.or()` para manejar ambas direcciones (el usuario actual puede ser requester o addressee).
- **Soft-delete clases:** `UPDATE classes SET status='cancelled'` en vez de DELETE, para preservar historial de inscripciones.
- **Storage policies:** separadas de la RLS de tablas, viven en `storage.objects`. Sin ellas, los uploads de media fallan silenciosamente.
- **Precio clase suelta:** campo opcional `price_suelta` en `classes`. Solo relevante para periódicas. Se muestra en ClassCard, ClassDetail y ClassMiniCard.
- **Recurrencia custom:** `day_of_week` es NULL cuando `recurrence='custom'`; se usa `custom_dates[]` en su lugar. La validación Zod usa `superRefine` para este condicional.
- **Activación de suscripción MP:** el mecanismo principal es la página `/plans/success` (verifica el pago contra la API de MP con el `payment_id` que MP añade al redirect). El webhook es secundario. Esto es más confiable que depender solo del webhook para el flujo inmediato del usuario.

---

## Pasos siguientes pendientes

### A. SQL pendiente de ejecutar en Supabase

Verificar en el SQL Editor que todas las migraciones estén aplicadas:
1. `supabase/migrations/003_profiles_extra.sql` — columnas extra en profiles
2. `supabase/migrations/004_class_schedule_improvements.sql` — price_suelta, custom_dates
3. `supabase/migrations/005_storage_policies.sql` — políticas de Storage (crítico para uploads)
4. `supabase/migrations/006_notification_types.sql` — tipos de notificación + política insert cross-user
5. **`supabase/migrations/007_payment_receipts_bucket.sql` — bucket `payment-receipts` + RLS** ← NUEVO, ejecutar para habilitar subida de comprobantes

Para tener un usuario pro de prueba:
```sql
INSERT INTO subscriptions (user_id, tier, status, started_at, expires_at)
SELECT id, 'pro', 'active', NOW(), NOW() + INTERVAL '1 year'
FROM profiles WHERE username = 'benjasaldias';
```

### B. Integración Mercado Pago (suscripciones) — ✅ COMPLETO Y EN PRODUCCIÓN

El flujo completo funciona con credenciales de producción. Ver sección "Integración Mercado Pago" para detalle de archivos, flujo y variables de entorno.

### C. Pantallas mobile pendientes (Expo)

La app mobile tiene el layout base pero faltan pantallas:
- `apps/mobile/app/(app)/class/create-suelta.tsx` — formulario clase suelta
- `apps/mobile/app/(app)/class/create-periodica.tsx` — formulario clase periódica
- `apps/mobile/app/(app)/class/[id].tsx` — detalle de clase con botón reservar
- `apps/mobile/app/(app)/teacher/[username].tsx` — perfil público del profesor
- Notificaciones en mobile (bell badge en tab bar o header)

### D. Mejoras y correcciones menores

- **Bucket `payment-receipts`:** es privado, pero el código usa `getPublicUrl()`. Cambiar a `createSignedUrl()` con tiempo de expiración para mostrar el comprobante al profesor en el dashboard.
- **Filtro "Cerca":** actualmente filtra por ciudad exacta (string match). Mejorar con selección de ciudad en perfil y matching normalizado.
- **Editar perfil (`/profile/edit`):** la página existe como link en `/profile` pero aún no está implementada.

### E. Funcionalidades futuras (no prioritarias)

- **Notificaciones push Expo** — cuando se confirma/rechaza un pago o se publica una clase nueva
- **Sistema 2x** — buscar compañer@ para ir a una clase de pareja (`2x_request` / `2x_match` ya están en el schema de notificaciones)
- **Descuentos de último minuto** — campo `discount_percentage` en clases, notificación push a seguidores
- **OCR de comprobantes** — identificación automática del monto en la imagen (diferido del MVP)
- **Dashboard de analytics** — estadísticas de ingresos y asistencia para profesores

---

## Integración Mercado Pago — Estado actual (COMPLETO Y EN PRODUCCIÓN)

### Archivos

| Archivo | Descripción |
|---|---|
| `apps/web/src/app/api/mercadopago/create-preference/route.ts` | Crea preferencia MP, detecta modo test/prod automáticamente |
| `apps/web/src/app/api/mercadopago/webhook/route.ts` | Recibe notificación MP, verifica firma HMAC-SHA256, activa suscripción |
| `apps/web/src/app/api/subscriptions/cancel/route.ts` | Cancela suscripción activa del usuario (`status='cancelled'`) |
| `apps/web/src/app/(app)/plans/page.tsx` | Cards de planes con fecha vencimiento y botón cancelar |
| `apps/web/src/app/(app)/plans/success/page.tsx` | Verifica pago con MP API y activa suscripción si webhook no lo hizo |
| `apps/web/src/app/(app)/plans/failure/page.tsx` | Página de fallo post-pago |
| `apps/web/src/components/plans/SubscribeButton.tsx` | Botón cliente que llama a create-preference y redirige a MP |
| `apps/web/src/components/plans/CancelSubscriptionButton.tsx` | Botón cancelar con ConfirmDialog destructivo |
| `apps/web/src/lib/subscription.ts` | `getActiveTier()` y `getActiveSubscription()` — reutilizables |
| `apps/web/src/lib/supabase/admin.ts` | `createAdminClient()` con service role key — bypasea RLS |

### Flujo de pago

1. Usuario en `/plans` hace clic en "Suscribirse"
2. `SubscribeButton` llama `POST /api/mercadopago/create-preference` con `{ plan }`
3. API route crea preference con `external_reference = "{userId}:{plan}"` y retorna URL de checkout
   - Token `TEST-` → usa `sandbox_init_point`; token `APP_USR-` → usa `init_point`
4. Usuario paga en MP checkout
5. **Mecanismo primario:** MP redirige a `/plans/success?payment_id=XXX&status=approved`
   - La página verifica el pago llamando a la API de MP con ese `payment_id`
   - Si está approved y el `external_reference` coincide con el usuario actual → activa suscripción
   - Si el webhook ya la activó, no inserta duplicado (chequea tier activo primero)
6. **Mecanismo secundario (webhook):** MP llama a `POST /api/mercadopago/webhook`
   - Verifica firma HMAC-SHA256 (`x-signature` header)
   - Consulta el pago por ID para confirmar `status === 'approved'`
   - Expira suscripciones previas e inserta nueva

### Variables de entorno en Vercel (todas configuradas ✅)

| Variable | Valor / Origen |
|---|---|
| `APP_URL` | `https://dc-project-web.vercel.app` — URL estable de producción (server-side) |
| `MERCADOPAGO_ACCESS_TOKEN` | MP Developers → Credenciales de producción (`APP_USR-...`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | MP Developers → Webhooks → Secreto del webhook productivo |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hkmvbutjjrxmegdliiqt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |

### Webhook en MP Dashboard

- Registrado en modo **Productivo** en [mercadopago.cl/developers/panel](https://www.mercadopago.cl/developers/panel)
- URL: `https://dc-project-web.vercel.app/api/mercadopago/webhook`
- Evento: `Pagos`

---

## Deploy en Vercel — Lecciones aprendidas

### Errores TypeScript solucionados (sesión 2026-05-13)

**Error 1: Generic mismatch en `SupabaseClient`**
- Archivo: `apps/web/src/lib/subscription.ts`
- Fix: cambiar el parámetro a tipo estructural `{ from: (table: string) => any }`

**Error 2: `Property 'x' does not exist on type 'never'` en múltiples pages**

- Causa raíz: tablas nuevas en `database.ts` sin `Relationships: []`
- Fix: agregar `Relationships: []` a todas las tablas en `packages/shared/src/types/database.ts`

### Variables de entorno: `NEXT_PUBLIC_` vs server-side

**Regla crítica:** las variables `NEXT_PUBLIC_` se incrustan en el bundle JavaScript en el momento del **build**, no en runtime. Consecuencias:

- Si se agregan/cambian en Vercel después de un build, no tienen efecto hasta el **próximo build** (no basta con "Redeploy" — se necesita un push nuevo que genere un build fresco)
- En API routes (`route.ts`) y server components, **no son confiables** como variables de entorno runtime
- **Solución:** para URLs o valores que se usan en el servidor, usar variables sin el prefijo `NEXT_PUBLIC_` (ej: `APP_URL`). Estas sí están disponibles en runtime en todos los contextos del servidor

**Para forzar un build fresco en Vercel:**

```bash
git commit --allow-empty -m "force rebuild"
git push
```

### Incidente: `NEXT_PUBLIC_SUPABASE_URL` apuntando al dominio de Vercel

En algún momento `NEXT_PUBLIC_SUPABASE_URL` quedó seteada en Vercel con el valor `https://dc-project-web.vercel.app` en vez de `https://hkmvbutjjrxmegdliiqt.supabase.co`. Síntoma: todas las llamadas a Supabase desde el cliente (login, queries) retornaban 404. Diagnóstico: en DevTools → Network, la request fallida era `https://dc-project-web.vercel.app/auth/v1/token`. Fix: restaurar el valor correcto y forzar rebuild.

### Supabase — Configuración de producción necesaria

En Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://dc-project-web.vercel.app`
- **Redirect URLs:** `https://dc-project-web.vercel.app/**`

Sin esto, los links de confirmación de email redirigen a `localhost:3000`.

---

## Tipos Supabase y error `never` — causa y solución

### Estado actual del `database.ts`

El archivo `packages/shared/src/types/database.ts` fue generado por la Supabase CLI y **limpiado manualmente** para eliminar ~900 líneas de funciones PostGIS. El archivo limpio tiene ~811 líneas.

**Importante:** la sección `Functions` debe usar esta firma:

```typescript
Functions: {
  [_: string]: {
    Args: Record<string, unknown>
    Returns: unknown
  }
}
```

Si se regenera el archivo con `supabase gen types`, hay que volver a limpiar el PostGIS Y verificar que `Functions` tenga index signature (no `{ [_ in never]: never }`).

### El bug de `never` en supabase-js

**Síntoma:** `Property 'x' does not exist on type 'never'` al acceder propiedades de resultados de queries en server components.

**Tablas afectadas:** `follows`, `friendships`, `subscriptions`, `notifications`, `enrollments`

**Patrón de fix:**

```typescript
// ✅ cast explícito con el tipo esperado
const followingIds = (follows as { following_id: string }[] | null)?.map(f => f.following_id) ?? []

type SubRow = { tier: string; expires_at: string }
const sub = subscription as SubRow | null
```

---

## Estructura de archivos relevante (web)

```text
apps/web/src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx                    # carga perfil + unread count → TopBar
│   │   ├── feed/page.tsx
│   │   ├── explore/page.tsx
│   │   ├── create-class/page.tsx
│   │   ├── class/[id]/page.tsx
│   │   ├── class/[id]/edit/page.tsx      # solo el profesor
│   │   ├── notifications/page.tsx
│   │   ├── payment/[enrollmentId]/page.tsx
│   │   ├── teacher/[username]/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── my-classes/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── profile/payment-info/page.tsx
│   │   └── plans/                        # suscripciones MP
│   │       ├── page.tsx
│   │       ├── success/page.tsx          # verifica pago y activa suscripción
│   │       └── failure/page.tsx
│   ├── api/
│   │   ├── mercadopago/
│   │   │   ├── create-preference/route.ts
│   │   │   └── webhook/route.ts
│   │   └── subscriptions/
│   │       └── cancel/route.ts
│   └── auth/login/ + auth/register/
├── components/
│   ├── ui/ (TopBar, BottomNav, Avatar, ConfirmDialog, MonthCalendar, LogoutButton)
│   ├── feed/ (FeedClient, ClassCard, ExploreClient, UserCard)
│   ├── class/ (ClassDetailClient, CreateClassForm, EditClassForm, DashboardClient)
│   ├── notifications/ (NotificationsClient)
│   ├── payment/ (PaymentClient)
│   ├── plans/ (SubscribeButton, CancelSubscriptionButton)
│   └── profile/ (TeacherProfileClient, PaymentInfoForm)
└── lib/
    ├── utils.ts
    ├── subscription.ts                   # getActiveTier(), getActiveSubscription()
    └── supabase/ (client.ts, server.ts, admin.ts)
```
