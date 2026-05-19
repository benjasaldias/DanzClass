# DanceClass — Resumen del proyecto y pasos siguientes

Este documento es un briefing para continuar el desarrollo en una nueva sesión de Claude.

---

## Contexto del problema

DanceClass es una plataforma web + móvil para conectar profesores y estudiantes de baile en Chile. El mercado actual es completamente informal: los profesores usan Instagram Stories y WhatsApp para publicar sus clases, los pagos se hacen por transferencia bancaria enviando captura de pantalla al profesor, y hay problemas de sobrecupo y descuentos de último minuto sin alcance.

---

## Stack técnico

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`), sin Turborepo
- **Web:** Next.js 14 (App Router) + TypeScript + Tailwind CSS — `apps/web/`
- **Mobile:** Expo SDK 54 (Expo Router v6) + React Native 0.81.5 + React 19.1.0 + NativeWind 4.2.x — `apps/mobile/`
- **Backend:** Supabase — PostgreSQL + Auth + Storage + Realtime
- **Shared:** `packages/shared/` — tipos TypeScript compartidos y cliente Supabase base
- **Color de marca:** `#c026d3` (Tailwind `brand-600`, escala morada en ambas apps)
- **Node.js local:** v12 (WSL2) — demasiado viejo para correr `next build` localmente. Siempre buildear en Vercel.

---

## Migraciones SQL aplicadas (en orden)

### 001_initial_schema.sql
Schema base completo con RLS en todas las tablas:
- `profiles` — extiende `auth.users`; campos `role`, `city`, `instagram_handle`, `avatar_url`
- `teacher_payment_info` — datos de transferencia (banco, tipo cuenta, número, RUT, titular)
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

### 006_notification_types.sql
- Extiende constraint de tipo de notificación para incluir: `follow`, `new_class`, `class_updated`, `class_cancelled`
- Añade política `notifications_insert_any`: cualquier usuario autenticado puede insertar notificaciones

### 007_payment_receipts_bucket.sql ✅ APLICADA
- Bucket `payment-receipts` (público, 10MB, imagen/PDF) con políticas RLS

### 008_trust_posts.sql ✅ APLICADA (sesión 2026-05-14)
- Tabla `trust_endorsements` (endorser_id, endorsed_id, PK compuesto, check no self-endorse)
- Tabla `posts` (id, user_id, title, video_url, thumbnail_url, is_public, city)
- Tabla `dismissed_debts` (teacher_id, student_id) — profesores descartan deudores
- Bucket `posts-media` (100MB, video/imagen)
- Constraint notificaciones extendido con `debt_warning`

### 009_class_type_post_visibility.sql ✅ APLICADA (sesión 2026-05-15)
- `ALTER TABLE classes ADD COLUMN class_type TEXT CHECK (class_type IN ('coreografía', 'freestyle', 'otro'))` — tipo de clase opcional
- `ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'friends'))` — reemplaza lógica de `is_public`
- Backfill: posts con `is_public = false` → `visibility = 'followers'`

### 010_reports_music.sql ✅ APLICADA (sesión 2026-05-15)
- Tabla `reports` (reporter_id, content_type: post/class, content_id, reason: copyright/inappropriate/spam/other, description, status: pending/reviewed/dismissed)
- UNIQUE constraint: un usuario no puede reportar el mismo contenido dos veces
- RLS: INSERT propio; SELECT propio
- ⚠️ La versión aplicada incluía también columnas `music_*` en posts (feature descartada luego)

### 011_drop_music_columns.sql ✅ APLICADA (sesión 2026-05-15)
- Elimina columnas `music_id`, `music_title`, `music_artist`, `music_preview_url` de `posts`

### 012_add_new_report_notification.sql ✅ APLICADA (sesión 2026-05-18)

- Extiende constraint de tipo de notificación para incluir: `new_report`

### 013_2x_requests.sql ✅ APLICADA (sesión 2026-05-18)

- Tabla `class_2x_requests` (user_id, class_id, matched_with, status, payment_assignee) con UNIQUE(user_id, class_id)
- `ALTER TABLE enrollments ADD COLUMN is_2x BOOLEAN DEFAULT FALSE`
- `ALTER TABLE enrollments ADD COLUMN partner_enrollment_id UUID`
- `ALTER TABLE classes ADD COLUMN price_suelta_2x INTEGER`
- Extiende constraint notifications con `2x_payment_turn`

### 014_discounts.sql ✅ APLICADA (sesión 2026-05-18)

- `ALTER TABLE classes ADD COLUMN discount_price INTEGER`
- `ALTER TABLE classes ADD COLUMN discount_price_monthly INTEGER`
- Extiende constraint notifications con `class_discount`

### 015_entrenamiento.sql ✅ APLICADA (sesión 2026-05-18)

- Modifica constraint `classes_type_check` para incluir `'entrenamiento'`
- `ALTER TABLE classes ADD COLUMN requires_audition BOOLEAN DEFAULT FALSE`
- `ALTER TABLE classes ADD COLUMN audition_closed BOOLEAN DEFAULT FALSE`
- `ALTER TABLE classes ADD COLUMN ends_at DATE`
- `ALTER TABLE classes ADD COLUMN ends_indefinitely BOOLEAN DEFAULT FALSE`
- Tabla `auditions` (class_id, applicant_id, full_name, age, phone, video_url, status, notes) con UNIQUE(class_id, applicant_id)
- Bucket `audition-videos` (privado, 100MB, video)
- Constraint final notifications con todos los tipos: `audition_accepted`, `audition_rejected`

---

## Estado de implementación — Web (apps/web)

### ✅ Autenticación y layout
- Login / Register con react-hook-form + zod
- Middleware protege rutas `/(app)/*`
- Layout `(app)/layout.tsx`: carga perfil, subscripción, count de notificaciones

### ✅ TopBar
- Badge de notificaciones sin leer

### ✅ Feed (`/feed`)
- Tabs: **Siguiendo** / **Global** / **Cerca**
- Dropdown filtro de contenido: **Todos / Clases / Videos**
- Clases y posts mezclados ordenados por fecha
- Posts en feed: filtro por `visibility` (público en global/cerca; todos en siguiendo)
- ClassCard con tono lila sutil para distinguir de posts
- Cupos en formato `x/y cupos disponibles` con color verde/rojo

### ✅ Publicar (`/publish`) — NUEVA
- Página de elección: **Clase** (→ `/create-class`) o **Video** (abre modal inline)
- BottomNav "Publicar" apunta a `/publish` en vez de `/create-class`
- Botón Video eliminado del feed (era cramped junto a los filtros)

### ✅ Explorar (`/explore`)
- Búsqueda de clases por texto
- Búsqueda de usuarios con filtros: Tod@s / Amig@s / Siguiendo

### ✅ Clases
- **`/create-class`** — tipo, estilo, **tipo de clase** (coreografía/freestyle/otro), nivel, fechas, media, precio
- **`/class/[id]`** — detalle con carrusel sin crop (imágenes `object-contain`, videos ratio nativo), info, CTA de reservar
  - Profesor: editar, eliminar; Alumno: salir de la clase
  - Clases custom: botón **"Ver fechas"** abre `CustomDatesCalendar` con calendario de solo lectura destacando las fechas
- **`/class/[id]/edit`** — edición pre-rellenada con `class_type`; sección "Zona peligrosa" al final con botón **Eliminar esta clase** (notifica inscritos, soft-delete)

### ✅ Mis clases (`/my-classes`)
- Tabs: "Clases que tomo" / "Clases que dicto"
- Tab "Dicto": deudores globales + por clase, confirmación de pagos, eliminación de alumnos
- Banner naranja con fecha de eliminación de archivos (suelta: fecha+7d, periódica: fin de mes+7d)
- Sección post-eliminación con pagos pendientes y botón "Pago Confirmado"

### ✅ Notificaciones (`/notifications`)

- Tipos: follow, friend_request, friend_accepted, new_class, class_updated, class_cancelled, payment_confirmed, payment_rejected, 2x_request, 2x_match, **2x_payment_turn**, debt_warning, new_report, **class_discount**, **audition_accepted**, **audition_rejected**

### ✅ Perfil público (`/teacher/[username]`) — ACTUALIZADO sesión 2026-05-16

- Stats: clases dictadas, cupos pagados, cuántos confían
- Botón "Confío en este usuario" (toggle, muestra count)
- Popup post-clase preguntando recomendación (`EndorsementPopup`)
- Follow/unfollow, amistad completa (enviar/aceptar/eliminar)
- **Sección "Publicaciones"** — muestra posts del usuario con filtro de visibilidad según relación:
  - Amigo → ve todos (público + seguidores + amigos)
  - Seguidor → ve público + seguidores
  - Sin relación → solo públicos
  - Perfil propio → todos sin filtro

### ✅ Perfil propio (`/profile`) — ACTUALIZADO sesión 2026-05-16

- Mismo layout rico que perfil ajeno: avatar, bio, ciudad, seguidores, stats, Instagram
- Botones de acción como pills: **Editar Perfil**, **Datos Transferencia** (solo si canTeach), **Cerrar Sesión**
- Banner de plan de suscripción justo debajo de los botones
- Estilos de baile (baila/enseña)
- Clases activas publicadas + inscripciones propias
- **Sección "Mis publicaciones"** — todos los posts propios con menú de gestión (editar privacidad / eliminar)

### ✅ Posts/Videos — ACTUALIZADO sesión 2026-05-16

- `CreatePostModal` — sube video a **Cloudinary** (si configurado) o Supabase Storage como fallback; visibilidad: Público / Seguidores / Amigos
- `PostCard` — video adaptivo al ratio nativo (horizontal o vertical), sin `aspect-video` fijo
- Badge de privacidad en PostCard: ícono + label para `followers` y `friends`
- **Menú ⋮ en PostCard para el autor:** "Editar privacidad" (popover inline con los 3 niveles) y "Eliminar" (ConfirmDialog + `router.refresh()`)
- Botón de **denuncia** (flag) en header del PostCard — visible solo para quien no es el autor

### ✅ Sistema de denuncias — ACTUALIZADO sesión 2026-05-16

- Modal con 4 razones predefinidas: infracción de derechos de autor, contenido inapropiado, spam, otro
- Descripción adicional opcional; UNIQUE constraint evita reportes duplicados
- **Posts:** botón flag en `PostCard` (solo para no-autores)
- **Clases:** botón "Reportar" en header de `ClassDetailClient` (solo para no-profesores)
- Reportes van por API route (`/api/reports`) — inserta en `reports` + envía `new_report` al superadmin
- `SUPERADMIN_USER_ID` env var controla quién recibe notificaciones de reporte

### ✅ Panel superadmin (`/admin`) — NUEVO sesión 2026-05-16

- Accesible solo si `user.id === SUPERADMIN_USER_ID`
- Lista todos los reportes pendientes con: reporter, razón, tipo de contenido, descripción, fecha
- Botón **"Eliminar contenido"** — elimina el post/clase y marca reporte como `reviewed`
- Botón **"Descartar"** — marca reporte como `dismissed` sin eliminar contenido
- API route `POST /api/admin/content-action` con validación de admin (service role)
- Para obtener el UUID del admin: Supabase → Authentication → Users

### ✅ Términos de Uso (`/terms`)
- Página pública en `/terms` — 11 cláusulas en español, sin login requerido
- Cláusula 2: el usuario **declara ser titular de los derechos** sobre el audio y video que sube
- DanceClass se posiciona como plataforma intermediaria (safe harbor)
- **Registro** actualizado: checkbox obligatorio `z.literal(true)` que enlaza a `/terms`; no se puede crear cuenta sin aceptarlo

### ✅ Inscripción 2x (pareja) — NUEVO sesión 2026-05-17 / MEJORADO sesión 2026-05-17b

- Campo `price_2x` en crear/editar clase (precio total para dos personas en un comprobante)
- Campo `price_suelta_2x` para clases periódicas (idem pero por clase suelta)
- Botón **"Busco 2x"** en detalle de clase → crea `class_2x_requests` (status: looking)
- Cuando emparejado: botón "Ir a pagar" o "Que pague mi compañer@" (transfiere `payment_assignee`) en TwoxRequestButton
- API route `POST /api/class-2x/match` — crea enrollments para ambos (is_2x=true), notifica al solicitante; maneja race condition devolviendo 404 si ya emparejado
- API route `POST /api/class-2x/transfer-payment` — solo el `payment_assignee` actual puede transferir; actualiza y notifica
- **Sección "Amigos buscando 2x"** en detalle de clase — dropdown colapsable con badge de count; muestra amigos con `class_2x_requests.status='looking'` para esa clase; botón "¡Ir juntos!" llama a `/api/class-2x/match`; en caso de race condition muestra error y quita la entrada; tras match exitoso hace `router.refresh()` (no redirige a pago, ya que el pago lo inicia el solicitante)
- **Sección en feed "Siguiendo"** — `FriendsTwoxList` colapsable con count; al hacer race condition muestra "Ya fue tomado" 2 segundos y quita la entrada
- Precios 2x en `ClassCard` mostrados inline junto al precio correspondiente: `$15.000 · 2x $18.000`; suelta también: `Suelta: $5.000 · 2x $8.000`
- **Página de pago** — detecta `enrollment.is_2x`; muestra `price_2x` como monto; si el usuario NO es `payment_assignee`: pantalla "Tu compañer@ va a pagar" sin formulario; si SÍ es assignee: formulario de pago + botón "Que pague mi compañer@" que llama a transfer API y hace `router.refresh()`
- Notificación `2x_match` (emparejamiento) y `2x_payment_turn` (turno de pago)

### ✅ Descuentos espontáneos — NUEVO sesión 2026-05-17

- Botón **"Descuento"** en header de `ClassDetailClient` (solo para profesor)
- `DiscountModal` — define `discount_price` (suelta/suelta de mensual) y `discount_price_monthly`
- API route `POST /api/class/discount` — guarda descuento y notifica a todos los seguidores
- Precio con descuento en `ClassCard`: tachado original + naranja el nuevo
- Precio con descuento en `ClassDetailClient`: ídem en el CTA de pago
- Banner naranja "¡Descuento activo!" en detalle de clase
- Notificación `class_discount` para seguidores

### ✅ Entrenamiento (nuevo tipo de clase) — NUEVO sesión 2026-05-17 / MEJORADO sesión 2026-05-17b

- Nuevo tipo `'entrenamiento'` en el selector de tipo de clase
- Solo precio mensual (sin suelta); fecha de término requerida (o "Indefinido")
- Toggle **"Requiere postulación"** — habilita etapa de audiciones
- Botón **"Postularme"** en ClassDetailClient con `AuditionModal` (nombre, edad, teléfono, video)
- Página `/class/[id]/auditions` — `AuditionsListClient` para el profesor:
  - Acepta/rechaza con botones de decisión **local** (sin escritura inmediata a DB)
  - Badge "(borrador)" mientras la decisión no está publicada; botón "Deshacer"
  - Botón sticky **"Publicar resultados (N postulaciones)"** — escribe todas las decisiones a DB y envía notificaciones en batch; los alumnos reciben `audition_accepted` o `audition_rejected`
- Botón **"Cerrar postulaciones"** — marca `audition_closed=true`; luego la clase se edita normalmente
- Bucket `audition-videos` (privado, solo profesor y postulante pueden ver)
- **Fecha de término en clases periódicas** — campo `ends_at` requerido para toda clase periódica
- Popup "Las clases sin fecha de término deben ser de tipo Entrenamiento" si se intenta marcar Indefinido en periódica

### ✅ Bugfix postulaciones (auditions) — sesión 2026-05-18

- **Notificación al profesor:** `AuditionModal` ahora envía `new_audition` al profesor tras insertar la postulación. Requiere `teacherId` prop (pasado desde `ClassDetailClient` con `classData.teacher_id`).
- **Nueva migración `016_new_audition_notification.sql`:** extiende constraint de `notification_type` con `'new_audition'`.
- **Videos de postulación:** bucket `audition-videos` es privado. `AuditionModal` ahora guarda el **path** del storage (no la URL pública) en `video_url`. `AuditionsListClient` genera una **URL firmada** al hacer clic en "Ver video" con `createSignedUrl` (válida 1h).
- **"Mis clases" muestra postulaciones:** query en `my-classes/page.tsx` incluye `auditions(id, status)`. `TeachingTab` en `MyClassesClient` muestra link "Ver postulaciones" con badge de count pendientes para clases `requires_audition=true`.
- **Notificaciones:** `NotificationsClient` incluye `new_audition` con ícono `ClipboardList`, muestra `@username se postuló a tu entrenamiento`, navega a `/class/${class_id}/auditions`.

### ✅ QA pass — sesión 2026-05-18

- **PaymentClient:** banner de advertencia cuando `is_2x=true` pero el profesor no configuró `price_2x`
- **API `POST /api/class/discount`:** validación server-side que `discount_price < precio original` (defense-in-depth; la validación client-side ya existía en `DiscountModal`)
- **CreateClassForm:** rechaza fechas pasadas en clase suelta; rechaza `ends_at` en el pasado; error explícito cuando se supera el límite de fotos/videos del plan
- **EditClassForm:** valida que `ends_at` sea posterior a la fecha de inicio
- **MonthCalendar:** nueva prop `disablePast` — deshabilita días anteriores a hoy (usada en crear clase, no en editar)
- **ClassCard:** clases `custom` muestran preview de primeras 3 fechas: "15/6, 22/6, 29/6... · 4 clases · 19:00"
- **TeacherProfileClient:** perfil propio sin estilos muestra placeholder "Sin estilos especificados — añade tus estilos" con link a `/profile/edit`
- **MyClassesClient:** empty state de "Clases que tomo" apunta a `/explore` en vez de `/feed`

### ✅ Mejoras de UX en formularios y feed — sesión 2026-05-17b

- **Fechas en formato chileno DD/MM/AAAA** — nuevo componente `ui/DateInput.tsx`: recibe `value` YYYY-MM-DD, muestra DD/MM/AAAA; auto-inserta barras al escribir dígitos; reemplaza todos los `<input type="date">` en `CreateClassForm` y `EditClassForm`
- **Scroll del mouse no modifica campos numéricos** — todos los `<input type="number">` tienen `onWheel={(e) => (e.target as HTMLInputElement).blur()}` en ambos formularios
- **Campo `class_type` verdaderamente opcional** — schema Zod usa `z.preprocess((v) => v === '' ? undefined : v, z.enum(...).optional())` en ambos formularios; antes rechazaba el string vacío del `<select>`
- **Sección de precios en ClassCard con fondo verde suave** — `bg-emerald-50/60` con `border-t border-emerald-100` separa visualmente el bloque de precio/CTA del resto del contenido de la card
- **Dropdown de amigos buscando 2x en ClassDetailClient** — sección colapsable con badge de count; reemplaza lista siempre expandida que no escalaría con muchos amigos

### ✅ Planes y suscripciones (`/plans`)
- Básico: $1.500/mes — 1 clase suelta/mes + 1 foto/video
- Pro: $3.500/mes — ilimitado
- Plan "Profesor" eliminado de UI (mantenido en TS type por compat DB)
- Mercado Pago integrado (mensual y anual)

### ✅ Cron de limpieza (`/api/cron/cleanup-classes`)
- Elimina media de clases vencidas diariamente a las 03:00 UTC
- Configurable con `CRON_SECRET` en Vercel

### ✅ Sistema de confianza
- `TrustButton` — toggle endorse con count en tiempo real
- `EndorsementPopup` — aparece al ver perfil de profesor tras clases cursadas

### ✅ Deudores
- Al inscribirse, notifica al profesor si el alumno tiene deuda previa
- Profesor puede descartar deudores con "Pago Confirmado" → tabla `dismissed_debts`

---

## Componentes UI clave

| Componente | Descripción |
|---|---|
| `ui/TopBar.tsx` | Barra superior con badge de notificaciones |
| `ui/BottomNav.tsx` | Nav inferior; "Publicar" → `/publish` (para canTeach) |
| `ui/Avatar.tsx` | Avatar con fallback a iniciales |
| `ui/ConfirmDialog.tsx` | Modal de confirmación con backdrop, modo destructivo |
| `ui/MonthCalendar.tsx` | Calendario para seleccionar fechas (crear clase custom) |
| `ui/CityCombobox.tsx` | Combobox con ciudades chilenas + texto libre |
| `ui/TrustButton.tsx` | Botón de confianza toggle con count |
| `ui/EndorsementPopup.tsx` | Popup post-clase pidiendo recomendación |
| `ui/LogoutButton.tsx` | Cerrar sesión; prop `asButton` para renderizar como pill |
| `ui/ReportModal.tsx` | Modal de denuncia; llama a `/api/reports` en vez de insertar directo |
| `ui/DateInput.tsx` | Input de fecha con formato DD/MM/AAAA; auto-inserta barras; almacena YYYY-MM-DD |
| `feed/ClassCard.tsx` | Card de clase con tono lila, cupos x/y, badge estilo-tipo; precios 2x inline; fondo emerald en sección precio |
| `feed/PostCard.tsx` | Video adaptivo al ratio nativo; menú ⋮ para autor (editar privacidad/eliminar) |
| `feed/FeedClient.tsx` | Feed unificado clases+posts con filtros |
| `feed/ExploreClient.tsx` | Explorar con filtros de usuarios |
| `feed/UserCard.tsx` | Card de usuario con follow + amistad |
| `feed/CreatePostModal.tsx` | Modal crear video con visibilidad p/s/amigos |
| `class/ClassDetailClient.tsx` | Detalle con carrusel sin crop (object-contain), botón "Ver fechas"; dropdown amigos 2x; sección 2x con TwoxRequestButton |
| `class/CustomDatesCalendar.tsx` | Calendar modal de solo lectura con fechas destacadas |
| `class/CreateClassForm.tsx` | Formulario con DateInput, class_type opcional, onWheel desactivado en números |
| `class/EditClassForm.tsx` | Ídem CreateClassForm + zona peligrosa |
| `class/TwoxRequestButton.tsx` | Botón "Busco 2x" / estado buscando / emparejado con turno de pago |
| `class/FriendsTwoxList.tsx` | Sección feed: amigos buscando 2x; colapsable; race condition feedback |
| `class/AuditionsListClient.tsx` | Decisiones locales (borrador) + botón "Publicar resultados" batch |
| `class/DiscountModal.tsx` | Modal descuento para profesor; llama a `/api/class/discount` |
| `class/AuditionModal.tsx` | Formulario postulación alumno (nombre, edad, teléfono, video) |
| `class/MyClassesClient.tsx` | Tabs tomo/dicto, deudores, banner eliminación |
| `notifications/NotificationsClient.tsx` | Lista con `debt_warning` y `new_report` |
| `payment/PaymentClient.tsx` | Pago con comprobante; soporta 2x (muestra price_2x, detecta assignee, botón transferir) |
| `plans/SubscribeButton.tsx` | Mensual (crédito) y anual (cualquier medio) |
| `publish/PublishChoiceClient.tsx` | Elección Clase vs Video |
| `profile/EditProfileForm.tsx` | Edición completa del perfil |
| `profile/TeacherProfileClient.tsx` | Perfil público con trust, stats, amistad, posts con filtro de visibilidad |
| `profile/PaymentInfoForm.tsx` | Datos de transferencia del profesor |
| `admin/AdminReportsClient.tsx` | Lista de reportes pendientes con acciones delete/dismiss |

---

## Tipos relevantes (packages/shared/src/types/index.ts)

```typescript
type SubscriptionTier = 'none' | 'basic' | 'teacher' | 'pro'
// 'teacher' mantenido solo por compatibilidad DB; eliminado de UI y planes

type NotificationType =
  | '2x_request' | '2x_match' | '2x_payment_turn'
  | 'friend_request' | 'friend_accepted'
  | 'payment_confirmed' | 'payment_rejected'
  | 'follow' | 'new_class' | 'class_updated' | 'class_cancelled' | 'class_discount'
  | 'debt_warning' | 'new_report'
  | 'audition_accepted' | 'audition_rejected'

const SUBSCRIPTION_PLANS = [
  { tier: 'basic', price: 1500, name: 'Básico', ... },
  { tier: 'pro',   price: 3500, name: 'Pro',    ... },
]

const CHILEAN_CITIES = ['Santiago', 'Viña del Mar', 'Valparaíso', ...]

canTeach(tier)          // basic | teacher | pro
canTeachUnlimited(tier) // teacher | pro
canUploadVideo(tier)    // basic | teacher | pro
```

---

## Decisiones técnicas importantes

- **Roles eliminados:** diferenciación estudiante/profesor por `subscription_tier` (`canTeach(tier)`).
- **TypeScript + Supabase:** queries con joins anidados (`class:classes!inner(*)`) superan el límite de profundidad de inferencia. Fix: castear `supabase as any` o el argumento `.select('...' as any)` antes de la cadena para cortar la inferencia.
- **`visibility` en posts:** columna TEXT con CHECK ('public'/'followers'/'friends') reemplaza la lógica booleana `is_public`. Backfill automático en migración 009.
- **`class_type` en clases:** columna TEXT nullable ('coreografía'/'freestyle'/'otro'). Opcional para el profesor. Se muestra junto al estilo: "House - Freestyle".
- **Cupos en feed:** el select de clases incluye `enrollments(id, status)` y ClassCard computa `confirmedCount` para mostrar `x/y cupos disponibles`.
- **Video adaptivo:** `<video>` con `w-full h-auto max-h-[85vh]` sin contenedor `aspect-video`. El navegador renderiza el ratio nativo del archivo.
- **Videos sin crop en clases:** carrusel en `ClassDetailClient` reemplazó `aspect-square` + `object-cover` por contenedor `bg-black min-h-[240px]`; imágenes con `object-contain max-h-[70vh]` (letterbox negro), videos con `max-h-[85vh]`. Elimina cropping sin romper el layout.
- **ReportModal → API route:** el modal ya no inserta directo en Supabase; llama a `POST /api/reports` que usa el service role para insertar el reporte y notificar al superadmin. Evita que el cliente necesite permisos de escritura especiales.
- **Superadmin sin rol en DB:** identificado solo por `SUPERADMIN_USER_ID` env var comparado server-side. No requiere columna `is_admin` en profiles.
- **Flujo de pago 2x:** solo el `payment_assignee` (por defecto el solicitante) paga. El otro usuario ve "Tu compañer@ va a pagar" en PaymentClient sin formulario. La transferencia de turno la hace el assignee actual llamando a `transfer-payment`; usa `.eq('payment_assignee', user.id)` para evitar transferencias no autorizadas.
- **Race condition en 2x match:** el API route filtra `.eq('status', 'looking')` en la query; si dos usuarios hacen match simultáneo, el segundo recibe 404 y el frontend lo muestra y quita la entrada de la lista.
- **DateInput:** no usa `type="date"` (Chrome ignora `lang` y muestra formato del OS). En su lugar usa `type="text"` + `inputMode="numeric"` con auto-formateo de barras al escribir dígitos. El estado interno es YYYY-MM-DD para compatibilidad con react-hook-form y Supabase.
- **Soft-delete clases:** `UPDATE classes SET status='cancelled'`, preserva historial.
- **Cron seguridad:** `CRON_SECRET` validado con `Authorization: Bearer` header que Vercel inyecta automáticamente.
- **Notificaciones cross-user:** política RLS `notifications_insert_any` con `WITH CHECK (true)`.

---

## Integración Mercado Pago — Estado actual

### Variables de entorno en Vercel (todas configuradas ✅)

| Variable | Descripción |
|---|---|
| `APP_URL` | `https://dc-project-web.vercel.app` |
| `MERCADOPAGO_ACCESS_TOKEN` | Token producción MP |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto webhook MP |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para admin client |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública |
| `CRON_SECRET` | ⚠️ Verificar si está configurada en Vercel |

### Dos modalidades de suscripción

**Mensual (PreApproval, solo crédito):** create-subscription → checkout MP → /plans/success → activa 1 mes → webhook renueva mensualmente.

**Anual (Preference, cualquier medio):** create-preference con `period=annual` → precio×12 → /plans/success → activa 12 meses (sin renovación automática).

---

## Deploy en Vercel — Lecciones aprendidas

### Node.js local es v12 — no puede buildear Next.js
Todo build se hace en Vercel. Verificar errores TS manualmente antes de pushear.

### TypeScript — Error "Type instantiation is excessively deep"
Ocurre en queries Supabase con joins anidados. Fix: `(supabase as any).from(...)` o `.select('...' as any)`.

### Variables de entorno: NEXT_PUBLIC_ vs server-side
Las `NEXT_PUBLIC_` se incrustan en el bundle en el build. Cambiarlas requiere un push nuevo.

### Supabase — Configuración de producción
- **Site URL:** `https://dc-project-web.vercel.app`
- **Redirect URLs:** `https://dc-project-web.vercel.app/**`

---

## Estructura de archivos relevante (web)

```text
apps/web/src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── feed/page.tsx
│   │   ├── explore/page.tsx
│   │   ├── publish/page.tsx              # NUEVA — elige clase o video
│   │   ├── create-class/page.tsx
│   │   ├── class/[id]/page.tsx             # + fetch friendships + friends' 2x requests
│   │   ├── class/[id]/edit/page.tsx
│   │   ├── class/[id]/auditions/page.tsx   # NUEVA — panel postulaciones para entrenamiento
│   │   ├── my-classes/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── payment/[enrollmentId]/page.tsx
│   │   ├── teacher/[username]/page.tsx   # ACTUALIZADO — fetch posts con filtro de visibilidad
│   │   ├── profile/page.tsx              # ACTUALIZADO — fetch + muestra posts propios
│   │   ├── profile/edit/page.tsx
│   │   ├── profile/payment-info/page.tsx
│   │   └── admin/page.tsx                # NUEVA — panel superadmin (requiere SUPERADMIN_USER_ID)
│   │   └── plans/
│   │       ├── page.tsx
│   │       ├── success/page.tsx
│   │       └── failure/page.tsx
│   ├── api/
│   │   ├── mercadopago/
│   │   │   ├── create-subscription/route.ts
│   │   │   ├── create-preference/route.ts
│   │   │   └── webhook/route.ts
│   │   ├── subscriptions/cancel/route.ts
│   │   ├── reports/route.ts               # POST: insertar reporte + notificar admin
│   │   ├── admin/content-action/route.ts  # POST: delete/dismiss desde panel admin
│   │   ├── class-2x/
│   │   │   ├── match/route.ts             # POST: emparejar 2x (crea 2 enrollments is_2x=true)
│   │   │   └── transfer-payment/route.ts  # POST: transferir turno de pago entre pareja
│   │   ├── class/discount/route.ts        # POST: guardar descuento + notificar seguidores
│   │   └── cron/cleanup-classes/route.ts  # limpieza diaria 03:00 UTC
│   ├── terms/page.tsx                    # NUEVA — página pública /terms
   └── auth/login/ + auth/register/
├── components/
│   ├── ui/ (TopBar, BottomNav, Avatar, ConfirmDialog, MonthCalendar,
│   │        CityCombobox, TrustButton, EndorsementPopup, LogoutButton,
│   │        ReportModal, DateInput)
│   ├── feed/ (FeedClient, ClassCard, PostCard, ExploreClient,
│   │          UserCard, CreatePostModal)
│   ├── class/ (ClassDetailClient, CustomDatesCalendar, CreateClassForm,
│   │           EditClassForm, DashboardClient, MyClassesClient,
│   │           TwoxRequestButton, FriendsTwoxList, DiscountModal,
│   │           AuditionModal, AuditionsListClient)
│   ├── notifications/ (NotificationsClient)
│   ├── payment/ (PaymentClient)
│   ├── plans/ (SubscribeButton, CancelSubscriptionButton)
│   ├── publish/ (PublishChoiceClient)
│   ├── admin/ (AdminReportsClient)        # NUEVA
│   └── profile/ (EditProfileForm, TeacherProfileClient, PaymentInfoForm)
└── lib/
    ├── utils.ts
    ├── subscription.ts
    ├── cloudinary.ts                     # NUEVA — helper upload + isCloudinaryConfigured()
    └── supabase/ (client.ts, server.ts, admin.ts)
```

```text
supabase/migrations/
├── 001_initial_schema.sql              ✅
├── 002_subscriptions_friends_2x.sql    ✅
├── 003_profile_dance_styles.sql        ✅
├── 004_class_schedule_improvements.sql ✅
├── 005_storage_policies.sql            ✅
├── 006_notification_types.sql          ✅
├── 007_payment_receipts_bucket.sql     ✅
├── 008_trust_posts.sql                 ✅
├── 009_class_type_post_visibility.sql  ✅
├── 010_reports_music.sql               ✅ (tabla reports + columnas music_* en posts)
├── 011_drop_music_columns.sql          ✅ (elimina columnas music_* de posts)
├── 012_add_new_report_notification.sql ✅
├── 013_2x_requests.sql                 ✅
├── 014_discounts.sql                   ✅
└── 015_entrenamiento.sql               ✅
```

---

## Pendientes

### ✅ Migraciones 012–015 — APLICADAS (sesión 2026-05-18)

### ⚠️ Acciones pendientes en Vercel (si no se hicieron antes)

1. **Agregar `SUPERADMIN_USER_ID`** en Vercel → Settings → Environment Variables
2. **`CRON_SECRET`** en Vercel si no está configurada (`openssl rand -base64 32`)

### ✅ Cloudinary — Configurado (sesión 2026-05-16)

Las variables `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` y `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` ya deben estar en Vercel. Si no, ver instrucciones en sección **Integración Cloudinary** más abajo.

---

## Integración Cloudinary — Setup pendiente ⏳

Cloudinary comprime y optimiza los videos automáticamente al subir. El código en `CreatePostModal` detecta si está configurado y usa Cloudinary; si no, hace fallback a Supabase Storage. **No rompe nada si las variables no están.**

### Paso 1 — Crear cuenta en Cloudinary

1. Ir a [cloudinary.com](https://cloudinary.com) → **Sign up free**
2. El plan gratuito incluye 25 GB storage + 25 GB bandwidth/mes (suficiente para MVP)
3. Anotar el **Cloud Name** que aparece en el dashboard (esquina superior izquierda)

### Paso 2 — Crear Upload Preset (sin firma)

1. En el dashboard de Cloudinary: **Settings** (ícono engranaje) → **Upload**
2. Scroll hasta **Upload presets** → **Add upload preset**
3. Configurar:
   - **Preset name:** `danceclass_posts` (o cualquier nombre)
   - **Signing mode:** `Unsigned` ← importante
   - **Folder:** `posts` (opcional, para organizar)
4. En la pestaña **Upload manipulations** → **Incoming transformations**:
   - Agregar transformación: `q_auto,f_auto` — auto-calidad y auto-formato
   - Esto comprime el video automáticamente al subir
5. Guardar

### Paso 3 — Agregar variables en Vercel

En **Vercel → Settings → Environment Variables** agregar:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Tu cloud name (ej: `abcde12345`) |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Nombre del preset (ej: `danceclass_posts`) |

Luego hacer un redeploy (push vacío o desde Vercel dashboard).

### Cómo funciona en el código

```typescript
// lib/cloudinary.ts
isCloudinaryConfigured()    // true si ambas NEXT_PUBLIC_ están seteadas
uploadToCloudinary(file, 'video', 'posts')  // sube a Cloudinary, retorna { secure_url }

// CreatePostModal.tsx — lógica de subida:
if (isCloudinaryConfigured()) {
  videoUrl = (await uploadToCloudinary(file, 'video', 'posts')).secure_url
} else {
  // fallback: Supabase Storage bucket 'posts-media'
}
```

### Notas
- Las imágenes de clases (`class-media`) siguen en Supabase Storage — no se migraron
- Las URLs de Cloudinary son permanentes y servidas por CDN global
- Si en el futuro se quiere también comprimir imágenes de clases, se puede extender el mismo helper

---

## Estado Mobile — `apps/mobile/`

### Infraestructura ✅ — SDK 54 funcionando en iPhone (sesión 2026-05-18)

La app corre en Expo Go SDK 54 en iPhone real vía tunnel ngrok. Login y navegación funcionales.

#### Stack mobile actual
- Expo SDK 54, Expo Router v6, React Native 0.81.5, React 19.1.0 (New Architecture / Fabric)
- NativeWind 4.2.x + react-native-css-interop 0.2.3
- Tunnel: `npx expo start --tunnel` (requiere `NGROK_AUTHTOKEN`)

#### Problemas resueltos en el upgrade SDK 51 → 54

| Problema | Causa | Fix |
|---|---|---|
| `react-native-worklets/plugin` not found | NativeWind's babel requiere este plugin; no estaba en root node_modules | Agregar `react-native-worklets: "0.5.1"` al root `package.json` devDependencies |
| `react-native-css-interop/jsx-runtime` not found | NativeWind babel transform usa `importSource: "react-native-css-interop"` | Agregar `react-native-css-interop: "^0.2.3"` en `apps/mobile/package.json` |
| `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` crash | `react-native@0.81.5` usa API de React 19; root hoistea React 18 para web | `resolveRequest` custom en `metro.config.js` fuerza todas las resoluciones de `react` a `apps/mobile/node_modules` (React 19) |
| "Unmatched Route" en iPhone | No existía `app/index.tsx`; Expo Router v6 arranca en `/` | Crear `app/index.tsx` como pantalla de carga |
| Auth redirect bug | `_layout.tsx` condición `session && inAuthGroup` no cubría la ruta raíz `/` | Cambiar a `session && !inAppGroup` |
| `expo-file-system` `EncodingType` not found | En v19, API legacy se movió a subpath | `import * as FileSystem from 'expo-file-system/legacy'` |
| lucide TypeScript errors con React 19 | `LucideProps` roto por cambios de tipos React 19 | `types/lucide.d.ts` con module augmentation; `color` → `stroke` en todos los íconos |
| Assets not found | Directorio `assets/` no existía | Crear placeholders PNG 1×1 |

#### Paleta de colores — sesión 2026-05-18
`tailwind.config.js` actualizado para coincidir exactamente con `apps/web/tailwind.config.ts`:
- **`brand`**: escala púrpura oscura (`brand-600: #2D1B69`) — igual que web
- **`morado-flow`**: `#7F77DD` — acento principal en componentes nuevos
- **`noche-urbana`**: `#1A1035` — fondos oscuros
- **`coral-fuego`**: `#D85A30` — alertas/urgencia
- **`blanco-violeta`**: `#F5F3FF` — fondos de pantallas interiores
- **`lavanda-suave`**: `#EEEDFE` — tarjetas secundarias, chips
- **`gris-humo`**: `#6B6880` — texto secundario, metadata
- **`violeta-oscuro`**: `#534AB7` — texto sobre lavanda suave

#### Pantallas implementadas — sesión 2026-05-18 (sesión 2)

| Pantalla | Ruta mobile | Estado |
|---|---|---|
| Auth login | `(auth)/login` | ✅ react-hook-form + zod |
| Auth register | `(auth)/register` | ✅ sin selector de roles, checkbox términos |
| Feed | `(tabs)/feed` | ✅ tabs Siguiendo/Global/Cerca + dropdown Todos/Clases/Videos + ClassCard + PostCard (expo-video) |
| Explorar | `(tabs)/explore` | ✅ clases + usuarios con sub-filtros Tod@s/Amig@s/Siguiendo; badges amigo/siguiendo |
| Crear clase | `(tabs)/create` | ✅ elección suelta/periódica/entrenamiento/video; gate canTeach |
| Perfil propio | `(tabs)/profile` | ✅ stats, estilos baila/enseña, pills de acción, clases activas, mis publicaciones |
| Mis clases | `(tabs)/my-classes` | ✅ tabs tomo/dicto; confirmación de pagos; deudores; banner coral-fuego fecha eliminación |
| Notificaciones | `notifications` | ✅ todos los tipos con iconos y labels; navegación por tap; profileMap para nombres |
| Pago comprobante | `payment/[enrollmentId]` | ✅ 2x completo: is_2x, price_2x, payment_assignee, transferir turno (Bearer token) |
| Detalle clase | `class/[id]` | ✅ carrusel sin crop (expo-video para video), info completa, CTA reservar/salir, "Ver fechas" para custom |
| Perfil ajeno | `teacher/[username]` | ✅ stats (seguidores/clases/trust), follow, amistad, estilos, clases activas, posts filtrados por visibilidad |
| Crear clase | `class/create` | ✅ formulario completo: tipo/estilo/nivel, fecha DD/MM/AAAA, hora HH:MM, periodicidad, fechas custom, upload media (expo-image-picker → Supabase Storage), precios 2x, notifica seguidores |
| Editar clase | `class/[id]/edit` | ✅ mismos campos pre-rellenados + media existente/nueva + zona peligrosa con eliminar (soft-delete, notifica inscritos) |
| Publicar video | `class/create-post` | ✅ título, video (expo-image-picker), visibilidad pub/seg/amigos, Cloudinary fallback Supabase Storage |
| Editar perfil | `profile/edit` | ✅ avatar (expo-image-picker → bucket avatars), nombre, @username, bio, ciudad, estilos baila/enseña (chips toggleables), privacidad clases inscritas |
| Datos transferencia | `profile/payment-info` | ✅ banco, tipo cuenta, número, RUT, titular, email; upsert |
| Planes | `plans/index` | ✅ cards Básico/Pro, mensual/anual, expo-web-browser, Bearer token auth |
| Resultado pago éxito | `plans/success` | ✅ plan activo detectado; deep link danceclass://plans/success |
| Resultado pago fallo | `plans/failure` | ✅ botón reintentar; deep link danceclass://plans/failure |

#### Pantallas implementadas — sesión 2026-05-18 (sesión 4 — flujo transaccional)

| Pantalla | Ruta mobile | Estado |
| --- | --- | --- |
| Mis clases completo | `(tabs)/my-classes` | ✅ reescrito: tabs tomo/dicto, confirmación/rechazo pagos, deudores, fecha eliminación coral-fuego |
| Pago con 2x | `payment/[enrollmentId]` | ✅ is_2x, price_2x, payment_assignee, transferir turno (Bearer token al API web) |
| Planes | `plans/index` | ✅ nuevo: cards Básico/Pro, mensual/anual, expo-web-browser checkout |
| Éxito pago | `plans/success` | ✅ nuevo: deep link, refresca suscripción |
| Fallo pago | `plans/failure` | ✅ nuevo: deep link, reintentar |

#### Cambios en web (sesión 4)

- **`api/mercadopago/create-preference/route.ts`**: acepta `Authorization: Bearer <token>` para auth mobile (fallback a cookie)
- **`api/mercadopago/create-subscription/route.ts`**: ídem
- **`api/class-2x/transfer-payment/route.ts`**: ídem

#### Notas de implementación sesión 4

- **Bearer token auth en web API**: las rutas de MP y 2x ahora detectan `Authorization: Bearer` primero; si está presente, crean un `@supabase/supabase-js` client con el token en `global.headers`. Esto permite que mobile use las mismas API routes sin modificar la infraestructura de cookies del servidor web.
- **`my-classes` enseñanza**: query incluye `enrollments(*, student:profiles!student_id(...), payment:payments(*))` para acceder a datos del alumno y su comprobante en un solo fetch.
- **`plans/index` → `_layout.tsx`**: registrado como `plans/index` (no `plans`) porque Expo Router trata las carpetas con `index.tsx` distinto a las screens directas.
- **Deep linking**: `scheme: "danceclass"` ya estaba en `app.json`; las rutas `plans/success` y `plans/failure` son accesibles vía `danceclass://plans/success` y `danceclass://plans/failure`. Para que MP redirija de vuelta a la app, las web pages de success/failure deben agregar un link/botón con ese scheme (trabajo futuro).

#### Nuevos componentes mobile (sesión 3)

| Componente | Descripción |
| --- | --- |
| `components/ui/MobileSelect.tsx` | Selector Modal-based: muestra valor actual + abre lista con FlatList; soporte nullable |
| `components/ui/MobileDateInput.tsx` | TextInput con auto-formato DD/MM/AAAA; almacena YYYY-MM-DD |
| `components/ui/MobileMonthCalendar.tsx` | Calendario mensual con navegación mes/año; toggle de fechas; prop `disablePast` |
| `components/ui/MobileCityPicker.tsx` | TextInput con dropdown de CHILEAN_CITIES filtradas; acepta texto libre |

#### Nuevos componentes mobile (sesión 2)

| Componente | Descripción |
| --- | --- |
| `components/feed/MobilePostCard.tsx` | Post card con video expo-video (ratio nativo, thumbnail + botón play), badge de visibilidad, navega al perfil del autor |
| `components/feed/MobileClassCard.tsx` | Ya existía — carrusel de medios, schedule, cupos, precio, CTA "Ver clase" |

#### Notas de implementación sesión 3

- **`class/[id].tsx` → `class/[id]/index.tsx`**: renombrado para permitir anidación con `edit.tsx`; import de supabase actualizado a `'../../../../lib/supabase'`
- **`_layout.tsx` (app)**: actualizado con Stack.Screen para todos los nuevos routes (create, create-post, `[id]/edit`, profile/edit, profile/payment-info)
- **Media upload en mobile**: `fetch(uri)` → `blob` → `supabase.storage.upload(blob)` — no se puede usar `File` en RN; se usa `Blob` directamente
- **Cloudinary desde RN**: `FormData` con `{ uri, type, name }` en el campo `file`; funciona igual que en web con fetch
- **Expo Router stack name**: para `[id]/index.tsx` se registra como `class/[id]/index` en el Stack (no `class/[id]`)
- **MobileSelect**: abre un `Modal` con `presentationStyle="pageSheet"` y `FlatList`; opción `nullable` agrega "Sin especificar"
- **StylesPicker en perfil**: chips toggleables inline sin Modal; usa todos los estilos de `DANCE_STYLES`

#### Notas de implementación sesión 2

- **expo-video ~2.0.0** instalado con `--legacy-peer-deps` (conflicto de pares en expo 54)
- **trust_endorsements**: tabla no tipada en el cliente Supabase → castear con `(supabase as any).from('trust_endorsements')`
- **Posts visibility filter en teacher profile**: calculado client-side según si el viewer es amigo, seguidor, o ninguno
- **Notifications profileMap**: se hace un segundo fetch de perfiles para mostrar nombres/avatares en notificaciones sociales
- **Lucide `fill` prop**: no soportado en lucide-react-native — usar solo `stroke`; para el ícono de Play sin relleno es aceptable

#### Consideraciones técnicas mobile

- **`(supabase as any).from(...)`** para joins anidados o tablas sin tipo en el cliente
- **`expo-clipboard`**: `Clipboard.setStringAsync(value)` — `import * as Clipboard from 'expo-clipboard'`
- **`expo-web-browser`**: `WebBrowser.openBrowserAsync(url)` para checkout MP
- **`expo-video`**: `useVideoPlayer(url, cb)` + `<VideoView player={...} contentFit="contain" />` — no forzar aspectRatio para respetar el ratio nativo
- **NativeWind + SafeAreaView**: usar `edges={['top']}` en pantallas con TopBar para evitar doble padding
- **Env vars**: `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` en `apps/mobile/.env.local`
- **Lucide íconos**: usar prop `stroke` (no `color`) — ver `types/lucide.d.ts`

#### Cómo correr en WSL2

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd apps/mobile
export NGROK_AUTHTOKEN=<token>
npx expo start --tunnel
```

Escanear QR desde Expo Go → "Scan QR Code".

### Funcionalidades futuras (no prioritarias para MVP)
- Notificaciones push Expo
- Sistema 2x en mobile
- Descuentos de último minuto en mobile
- OCR de comprobantes
- Dashboard de analytics
- Renovación anual automática
