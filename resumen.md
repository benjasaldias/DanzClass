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
- **Node.js local:** v12 (WSL2) — demasiado viejo para correr `next build` localmente. Siempre buildear en Vercel.

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
- Añade política `notifications_insert_any`: cualquier usuario autenticado puede insertar notificaciones para cualquier `user_id`
- **Nota:** la política `classes_delete_teacher` ya existía y fue omitida de esta migración

### 007_payment_receipts_bucket.sql (sesión 2026-05-13)
- Crea bucket `payment-receipts` (público, 10MB, imagen/PDF)
- Políticas RLS: cualquiera puede leer; usuarios autenticados solo pueden subir/editar dentro de su propia carpeta `{user_id}/...`
- **Crítico:** sin esta migración, subir comprobantes de pago de clases falla con error RLS

---

## Estado de implementación — Web (apps/web)

### Autenticación y layout
- Login / Register con react-hook-form + zod, manejo de errores Supabase
- **Register muestra pantalla "Revisa tu correo"** tras el signup; pasa `emailRedirectTo: window.location.origin/feed`
- Middleware refresca sesión y protege rutas `/(app)/*`
- Layout `(app)/layout.tsx`: carga perfil, subscripción, count de notificaciones sin leer → pasa a TopBar

### TopBar
- Muestra nombre de usuario y avatar
- Botón de campana → `/notifications` con badge rojo (número, "9+" si >9) cuando hay notificaciones sin leer

### Feed (`/feed`)
- Tabs: **Siguiendo** / **Global** / **Cerca** (matching por ciudad exacta — pendiente mejorar)
- Cards de clases con carrusel de media, precio, horario, cupos

### Explorar (`/explore`)
- Búsqueda de clases por texto
- Búsqueda de usuarios con filtros: **Tod@s** / **Amig@s** / **Siguiendo**
- UserCard con botón de seguir y botón de amistad (estados: enviar / pendiente / aceptar / amig@)

### Clases
- **`/create-class`** — Crear clase con tipo suelta/periódica, drag-and-drop de media
  - Periodicidad: Semanal, Quincenal, Personalizado (fechas específicas)
  - Precio mensual + precio clase suelta opcional para periódicas
  - Al publicar: notificación `new_class` a todos los seguidores
- **`/class/[id]`** — Detalle: carrusel, info, estado de inscripción, CTA de reservar
  - Profesor: botones **Editar** y **Eliminar** (con ConfirmDialog)
  - Eliminar: notifica inscritos con `class_cancelled`, soft-delete
  - **Alumno inscrito: botón "Salir de la clase"** con ConfirmDialog destructivo
    - Si `status === 'confirmed'` o `payment_submitted`: alerta especial "IMPORTANTE: ya pagaste esta clase, esta acción no es reversible"
    - Salir cancela el enrollment y libera el cupo
- **`/class/[id]/edit`** — Editar clase pre-rellenada; notifica inscritos con `class_updated`

### Mis clases (`/my-classes`) — ACTUALIZADO sesión 2026-05-13
- Página unificada con dos tabs: **"Clases que tomo"** / **"Clases que dicto"**
- Profesores ven "Clases que dicto" por defecto; estudiantes ven "Clases que tomo"
- Tab "Clases que tomo": lista de enrollments con estado, link a clase y a pago
- Tab "Clases que dicto": lista de clases con alumnos, confirmar/rechazar pagos, **eliminar alumno** (ConfirmDialog)
- BottomNav actualizado: todos los usuarios (teacher y student) apuntan a `/my-classes`
- `/dashboard` sigue existiendo pero ya no está en nav principal

### Notificaciones (`/notifications`)
- Lista cronológica, últimas 50
- Tipos: `follow`, `friend_request`, `friend_accepted`, `new_class`, `class_updated`, `class_cancelled`, `payment_confirmed`, `payment_rejected`, `2x_request`, `2x_match`
- Marcadas como leídas al entrar; estado vacío con ícono

### Perfil público profesor (`/teacher/[username]`)
- Follow/unfollow con notificación `follow`
- Botón de amistad con estados completos; eliminar amistad con ConfirmDialog

### Pagos de clases (`/payment/[enrollmentId]`)
- Muestra datos bancarios del profesor
- react-dropzone para subir comprobante → bucket `payment-receipts`
- Ruta del archivo: `{student_id}/{enrollment_id}.{ext}`

### Editar perfil (`/profile/edit`) — ✅ IMPLEMENTADO
- Avatar con cámara, nombre, username, bio, ciudad, Instagram
- StylesPicker para estilos que baila / enseña
- Toggle privacidad "Clases inscritas públicas"

### Planes y suscripciones (`/plans`) — ✅ COMPLETO Y EN PRODUCCIÓN

Ver sección "Integración Mercado Pago" más abajo para detalle completo.

---

## Componentes UI clave

| Componente | Descripción |
|---|---|
| `ui/TopBar.tsx` | Barra superior con badge de notificaciones |
| `ui/BottomNav.tsx` | Nav inferior; todos los roles apuntan a `/my-classes` |
| `ui/Avatar.tsx` | Avatar con fallback a iniciales |
| `ui/ConfirmDialog.tsx` | Modal de confirmación con backdrop, modo destructivo, spinner |
| `ui/MonthCalendar.tsx` | Calendario para fechas específicas (clases custom) |
| `feed/ClassCard.tsx` | Card de clase en feed/explore |
| `feed/ExploreClient.tsx` | Explorar con filtros de usuarios |
| `feed/UserCard.tsx` | Card de usuario con follow + amistad + unfriend confirm |
| `class/CreateClassForm.tsx` | Formulario completo de creación |
| `class/EditClassForm.tsx` | Formulario de edición pre-rellenado |
| `class/ClassDetailClient.tsx` | Detalle con acciones de profesor + "Salir de clase" para alumno |
| `class/MyClassesClient.tsx` | Tabs "Clases que tomo" / "Clases que dicto" — NUEVO |
| `class/DashboardClient.tsx` | Dashboard del profesor (también embebido en MyClassesClient) |
| `notifications/NotificationsClient.tsx` | Lista de notificaciones con config por tipo |
| `payment/PaymentClient.tsx` | Pago con comprobante, sube a `payment-receipts` |
| `plans/SubscribeButton.tsx` | Dos botones: mensual (crédito) y anual (cualquier medio) — ACTUALIZADO |
| `plans/CancelSubscriptionButton.tsx` | Cancelar plan con ConfirmDialog; cancela también en MP |
| `profile/EditProfileForm.tsx` | Edición completa del perfil |
| `profile/TeacherProfileClient.tsx` | Perfil público con follow/amistad/unfriend |
| `profile/PaymentInfoForm.tsx` | Datos bancarios del profesor |

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

const SUBSCRIPTION_PLANS = [
  { tier: 'basic',   price: 1000, name: 'Básico',   ... },
  { tier: 'teacher', price: 1500, name: 'Profesor',  ... },
  { tier: 'pro',     price: 2000, name: 'Pro',       ... },
]
```

---

## Decisiones técnicas importantes

- **Roles eliminados:** diferenciación estudiante/profesor por `subscription_tier` (`canTeach(tier)`).
- **Notificaciones cross-user:** política RLS `notifications_insert_any` con `WITH CHECK (true)`.
- **Soft-delete clases:** `UPDATE classes SET status='cancelled'`, preserva historial de inscripciones.
- **Storage policies separadas:** viven en `storage.objects`, no en tablas. Sin ellas, uploads fallan silenciosamente.
- **Salir de clase:** se marca enrollment como `cancelled`, no se elimina — preserva historial.
- **Activación suscripción MP:** dual-path — `plans/success` (mecanismo primario al volver de MP) + webhook (secundario). Ambos son idempotentes usando `mp_subscription_id` como clave de deduplicación.
- **`external_reference` en MP:** formato `{userId}:{plan}` para mensual; `{userId}:{plan}:annual` para anual. Se parsea con `.split(':')` en webhook y success page para determinar meses de expiración.
- **Suscripción paused por MP:** cuando MP no puede cobrar, pausa la suscripción y reintenta. No tocamos la BD — el `expires_at` natural actúa de grace period (7 días adicionales en `getActiveTier`).

---

## Integración Mercado Pago — Estado actual

### Archivos

| Archivo | Descripción |
|---|---|
| `api/mercadopago/create-subscription/route.ts` | Crea PreApproval MP (cobro mensual automático, solo crédito) |
| `api/mercadopago/create-preference/route.ts` | Crea Preference MP (pago único; soporta `period=annual` → precio×12) |
| `api/mercadopago/webhook/route.ts` | Recibe notificaciones MP; maneja pagos, preapprovals y renovaciones |
| `api/subscriptions/cancel/route.ts` | Cancela preapproval en MP + marca `cancelled` en BD |
| `(app)/plans/page.tsx` | Cards de planes con fecha vencimiento y botón cancelar |
| `(app)/plans/success/page.tsx` | Activa suscripción post-pago (maneja `preapproval_id` y `payment_id`) |
| `(app)/plans/failure/page.tsx` | Página de fallo post-pago |
| `lib/subscription.ts` | `getActiveTier()`, `getActiveSubscription()` — reutilizables |
| `lib/supabase/admin.ts` | `createAdminClient()` con service role key — bypasea RLS |

### Dos modalidades de suscripción

**Mensual con tarjeta de crédito (PreApproval):**
1. `SubscribeButton` → `POST /api/mercadopago/create-subscription` → crea PreApproval
2. Usuario autoriza en checkout MP → regresa a `/plans/success?preapproval_id=XXX`
3. Success page activa suscripción con `expires_at = now + 1 mes`
4. Cada mes: webhook `subscription_authorized_payment` → extiende `expires_at` +1 mes
5. Si MP no puede cobrar: webhook `subscription_preapproval` con `status=paused` → solo log
6. Si se cancela desde MP: webhook `subscription_preapproval` con `status=cancelled` → BD actualizada

**Anual con cualquier medio de pago (Preference, pago único):**
1. `SubscribeButton` → `POST /api/mercadopago/create-preference` con `{ plan, period: 'annual' }`
2. Checkout MP con precio = monthly × 12; `external_reference = "{userId}:{plan}:annual"`
3. Retorna a `/plans/success?payment_id=XXX&status=approved`
4. Success page parsea `:annual` → activa con `expires_at = now + 12 meses`
5. No hay renovación automática — el usuario debe renovar manualmente al vencer

### Webhook — eventos manejados

| Evento (`body.type`) | Qué hace |
|---|---|
| `payment` | Pago único aprobado → activa suscripción (1 mes o 12 si `external_reference` termina en `:annual`) |
| `subscription_preapproval` status `authorized` | Preapproval autorizado → activa suscripción con 1 mes |
| `subscription_preapproval` status `cancelled` | Cancelado desde MP → marca `status=cancelled` en BD |
| `subscription_preapproval` status `paused` | MP reintentará cobro → solo log, no toca BD |
| `subscription_authorized_payment` | Cargo mensual exitoso → extiende `expires_at` +1 mes en BD |

Verificación de firma: HMAC-SHA256 con `x-signature` header. Manifest: `id={data_id}&request-id={x-request-id}&ts={ts}`.

### Cancelar suscripción
`POST /api/subscriptions/cancel` → intenta cancelar el PreApproval en MP via `preApproval.update({ status: 'cancelled' })` (falla silenciosamente si era pago único) → marca `status=cancelled` en BD. El usuario conserva acceso hasta `expires_at`.

### Variables de entorno en Vercel (todas configuradas ✅)

| Variable | Valor / Origen |
|---|---|
| `APP_URL` | `https://dc-project-web.vercel.app` (server-side, sin NEXT_PUBLIC_) |
| `MERCADOPAGO_ACCESS_TOKEN` | MP Developers → Credenciales producción (`APP_USR-...`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | MP Developers → Webhooks → Secreto |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hkmvbutjjrxmegdliiqt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |

### Webhook en MP Dashboard

- Registrado en modo **Productivo** en mercadopago.cl/developers/panel
- URL: `https://dc-project-web.vercel.app/api/mercadopago/webhook`
- Eventos: **Pagos** + **Suscripciones** (agregar Suscripciones si aún no está)

### Cómo testear MP en sandbox

1. Usar token `TEST-...` (Vercel preview branch o local con ngrok)
2. Tarjeta de prueba aprobada: `4009175332806176` (Visa Chile), cualquier vencimiento futuro, CVV `123`
3. Tarjeta rechazada: `4013793337199442`
4. Para testear renovación mensual: MP Dashboard → Suscripciones → seleccionar suscripción de prueba → "Cobrar ahora"
5. Para testear paused/cancelled: cambiar estado desde el panel de MP sandbox

---

## Deploy en Vercel — Lecciones aprendidas

### Node.js local es v12 — no puede buildear Next.js

El entorno WSL2 local tiene Node v12 (demasiado viejo para Next.js 14). Todo build se hace en Vercel. Para verificar errores de TypeScript antes de pushear, hacer code review manual.

### Errores TypeScript solucionados

**`Property 'x' does not exist on type 'never'`** en server components:
- Causa: tablas en `database.ts` sin `Relationships: []`
- Fix: agregar `Relationships: []` + casts explícitos con `as Type | null`

**`Type 'null' is not assignable to type 'string | undefined'`** en PreApproval:
- Causa: SDK de MP no acepta `null` en `end_date`, solo `undefined`
- Fix: usar `end_date: undefined` en lugar de `null`

### Variables de entorno: NEXT_PUBLIC_ vs server-side

Las `NEXT_PUBLIC_` se incrustan en el bundle en el momento del build. Cambiarlas en Vercel requiere un push nuevo (no basta con "Redeploy"). Para valores server-side usar variables sin prefijo (ej: `APP_URL`).

Para forzar rebuild limpio:
```bash
git commit --allow-empty -m "force rebuild" && git push
```

### Supabase — Configuración de producción

En Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://dc-project-web.vercel.app`
- **Redirect URLs:** `https://dc-project-web.vercel.app/**`

### El bug de `never` en supabase-js

El archivo `packages/shared/src/types/database.ts` fue limpiado manualmente (eliminadas ~900 líneas de PostGIS). La sección `Functions` debe tener:
```typescript
Functions: {
  [_: string]: { Args: Record<string, unknown>; Returns: unknown }
}
```
Si se regenera con `supabase gen types`, volver a limpiar PostGIS y verificar `Functions`.

---

## Estructura de archivos relevante (web)

```text
apps/web/src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── feed/page.tsx
│   │   ├── explore/page.tsx
│   │   ├── create-class/page.tsx
│   │   ├── class/[id]/page.tsx           # "Salir de clase" para alumnos
│   │   ├── class/[id]/edit/page.tsx
│   │   ├── my-classes/page.tsx           # tabs: tomo / dicto (ACTUALIZADO)
│   │   ├── dashboard/page.tsx            # legacy, no está en nav
│   │   ├── notifications/page.tsx
│   │   ├── payment/[enrollmentId]/page.tsx
│   │   ├── teacher/[username]/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── profile/edit/page.tsx         # edición completa
│   │   ├── profile/payment-info/page.tsx
│   │   └── plans/
│   │       ├── page.tsx                  # dos botones por plan (mensual/anual)
│   │       ├── success/page.tsx          # maneja preapproval_id y payment_id
│   │       └── failure/page.tsx
│   ├── api/
│   │   ├── mercadopago/
│   │   │   ├── create-subscription/route.ts  # PreApproval (mensual, crédito)
│   │   │   ├── create-preference/route.ts    # Preference (anual o legacy mensual)
│   │   │   └── webhook/route.ts              # maneja todos los eventos MP
│   │   └── subscriptions/
│   │       └── cancel/route.ts               # cancela en MP + BD
│   └── auth/login/ + auth/register/
├── components/
│   ├── ui/ (TopBar, BottomNav, Avatar, ConfirmDialog, MonthCalendar, LogoutButton)
│   ├── feed/ (FeedClient, ClassCard, ExploreClient, UserCard)
│   ├── class/ (ClassDetailClient, CreateClassForm, EditClassForm, DashboardClient, MyClassesClient)
│   ├── notifications/ (NotificationsClient)
│   ├── payment/ (PaymentClient)
│   ├── plans/ (SubscribeButton, CancelSubscriptionButton)
│   └── profile/ (EditProfileForm, TeacherProfileClient, PaymentInfoForm)
└── lib/
    ├── utils.ts
    ├── subscription.ts
    └── supabase/ (client.ts, server.ts, admin.ts)
```

---

## Pasos siguientes — próxima sesión

### A. SQL pendiente de aplicar en Supabase

Aplicar en orden en el Dashboard SQL Editor:
- `007_payment_receipts_bucket.sql` — bucket para comprobantes de pago de clases
- `008_trust_posts.sql` ← NUEVA (sesión 2026-05-14): trust_endorsements, posts, dismissed_debts, bucket posts-media, tipo notificación `debt_warning`

### B. Variable de entorno nueva en Vercel

Agregar `CRON_SECRET` (string aleatorio) en Vercel → Settings → Environment Variables. Mismo valor debe estar en el header `Authorization: Bearer {CRON_SECRET}` que Vercel envía automáticamente a los cron jobs.

### C. Pantallas mobile pendientes (Expo) ← PRIORIDAD SIGUIENTE

La app mobile tiene el layout base pero faltan todas las pantallas funcionales. Antes de empezar mobile: explorar qué pantallas ya existen en `apps/mobile/`.

### D. Mejoras web pendientes (menor prioridad)

- **`/dashboard`:** considerar redirect a `/my-classes?tab=teaching` o dejarlo como está (legacy, funcional pero fuera del nav).

### E. Funcionalidades futuras (no prioritarias para MVP)

- **Notificaciones push Expo** — cuando se confirma/rechaza un pago o se publica una clase
- **Sistema 2x** — buscar compañer@ de baile (`2x_request` / `2x_match` ya están en schema)
- **Descuentos de último minuto** — campo `discount_percentage` en clases
- **OCR de comprobantes** — identificación automática del monto
- **Dashboard de analytics** — estadísticas de ingresos y asistencia para profesores
- **Renovación anual automática** — actualmente el plan anual no se renueva solo; el usuario debe volver a pagar manualmente
