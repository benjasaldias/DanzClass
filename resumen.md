# DanzClass — Resumen del proyecto y pasos siguientes

Este documento es un briefing para continuar el desarrollo en una nueva sesión de Claude.

---

## Contexto del problema

DanzClass es una plataforma web + móvil para conectar profesores y estudiantes de baile en Chile. El mercado actual es completamente informal: los profesores usan Instagram Stories y WhatsApp para publicar sus clases, los pagos se hacen por transferencia bancaria enviando captura de pantalla al profesor, y hay problemas de sobrecupo y descuentos de último minuto sin alcance.

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

### ✅ Términos de Uso (`/terms`) y Política de Privacidad (`/privacy`)

- `/terms` — 11 cláusulas en español; cláusula 2: usuario declara ser titular de derechos sobre contenido subido; DanzClass como plataforma intermediaria (safe harbor)
- `/privacy` — Política de Privacidad completa en español: datos recopilados, servicios terceros (Supabase, Cloudinary, Mercado Pago, Vercel), retención/eliminación, privacidad de publicaciones, derechos ARCO, mayores de 14 años, contacto
- Ambas páginas son **públicas** (sin login requerido) — agregadas a `PUBLIC_ROUTES` en middleware
- **Registro** (web y mobile): checkbox obligatorio enlaza a `/terms` **y** `/privacy`; no se puede crear cuenta sin aceptarlos
- App Store y Google Play exigen URL de Política de Privacidad durante el submit — usar `https://dc-project-web.vercel.app/privacy`

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

---

## Conversión mobile completada (sesión de cierre)

### Pantallas implementadas en `apps/mobile/`

| Pantalla | Ruta | Estado |
| --- | --- | --- |
| Feed | `(tabs)/feed.tsx` | ✅ Completo — clases + posts, filtros siguiendo/global/cerca, refresh |
| Explorar | `(tabs)/explore.tsx` | ✅ Completo — búsqueda clases y usuarios, filtros amigos/siguiendo |
| Publicar | `(tabs)/publish.tsx` | ✅ Completo — elección clase/video; video sube a Cloudinary o Storage |
| Perfil propio | `(tabs)/profile.tsx` | ✅ Completo — stats, plan, estilos, clases/posts paginados, logout |
| Crear clase | `class/create.tsx` | ✅ Completo — suelta/periódica/entrenamiento, media, notifica seguidores |
| Detalle clase | `class/[id]/index.tsx` | ✅ Completo — carrusel, inscripción, pago comprobante |
| Mis clases | `my-classes.tsx` | ✅ Completo — tabs tomo/dicto, deudores, paginación por clase |
| Perfil ajeno | `teacher/[username].tsx` | ✅ Completo — follow, amistad, trust, posts filtrados por visibilidad |
| Notificaciones | `notifications.tsx` | ✅ Completo — todos los tipos excepto audición |
| Planes | `plans.tsx` | ✅ Completo — básico/pro, checkout via expo-web-browser |
| Pago | `payment/[id].tsx` | ✅ Completo — comprobante, detecta 2x, turno transferir |
| Editar perfil | `profile/edit.tsx` | ✅ Completo — avatar, estilos, ciudad, instagram, privacidad |
| Datos transferencia | `profile/payment-info.tsx` | ✅ Completo — formulario banco/cuenta/RUT |
| Login | `(auth)/login.tsx` | ✅ Completo |
| Registro | `(auth)/register.tsx` | ✅ Completo — con aceptación de términos |

### Componentes UI creados

| Componente | Descripción |
| --- | --- |
| `components/ui/MobileSelect.tsx` | Dropdown con modal pageSheet y FlatList; soporte nullable |
| `components/ui/TopBar.tsx` | Barra superior con badge de notificaciones |
| `components/feed/MobileClassCard.tsx` | Card de clase con carrusel de media y navegación |
| `components/feed/MobilePostCard.tsx` | Card de video/post con expo-video inline |

### Decisiones técnicas sesión de cierre

**TypeScript 0 errores:**

- `skipLibCheck: true` en `apps/mobile/tsconfig.json`
- `apps/mobile/types/react-component-compat.d.ts`: augmenta `NativeMethods`, `ScrollResponderMixin`, `TimerMixin`, `Modal`, `FlatListComponent`, `KeyboardAvoidingView` (react-native) y `VideoView` (expo-video) con `props/context/state/setState/forceUpdate/render` para resolver incompatibilidad React 19 + React Native 0.81

**Paginación en perfiles:**

- Primeras 5 clases/posts visibles con botón "Ver todas (N)" para cargar el resto
- Evita listas interminables en ScrollView sin virtualización

**Empty states:**

- `teacher/[username].tsx`: "No hay clases publicadas" / "No hay publicaciones" cuando listas vacías

**Error handling:**

- `feed.tsx` (init + loadFeed), `explore.tsx` (load), `profile.tsx` (load), `teacher/[username].tsx` (load): try/catch en todas las funciones async de carga
- `class/create.tsx`, `profile/edit.tsx`: try/catch en loops de upload de archivos con `fetch()`

### Iconografía mobile — lucide-react-native (sesión 2026-05-19)

Todos los emojis UI reemplazados por íconos vectoriales de `lucide-react-native@1.16.0`:

| Antes | Pantalla | Ícono Lucide |
| --- | --- | --- |
| 🎓 | create.tsx (gate sin plan) | `GraduationCap` 32px gris-humo |
| 📅 | create.tsx (card clase suelta) | `CalendarDays` 28px brand-600 |
| 🔄 | create.tsx (card periódica) | `Repeat` 28px morado-flow |
| 🏋️ | create.tsx (card entrenamiento) | `Dumbbell` 28px gris-humo |
| 🎬🎬 | create.tsx (card video activo/off) | `Film` 28px brand-600 / gris-humo |
| 💃 | feed.tsx (empty state) | `Music2` 32px gris-humo |
| 📚 | my-classes.tsx (empty enrolled) | `BookOpen` 32px gris-humo |
| 🎓 | my-classes.tsx (empty teaching) | `GraduationCap` 32px gris-humo |
| 💃 | login.tsx / register.tsx (logo header) | `Music2` 28px brand-600 |
| ✅ | payment (comprobante enviado) | `CheckCircle2` 56px green-600 |
| ✓ | payment (review inline) | `Check` 16px blue-700 |
| 📎 | payment (subir comprobante) | `Paperclip` 32px gris-humo |
| 💃 | class/[id] (sin media) | `Music2` 40px gris-humo |
| ⚠️ 🏷️ | notifications labels | Eliminados de strings (íconos de fila ya los cubren) |

**Wrapper `components/ui/Icon.tsx`:** centraliza defaults (size=20, secondary=gris-humo, active=brand-600). Props: `icon`, `size`, `variant`, `stroke`.

**BottomNav:** `tabBarInactiveTintColor` corregido de `#9ca3af` → `#6B6880` (gris-humo). Activo sigue en `#c026d3` (brand-600).

**`class_discount` notif:** ícono cambiado de `Bell` → `Tag` (más semántico para descuento).

**Tipo `NotifConfig`:** `icon: typeof Bell` → `icon: LucideIcon` (más genérico, no acoplado a un ícono específico).

### Limitaciones conocidas (post-MVP)

- **Notificaciones push**: Expo Notifications pendiente
- **Paginación real**: el feed carga con `.limit(20)` pero no hay scroll infinito con cursor
- **Sin build de producción local**: Node.js v12 en WSL2 impide correr `eas build` localmente; build debe realizarse desde máquina con Node ≥ 18

---

## Sesión 2026-05-20 — Sistema 2x, descuentos y audiciones en mobile

### ✅ Bearer auth en rutas web adicionales

- `apps/web/src/app/api/class/discount/route.ts` — añadido soporte Bearer token (igual al patrón de transfer-payment/create-preference)
- `apps/web/src/app/api/class-2x/match/route.ts` — ídem

### ✅ Sistema 2x en mobile — `class/[id]/index.tsx`

- Fetch de `friendships` + `class_2x_requests` de amigos en el `useEffect` inicial
- Sección colapsable "X amig@s buscan compañer@ 2x" (solo para no-profesores, cuando hay solicitudes activas)
- TwoxRequestButton inline en la sección de precio: estados `idle` → `Busco 2x`, `looking` → `Cancelar búsqueda`, `matched` → botones "Ir a pagar" / "Que pague mi compañer@"
- Llama a `/api/class-2x/transfer-payment` y `/api/class-2x/match` con `Bearer ${token}`
- Race condition: error inline cuando el 2x ya fue tomado por otra persona

### ✅ Descuentos espontáneos en mobile — `class/[id]/index.tsx`

- Botón "Descuento" en el header (teacher only), color coral-fuego
- `DiscountModal` inline en el archivo: campos precio suelta con descuento + precio mensual con descuento (solo para periódica/entrenamiento)
- Valida que el precio con descuento sea menor al original
- Llama a `WEB_URL/api/class/discount` con `Bearer ${token}`
- Al guardar, actualiza `discountData` local (price y banner sin recarga de página)
- El banner "¡Descuento activo!" se muestra reactivamente al confirmar

### ✅ Audiciones en mobile

**Botón "Postularme" en class detail:**
- Visible para alumnos en clases entrenamiento con `requires_audition=true` y `audition_closed=false`
- `AuditionModal` inline: nombre completo (required), edad/teléfono opcionales, video (expo-image-picker → Storage privado `audition-videos`)
- Subida de video como Blob a Supabase Storage; guarda el path (no URL pública)
- Notifica al profesor (`new_audition`) tras enviar
- Muestra estado post-submit: "Postulación enviada" con badge aceptada/rechazada

**Botón "Postulaciones" en header (teacher only):**
- Visible para teacher en clases entrenamiento con `requires_audition=true`
- Navega a nueva pantalla `/(app)/class/[id]/auditions`

**Nueva pantalla `class/[id]/auditions.tsx`:**
- Carga todas las postulaciones de la clase con datos del postulante
- Secciones Pendientes / Publicadas
- Decisiones locales en borrador (Aceptar/Rechazar/Deshacer sin escritura inmediata a DB)
- Botón sticky "Publicar resultados (N postulaciones)" — batch write + notificaciones `audition_accepted`/`audition_rejected`
- Botón "Cerrar postulaciones" (Alert de confirmación → `audition_closed = true`)
- "Ver video" — genera URL firmada de Supabase Storage (válida 1h) y abre con `Linking.openURL`

**Layout update:**
- `_layout.tsx`: registrado `class/[id]/auditions` como `presentation: 'card'`
- `_layout.tsx`: migrado a `useTheme()` de `ThemeContext` (en vez de `useColorScheme` directamente)

### ✅ Dark mode fix — stats en perfil ajeno mobile

- `teacher/[username].tsx` líneas 225 y 233: añadido `dark:text-dark-text` a los contadores de clases y "confían" (antes aparecían negros sobre fondo oscuro)

### ✅ Protección contra cuentas sin confirmar

**2.1 — Eliminación automática + advertencia al registrarse**

- Nueva migración `018_is_confirmed_profiles.sql`: columna `is_confirmed BOOLEAN DEFAULT false NOT NULL` en `profiles`; trigger `on_auth_user_email_confirmed` en `auth.users` que lo pone en `true` cuando se confirma el email; backfill de usuarios ya confirmados
- Nueva ruta cron `apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts`: lista todos los usuarios auth, elimina los que tienen `email_confirmed_at IS NULL` y `created_at < now - 1 día`; paginado en bloques de 1000
- `apps/web/vercel.json`: añadido cron `0 4 * * *` para `/api/cron/cleanup-unconfirmed`
- `apps/web/src/app/auth/register/page.tsx`: pantalla de éxito muestra banner ámbar "⚠️ Tienes 1 día para confirmar tu correo. Si no lo haces, tu cuenta será eliminada automáticamente."
- `apps/mobile/app/(auth)/register.tsx`: en vez de redirigir al feed inmediatamente, muestra pantalla de éxito con MailCheck, mismo aviso ámbar, y botón "Ir a iniciar sesión" que navega a login

**2.2 — Filtrado de cuentas no confirmadas**

- `packages/shared/src/types/index.ts`: añadido `is_confirmed: boolean` a la interfaz `Profile`
- `apps/web/src/app/(app)/explore/page.tsx`: `.eq('is_confirmed' as any, true)` en la query de profiles
- `apps/web/src/app/(app)/teacher/[username]/page.tsx`: ídem — usuario no confirmado resulta en `notFound()`
- `apps/mobile/app/(app)/(tabs)/explore.tsx`: `.eq('is_confirmed' as any, true)` en la query de profiles
- `apps/mobile/app/(app)/teacher/[username].tsx`: ídem — usuario no confirmado resulta en pantalla "Usuario no encontrado"

---

## Bugfixes mobile post-build — sesión 2026-05-21

### ✅ Splash screen (app.json)

- Agregado plugin `expo-splash-screen` con `backgroundColor: "#c026d3"`, `image: "./assets/splash.png"`, `imageWidth: 200`, `resizeMode: "contain"`
- Requiere nuevo build EAS para tener efecto en Android

### ✅ Editar clase desde cualquier contexto

- `MobileClassCard`: cuando `teacher_id === currentUserId`, el botón de acción (antes oculto) ahora muestra "Editar" → navega a `/(app)/class/${id}/edit`
- Aplica en feed, mis clases y perfil propio

### ✅ Loop de navegación + compact view en perfil

- `MobileClassCard`: header del autor ya no navega cuando `teacher.id === currentUserId` (`activeOpacity: 1`, sin push)
- `MobilePostCard`: igual — header no navega si `author.id === currentUserId`
- Nueva prop `compact?: boolean` en `MobileClassCard`: layout horizontal con thumbnail 64px, título, estilo, horario y precio; botón "Editar" en el lado derecho
- `profile.tsx`: clases activas usan `compact={true}`, coincidiendo con el diseño web (sin header de autor)

### ✅ Perfil se refresca al volver de crear clase

- `profile.tsx`: reemplazado `useEffect(() => { load() }, [load])` por `useFocusEffect(load)` (importado de `expo-router`)
- Ahora cada vez que el tab de perfil recibe foco se re-ejecuta el fetch

### ✅ Dark mode botón anual en planes

- `plans/index.tsx`: botón "Anual" tiene `dark:border-brand-600 dark:bg-dark-surface2` en el borde/fondo, `dark:text-dark-text` en el título y `dark:text-dark-text2` en el subtítulo
- El ícono Wallet cambió su stroke de `#7c3aed` a `#7F77DD` (morado-flow) para mayor legibilidad en ambos modos

---

## Preparación deployment mobile — sesión 2026-05-19

### Archivos creados / modificados

| Archivo | Estado | Descripción |
|---|---|---|
| `apps/mobile/eas.json` | ✅ CREADO | Configuración EAS con perfiles development, preview, production |
| `apps/mobile/PRE_BUILD_CHECKLIST.md` | ✅ CREADO | Checklist completo pre-build |
| `apps/mobile/app.json` | ⏳ PENDIENTE CONFIRMACIÓN | Diff propuesto, no aplicado aún |
| `apps/web/src/app/privacy/page.tsx` | ⏳ PENDIENTE CONFIRMACIÓN | Draft redactado, no creado aún |

### app.json — cambios propuestos (pendiente confirmación del usuario)

```diff
+ "newArchEnabled": true
+ ios.buildNumber: "1"
+ android.versionCode: 1
+ ios.infoPlist.NSPhotoLibraryUsageDescription
+ ios.infoPlist.NSPhotoLibraryAddUsageDescription
+ android.permissions: [READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_EXTERNAL_STORAGE]
+ plugin "expo-video"
~ expo-image-picker photosPermission: texto actualizado
- plugin expo-document-picker (nunca se importa en ninguna pantalla)
~ extra.eas.projectId: sigue como placeholder hasta que el usuario corra eas init
```

### EAS build — comandos

```bash
# Instalar EAS CLI (una vez)
npm install -g eas-cli

# Autenticar y vincular proyecto
eas login
cd apps/mobile && eas init

# Build de development (Expo Dev Client)
eas build --profile development --platform android

# Build de preview interno (APK directo)
eas build --profile preview --platform android

# Build de producción (tiendas)
eas build --profile production --platform all
```

### Assets — ✅ CREADOS por el usuario (sesión 2026-05-21)

Los assets en `apps/mobile/assets/` son los archivos reales del logo oficial:

| Asset | Dimensiones reales | Uso |
|---|---|---|
| `icon.png` | 3870×3870 | Ícono principal de la app (App Store / Play Store) |
| `adaptive-icon.png` | 1024×1024 | Foreground del ícono adaptativo Android; también usado en web manifest PWA |
| `splash.png` | 1242×2436 | Splash screen mobile |
| `favicon.png` | 48×48 | Favicon web → copiado a `apps/web/src/app/icon.png` |

Los assets web fueron generados a partir de estos archivos:

- `apps/web/src/app/icon.png` ← copia de `favicon.png` (48×48) — Next.js lo sirve como favicon automáticamente
- `apps/web/public/icon-192.png` ← copia de `adaptive-icon.png` (1024×1024) — para el web manifest PWA
- `apps/web/public/icon-512.png` ← copia de `adaptive-icon.png` (1024×1024, purpose: maskable)

### Deep linking Mercado Pago — estado

- `scheme: "danceclass"` configurado en `app.json` ✅
- Pantallas `plans/success` y `plans/failure` funcionan ✅
- **Gap UX (no bloqueante):** la página web `/plans/success` no tiene botón "Volver a la app" con `danceclass://plans/success`. El usuario ve la web dentro del in-app browser y cierra manualmente.
- **Gap timing (no bloqueante):** el webhook de MP es asíncrono — si el usuario reconsulta el plan justo al cerrar el browser puede ver tier `'none'` por unos segundos.
- Para Supabase Auth en build nativo: agregar `danceclass://**` en Supabase → Authentication → Redirect URLs.

### ✅ Política de privacidad — CREADA (sesión 2026-05-21)

`apps/web/src/app/privacy/page.tsx` — 12 secciones, misma estructura visual que `/terms`:

- Datos recopilados: cuenta, actividad, pagos/datos bancarios, multimedia, técnicos
- Servicios terceros: Supabase, Cloudinary, Mercado Pago, Vercel (con links a sus propias políticas)
- Retención: cuentas sin confirmar eliminadas en 24h, media de clases vencidas eliminada por cron, cierre de cuenta borra datos
- Privacidad de publicaciones: público / seguidores / amigos
- Derechos ARCO según Ley 19.628 (Chile), respuesta en 30 días hábiles
- Mayores de 14 años
- Contacto: contacto@danzclass.com
- **URL para App Store / Google Play:** `https://dc-project-web.vercel.app/privacy` (copiar literal en el submit)

### Pendiente del lado del usuario

- [ ] Confirmar diff de `app.json` para que se aplique
- [x] ~~Confirmar draft de política de privacidad para crear el archivo~~ — creado en sesión 2026-05-21
- [ ] Crear cuenta en expo.dev (gratuita)
- [ ] Correr `eas init` desde `apps/mobile/` para obtener projectId real
- [ ] Configurar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` en Expo dashboard
- [ ] Proveer assets reales (icon.png, adaptive-icon.png, splash.png) — **ver nota de iconografía oficial más abajo**
- [ ] Agregar `danceclass://**` en Supabase redirect URLs
- [ ] Apple Developer Account ($99/año) — solo necesaria para builds iOS
- [ ] Google Play Developer Account ($25 único) — solo para submit a Play Store

### ✅ Iconografía oficial de DanzClass — ASSETS CREADOS (sesión 2026-05-21)

Los assets oficiales ya existen en `apps/mobile/assets/` (creados por el usuario):

- `icon.png` (3870×3870), `adaptive-icon.png` (1024×1024), `splash.png` (1242×2436), `favicon.png` (48×48)
- El favicon web (`apps/web/src/app/icon.png`) ya usa el logo real
- El web manifest PWA usa `adaptive-icon.png` como ícono

Pendiente de implementar (no urgente para MVP):

- [ ] Reemplazar el placeholder `Music2` (lucide) en headers de web y mobile por una imagen `<Image>` del logo real

---

## Sesión 2026-05-19 (bug fixes + rename)

### ✅ Bug fix: Plan básico no podía crear clase (403 Forbidden)

**Causa raíz:** migración `002_subscriptions_friends_2x.sql` reemplazó la política RLS `classes_insert_teacher` usando `get_user_tier(auth.uid()) IN ('teacher', 'pro')` — omitió `'basic'` aunque `canTeach()` lo incluye. Cualquier usuario básico recibía 403 al intentar INSERT en `classes`.

**Fix:**

- Nueva migración `017_fix_classes_rls_basic.sql`: policy recreada con `IN ('basic', 'teacher', 'pro')`
- **⚠️ Requiere aplicar la migración en Supabase → SQL Editor** antes de que el fix esté activo en producción

**Mejoras de UX en `CreateClassForm.tsx`:**

- El submit ahora intercepta `basicBlocked` y abre un modal explícito: "Ya publicaste tu clase de este mes. Podrás publicar la siguiente desde el 01/MM/YYYY" (calcula el primer día del próximo mes calendario)
- El error handler parsea `code === '42501'` y mensajes de RLS para mostrar mensajes contextual en lugar del genérico "Error al crear la clase"

### ✅ Bug fix: Modal de video se croppea y oculta botón Publicar

**Causa:** el contenedor blanco del modal (`CreatePostModal.tsx`) no tenía max-height ni scroll.

**Fix:** `max-h-[50vh]` en el `<video>` (era `60vh`) + `overflow-y-auto max-h-[90vh]` en el div blanco del modal. Solución elegida: límite de altura + scroll como fallback para videos muy verticales.

### ✅ Rename: DanceClass → DanzClass

Renombrado en 14 archivos (36 ocurrencias exactas de `DanceClass` mixed-case):

- **Web:** `apps/web/src/` — todos los componentes, páginas, API routes, layout, términos
- **Mobile:** `apps/mobile/` — pantallas auth, login, perfil, planes, clases, TopBar, CityPicker
- **app.json:** solo `expo.name` y `photosPermission` — `slug`, `bundleIdentifier`, `package` y `scheme` permanecen con `danceclass` por compatibilidad
- **Docs:** `resumen.md`, `CLAUDE.md`, `PRE_BUILD_CHECKLIST.md`
- **No tocado:** imports npm `@danceclass/shared` (lowercase, identificadores internos)

### ✅ Modo oscuro web — implementado (parcial, ~70% de la app)

**Infraestructura:**
- `tailwind.config.ts`: `darkMode: 'class'` + tokens nombrados: `dark-bg`, `dark-surface`, `dark-surface2`, `dark-border`, `dark-text`, `dark-text2`
- `next-themes` instalado como `ThemeProvider` en `src/components/ui/ThemeProvider.tsx`
- Root `layout.tsx`: `suppressHydrationWarning` + ThemeProvider envuelve toda la app
- `globals.css`: dark overrides globales para `.input`, `.card`, `.btn-secondary`, `.btn-ghost`, `body`

**Toggle:** `ThemeToggle.tsx` (sun/moon) — esquina superior derecha de `/profile`. Persiste en localStorage automáticamente vía next-themes. Al cargar: respeta preferencia guardada, fallback a `prefers-color-scheme`.

**Paleta dark mode:**

| Token | Hex | Uso |
|---|---|---|
| `dark-bg` | `#1A1035` | Fondo principal (noche-urbana) |
| `dark-surface` | `#241547` | Cards, contenedores (9 unidades sobre dark-bg) |
| `dark-surface2` | `#2E1B5C` | Superficies elevadas (modales, dropdowns) |
| `dark-border` | `#3D2870` | Bordes en superficies oscuras |
| `dark-text` | `#EEEDFE` | Texto primario (lavanda-suave) — contraste 16:1 ✅ WCAG AAA |
| `dark-text2` | `#A39BBF` | Texto secundario — contraste 6.7:1 ✅ WCAG AA |

**Componentes migrados:**
- Layout shell: `(app)/layout.tsx`, `TopBar.tsx`, `BottomNav.tsx`
- Feed: `FeedClient.tsx` (filtros), `ClassCard.tsx`, `PostCard.tsx`
- Perfil propio: `profile/page.tsx` completo (header, stats, subscription banner, estilos, clases, posts)
- Auth: `auth/login/page.tsx`

**Todos los componentes web migrados** ✅ — ver sesión 2026-05-19 (2).

---

## Sesión 2026-05-19 (2) — Dark mode completo + filtros explore

### ✅ T2: Dark mode web — COMPLETO

Todos los componentes web restantes migrados con tokens `dark:`:

| Componente | Archivo |
|---|---|
| AdminReportsClient | `components/admin/AdminReportsClient.tsx` |
| ClassDetailClient | `components/class/ClassDetailClient.tsx` |
| CreateClassForm | `components/class/CreateClassForm.tsx` |
| EditClassForm | `components/class/EditClassForm.tsx` |
| MyClassesClient | `components/class/MyClassesClient.tsx` |
| NotificationsClient | `components/notifications/NotificationsClient.tsx` |
| PaymentClient | `components/payment/PaymentClient.tsx` |
| PlansPage | `app/(app)/plans/page.tsx` |
| TeacherProfileClient | `components/profile/TeacherProfileClient.tsx` |
| EditProfileForm | `components/profile/EditProfileForm.tsx` |
| ExploreClient | `components/feed/ExploreClient.tsx` |
| auth/register | `app/auth/register/page.tsx` |

### ✅ T3: Dark mode mobile — COMPLETO

`ThemeContext` creado en `apps/mobile/context/ThemeContext.tsx` con:

- `useColorScheme` + `setColorScheme` de NativeWind
- Persistencia en `AsyncStorage` (clave `'app_theme'`)
- Toggle en `(tabs)/profile.tsx`

Pantallas migradas (todos los tokens `dark:bg-dark-*`, `dark:text-dark-*`, `dark:border-dark-border`):

| Pantalla | Archivo |
|---|---|
| Mis clases | `(tabs)/my-classes.tsx` |
| Crear (choice) | `(tabs)/create.tsx` |
| Notificaciones | `notifications.tsx` |
| Perfil ajeno | `teacher/[username].tsx` |
| Detalle clase | `class/[id]/index.tsx` |
| Editar perfil | `profile/edit.tsx` |
| Datos transferencia | `profile/payment-info.tsx` |
| Planes | `plans/index.tsx` |
| Pago | `payment/[enrollmentId].tsx` |
| Publicar video | `class/create-post.tsx` |
| Crear clase | `class/create.tsx` |
| Editar clase | `class/[id]/edit.tsx` |

### ✅ T4: Filtro por género en explore mobile

`(tabs)/explore.tsx` reescrito con:

- Panel de filtros colapsable (ícono `SlidersHorizontal` + badge de count)
- Chips de estilos de baile (`DANCE_STYLES` de `@danceclass/shared`) para filtrar clases y usuarios
- Estado activo en morado-flow (`#7F77DD`)

### ✅ T5: Eliminar tab "Profesores" de ExploreClient web

`components/feed/ExploreClient.tsx`: eliminado el tab "Profesores", solo quedan "Clases" y "Personas" con sus subfiltros respectivos.

### ✅ T6: Filtros colapsables en explorar (web + mobile)

**Web (`ExploreClient.tsx`):** panel expandible/colapsable con `SlidersHorizontal`, badge de count de filtros activos, estado activo en morado-flow.

**Mobile (`(tabs)/explore.tsx`):** mismo patrón; chips de estilos como filtro adicional.

### ✅ T1: Scripts de limpieza de datos de prueba

- `supabase/scripts/reset_test_data.sql` — DELETE en orden FK-safe, preserva cuentas de producción
- `supabase/scripts/clean_storage.mjs` — limpia buckets de Supabase Storage recursivamente

---

## Sesión 2026-05-22 (2) — Dark mode: visibilidad de texto e íconos

### ✅ Auditoría y corrección completa de visibilidad en dark mode

Se identificaron y corrigieron todos los casos donde texto, íconos o fondos eran invisibles o tenían bajo contraste en dark mode, tanto en web como en mobile.

#### Web — archivos corregidos

| Componente | Problemas corregidos |
|---|---|
| `ClassDetailClient.tsx` | `LEVEL_COLORS` sin variantes dark; texto de ubicación, cupos, tarjeta amigos 2x |
| `ClassCard.tsx` | `LEVEL_COLORS`; badge fallback; labels de precio |
| `NotificationsClient.tsx` | `NOTIF_CONFIG`: colores de íconos de notificación sin dark |
| `MyClassesClient.tsx` | `ENROLL_STATUS`, `PAYMENT_STATUS`, `PAYMENT_PILL` completos; textos de teacher, schedule, contadores, resumen mensual |
| `MonthCalendar.tsx` | Navegación, celdas, encabezados, días deshabilitados, resumen |
| `CityCombobox.tsx` | Dropdown, ítems, seleccionado, mensaje vacío, botón texto libre |
| `UserCard.tsx` | Estados de amistad accepted/pending_received/none sin dark |
| `PaymentClient.tsx` | Cards amarilla, ámbar, brand; dropzone; botón transferir |
| `TeacherProfileClient.tsx` | Stats (`paidSpotsCount`, `trustCount`); divisores; botón amistad accepted/pending_received; `price_suelta`; empty state |

#### Mobile — archivos corregidos

| Pantalla | Problemas corregidos |
| --- | --- |
| `(tabs)/feed.tsx` | `ChevronDown` con stroke hardcodeado |
| `notifications.tsx` | `ChevronLeft` con stroke hardcodeado |
| `class/[id]/index.tsx` | `ChevronLeft`; fondo amigos 2x (`style` inline → `className`); sección precio |
| `teacher/[username].tsx` | `ChevronLeft`; stats contadores |
| `class/[id]/edit.tsx` | `ChevronLeft` |
| `class/create-post.tsx` | `ChevronLeft` |
| `class/create.tsx` | `ChevronLeft` |
| `class/[id]/auditions.tsx` | `ChevronLeft` |
| `profile/edit.tsx` | `ChevronLeft` |
| `profile/payment-info.tsx` | `ChevronLeft` |
| `(tabs)/my-classes.tsx` | Sección deudores (`bg-red-50`); textos rojos sin dark; "Rechazar" button; cupos sin dark; `PAYMENT_PILL_COLORS` convertido de `style` inline a NativeWind class strings |
| `payment/[enrollmentId].tsx` | Cards amarilla (precio 2x faltante), ámbar (compañero paga), brand (monto), azul (comprobante enviado); tarjeta sin datos bancarios |
| `components/ui/MobileMonthCalendar.tsx` | `ChevronLeft`/`ChevronRight`; fondo y texto del calendario |

#### Patrones de error más frecuentes

1. **`PAYMENT_PILL_COLORS` con hex en `style` inline** — no responde a dark mode; convertido a NativeWind class strings aplicadas via `className`.
2. **Stroke hardcodeado `"#374151"` en íconos Lucide** — negro sobre fondo oscuro; requiere `stroke={isDark ? '#EEEDFE' : '#374151'}` con `useTheme()`.
3. **Objetos de color sin variantes dark** (`LEVEL_COLORS`, `ENROLL_STATUS`, etc.) — strings con solo clases light; se agrega `dark:*` a cada valor.
4. **Cards de alerta de colores** (amarillo/rojo/azul/verde) — faltaban dark en bg, border y texto simultáneamente.
5. **`style={{ backgroundColor: '#f5f3ff' }}`** — reemplazado por `className="bg-blanco-violeta dark:bg-dark-surface2"`.

#### Reglas agregadas a CLAUDE.md

Se documentaron 7 reglas obligatorias en la sección "Modo oscuro (mobile)" de CLAUDE.md con patrones concretos de código para cada caso, para evitar recurrencia en nuevas pantallas.

---

## Sesión 2026-05-22 — Compartir clase e Historial de pagos

### ✅ Compartir clase (web + mobile)

**Web — `ClassDetailClient.tsx`:**
- Botón "Compartir" en el header de la clase (junto a los demás botones del lado derecho)
- Copia `${window.location.origin}/class/${classId}` al portapapeles con `navigator.clipboard.writeText`
- Feedback visual: cambia a "¡Enlace copiado!" por 2 segundos con estilo verde, luego vuelve a "Compartir"
- Ícono `Share2` de lucide-react
- Visible para todos los usuarios (profesor, alumno, visitante)

**Web — acceso anónimo a `/class/[id]`:**
- `middleware.ts`: `/class/` agregada como prefijo público — las rutas bajo `/class/` no requieren login
- `class/[id]/page.tsx`: ya no redirige a login si no hay sesión; las queries user-específicas (enrollment, follow, audition, friends 2x) solo se ejecutan cuando hay `user`; `spots` siempre se consulta
- `ClassDetailClient.tsx`: `currentUser: User | null` (antes `User`); cuando es null: oculta botones de acción (Reservar, Editar, Descuento, 2x, Postularme, Reportar, Seguir, sección amigos 2x, enrollment banner); muestra CTA "Inicia sesión para reservar" (Link a `/auth/login`) en el sticky bottom; el botón Compartir sigue visible

**Mobile — `class/[id]/index.tsx`:**
- Botón `Share2` (gris-humo) en el header, visible para todos
- Toca → `Share.share({ message: "${cls.title} — ${WEB_URL}/class/${cls.id}", title: cls.title })`
- Native share sheet de iOS/Android se encarga del destino

### ✅ Historial de pagos (web + mobile)

**Web — `MyClassesClient.tsx`:**
- Nuevo tab "Historial" (tercer tab junto a "Clases que tomo" / "Clases que dicto")
- Tabs redimensionados a `text-xs` para caber los tres sin overflow
- `HistoryTab` componente nuevo:
  - **Vista alumno** ("Mis pagos"): cada enrollment con nombre de clase, badge de estilo, monto del pago o "Sin pago registrado", pill de estado (Confirmado/Rechazado/Pendiente/Sin pago), fecha
  - **Vista profesor** ("Pagos recibidos"): avatar + nombre del alumno, nombre de la clase, monto, pill de estado, fecha + resumen mensual agrupado por mes calendario con total confirmado
  - Si el usuario tiene ambos roles: muestra ambas secciones con subtítulos dentro del mismo tab
  - Si no hay datos: empty state con ícono `History`
  - Resumen mensual: ícono `Receipt`, card por mes con total y count de pagos confirmados
- **No requiere nuevas queries**: usa los mismos `enrollments` y `teachingClasses` ya cargados en `page.tsx`
- Lógica de estado de pago: `confirmed` (enrollmentStatus='confirmed') → verde; `rejected` (payment.status='rejected') → rojo; `pending` (payment_submitted o hay payment) → amarillo; `no_payment` → gris

**Mobile — `my-classes.tsx`:**
- Nuevo tab "Historial" (tercer tab); los dos anteriores usan texto abreviado: "Que tomo" / "Que dicto" para caber los tres
- `HistoryTab` con las mismas dos secciones (alumno + profesor) y el resumen mensual
- Pills de estado con colores inline (bg/text/border) para compatibilidad NativeWind
- Resumen mensual: fondo `bg-violet-50 dark:bg-dark-surface2`, texto verde para el total
- Query de enrollments actualizada para incluir `payment:payments(*)` al nivel del enrollment (además del `class:classes(...)`)
- Iconos `History` y `Receipt` de lucide-react-native

---

## Sesión 2026-05-21 — Rutas públicas legales, favicon y política de privacidad

### ✅ Rutas públicas (`/terms` y `/privacy`)

- `apps/web/src/middleware.ts`: `/terms` y `/privacy` agregadas a `PUBLIC_ROUTES` — accesibles sin login
- Ambas rutas son requeridas por App Store y Google Play para el submit de la app

### ✅ Política de Privacidad (`/privacy`) — CREADA

- `apps/web/src/app/privacy/page.tsx` — 12 secciones en español, misma estructura visual que `/terms`
- Cubre: datos recopilados, servicios terceros, retención/eliminación, privacidad de publicaciones, seguridad, menores de 14 años, derechos ARCO (Ley 19.628 Chile), cookies, contacto
- **Nota importante:** `/terms` (Términos de Servicio) y `/privacy` (Política de Privacidad) son documentos **distintos**. No son intercambiables. App Store y Google Play piden la URL de la Política de Privacidad — usar `https://dc-project-web.vercel.app/privacy`
- Registro (web) actualizado: el checkbox ahora enlaza a **ambas** páginas (`/terms` y `/privacy`)
- `/terms` actualizado: footer enlaza a `/privacy`

### ✅ Favicon web (logo oficial)

- `apps/web/src/app/icon.png` — copia de `apps/mobile/assets/favicon.png` (48×48, logo real del usuario)
- Next.js 14 App Router detecta `icon.png` en el app dir y lo sirve automáticamente como favicon; inyecta `<link rel="icon">` sin configuración adicional
- `apps/web/public/manifest.json` — creado (era referenciado en `layout.tsx` pero no existía); usa `adaptive-icon.png` (1024×1024) como ícono PWA
- `apps/web/public/icon-192.png` y `icon-512.png` — copias de `adaptive-icon.png` para el manifest

### ✅ Assets actualizados con nuevo logo oficial

Los siguientes archivos fueron reemplazados con los nuevos logos entregados por el usuario (disponibles también en la raíz del repo):

| Archivo | Fuente |
| --- | --- |
| `apps/mobile/assets/icon.png` | `icon.png` (raíz) |
| `apps/mobile/assets/adaptive-icon.png` | `adaptive-icon.png` (raíz) |
| `apps/mobile/assets/splash.png` | `splash.png` (raíz) |
| `apps/mobile/assets/favicon.png` | `favicon.png` (raíz) |
| `apps/web/src/app/icon.png` | `favicon.png` (raíz, 48×48) |
| `apps/web/public/icon-192.png` | `adaptive-icon.png` (raíz) |
| `apps/web/public/icon-512.png` | `adaptive-icon.png` (raíz) |

### ✅ LogoIcon — componente SVG del logo oficial integrado en la app

El usuario entregó `icon-no-bg.svg` (logotipo en formato SVG con fondo transparente, marca geométrica tipo "D" + texto "dc").

**Componentes creados:**

- `apps/web/src/components/ui/LogoIcon.tsx` — SVG inline como React component; usa `fill="currentColor"` para color via className; incluye rects + `<text>` con Sora Bold
- `apps/mobile/components/ui/LogoIcon.tsx` — mismo SVG usando `react-native-svg`; acepta props `size` y `color`; incluye rects + `<Text>` con Sora-Bold

**Carga de fuente Sora Bold:**

- **Web:** `next/font/google` — `Sora({ weight: ['700'], variable: '--font-sora' })` añadido en `apps/web/src/app/layout.tsx`; la variable CSS `--font-sora` se aplica al `<html>` y el SVG inline la hereda
- **Mobile:** `apps/mobile/assets/fonts/Sora-Bold.ttf` descargado de Google Fonts Statics (46KB); cargado en `apps/mobile/app/_layout.tsx` con `useFonts({ 'Sora-Bold': require('../assets/fonts/Sora-Bold.ttf') })`; el layout espera `fontsLoaded` antes de renderizar

**Criterio de reemplazo:**

- `Music2`/`Music` como **logo de marca** → reemplazado con LogoIcon
- `Music2` como **ícono semántico de baile/música** (empty states, notificaciones, filtros, feature cards) → conservado

**Archivos actualizados:**

| Archivo | Cambio |
| --- | --- |
| `apps/web/src/components/ui/TopBar.tsx` | `Music2` → `LogoIcon` (`text-brand-600 dark:text-brand-300`) |
| `apps/web/src/app/page.tsx` | `Music2` logo hero → `LogoIcon` (`text-white`, fondo translúcido) |
| `apps/web/src/app/auth/login/page.tsx` | `Music2` → `LogoIcon` (`text-white` en `bg-white/10`) |
| `apps/web/src/app/auth/register/page.tsx` | `Music2` → `LogoIcon` (mismo) |
| `apps/web/src/app/terms/page.tsx` | `Music2` → `LogoIcon` (`text-white` en `bg-brand-600`) |
| `apps/web/src/app/privacy/page.tsx` | `Music2` → `LogoIcon` (mismo) |
| `apps/mobile/components/ui/TopBar.tsx` | `Music` → `LogoIcon` (color `#c026d3`, size 22) |
| `apps/mobile/app/(auth)/login.tsx` | `Icon icon={Music2}` → `LogoIcon` (color `white`, size 32) |
| `apps/mobile/app/(auth)/register.tsx` | `Icon icon={Music2}` → `LogoIcon` (mismo) |

**Decisiones de color:**

- TopBar web: `text-brand-600` light / `text-brand-300` dark — consistente con el color previo del ícono
- TopBar mobile: `#c026d3` siempre (mismo que antes, visible sobre ambos fondos)
- Auth screens (web y mobile): blanco — el contenedor ya tiene fondo `bg-white/10` translúcido sobre gradiente oscuro; blanco da mejor contraste que morado sobre morado
- Terms/Privacy header: `text-white` sobre `bg-brand-600` sólido

---

## Sesión 2026-05-23 — Recordatorios 24h antes + lista de espera

### ✅ Migración `020_reminders_and_waitlist.sql`

- Extiende constraint `notifications_type_check` con los nuevos tipos `class_reminder` y `waitlist_available` (incluye todos los tipos anteriores)
- Tabla `waitlist` (`id`, `class_id`, `user_id`, `created_at`, UNIQUE por par)
- RLS: `waitlist_select_teacher` (propio o profesor de la clase), `waitlist_insert_own`, `waitlist_delete_own`
- Tipo `NotificationType` en `packages/shared/src/types/index.ts` actualizado con los nuevos valores

### ✅ Recordatorios automáticos 24h antes — cron

**`apps/web/src/app/api/cron/cleanup-classes/route.ts`** — lógica añadida al mismo cron existente (03:00 UTC):

- Calcula `tomorrowStr` (YYYY-MM-DD)
- Agrupa 4 tipos de clases:
  1. **Sueltas** con `date = mañana`
  2. **Periódicas con `class_sessions`** explícitas para mañana
  3. **Custom** — fetch completo + filter en JS por `custom_dates.includes(tomorrowStr)`
  4. **Periódicas sin sesiones** — calcula diff de días desde `start_date` para weekly/biweekly/monthly
- Para cada alumno `confirmed` en cada clase → inserta `class_reminder` en `notifications`
- Evita duplicados: fetch de notificaciones `class_reminder` enviadas hoy + Set `userId:classId` antes de insertar
- Retorna `{ deleted, errors, reminders }` en la respuesta JSON

### ✅ API routes waitlist

| Ruta | Método | Descripción |
|---|---|---|
| `/api/class/waitlist/join` | POST | `{ classId }` → inserta en waitlist; 409 ignorado si ya está; Bearer o cookie |
| `/api/class/waitlist/leave` | DELETE | `{ classId }` → elimina de waitlist; Bearer o cookie |
| `/api/class/leave` | POST | `{ enrollmentId }` → cancela enrollment + notifica primer usuario en waitlist con `waitlist_available` |

**`/api/class/leave`** usa `createAdminClient` para bypasear RLS: necesita leer `waitlist` (donde solo el profesor o el propio usuario tiene SELECT) y enviar notificación cross-user.

### ✅ UI lista de espera — web

**`apps/web/src/app/(app)/class/[id]/page.tsx`:**
- Fetch de `waitlist` entry para el usuario actual → `isInWaitlist` boolean
- Pasado como prop a `ClassDetailClient`

**`apps/web/src/components/class/ClassDetailClient.tsx`:**
- Nueva prop `isInWaitlist?: boolean`
- Estados `isInWaitlist`, `waitlistLoading`
- Funciones `handleJoinWaitlist()` y `handleLeaveWaitlist()` — llaman `/api/class/waitlist/join` y `/api/class/waitlist/leave`
- `handleLeaveClass()` — ahora llama `/api/class/leave` (en vez de directo a Supabase) para que se notifique al primer waitlister
- **Bottom CTA cuando `isFull`:**
  - Usuario logueado + `!isInWaitlist`: botón "Avisarme si hay cupo" (borde gris, ícono `Bell`)
  - Usuario logueado + `isInWaitlist`: texto "Estás en la lista de espera" + botón "Salir de la lista"
  - Usuario no logueado + `isFull`: Link "Inicia sesión para reservar" (igual que antes)
  - Clase no llena: botón "Reservar cupo" normal (sin `isFull` deshabilitado)

**`apps/web/src/app/(app)/my-classes/page.tsx`:**
- Query de teaching classes incluye `waitlist(count)` para obtener el count en un solo fetch

**`apps/web/src/components/class/MyClassesClient.tsx`:**
- Badge "N en lista de espera" (ícono `Bell`, texto gris-humo) en la card de cada clase del tab Dicto
- Extrae `cls.waitlist[0]?.count ?? 0`

### ✅ Notificaciones — web y mobile

**Web (`NotificationsClient.tsx`):**
- `class_reminder`: ícono `CalendarClock`, color brand, texto "Mañana tienes X a las HH:MM", navega a `/class/:id`
- `waitlist_available`: ícono `UserCheck2`, color verde, texto "¡Se liberó un cupo en X! Tienes 24h para inscribirte.", navega a `/class/:id`

**Mobile (`notifications.tsx`):**
- Mismos dos casos con los mismos íconos y textos, rutas `/(app)/class/:id`

### ✅ UI lista de espera — mobile

**`apps/mobile/app/(app)/class/[id]/index.tsx`:**
- Estados `isInWaitlist`, `waitlistLoading`
- Fetch de waitlist entry en `useEffect` al cargar la pantalla
- `handleJoinWaitlist()` → `WEB_URL/api/class/waitlist/join` (Bearer)
- `handleLeaveWaitlist()` → `WEB_URL/api/class/waitlist/leave` (DELETE, Bearer)
- `handleLeave()` → ahora llama `WEB_URL/api/class/leave` (Bearer) en vez de Supabase directo
- **CTA cuando `isFull` y `!enrollment`:**
  - `isInWaitlist`: card brand con "Estás en la lista de espera" + botón "Salir de la lista"
  - `!isInWaitlist`: botón outline "Avisarme si hay cupo" con ícono `Bell`

**`apps/mobile/app/(app)/(tabs)/my-classes.tsx`:**
- Query teaching classes incluye `waitlist(count)`
- Badge "N en lista de espera" (ícono `Bell`, texto gris-humo) en la card de cada clase del tab Que dicto

### Puntos de atención

- **Deduplicación de recordatorios:** el cron evita duplicados buscando notificaciones `class_reminder` del mismo día, pero si el cron corre dos veces el mismo día (error → retry) podría insertar doble. La deduplicación por Set es suficiente para el MVP.
- **Primer en waitlist recibe notificación al salir una persona:** el ordenamiento es por `created_at ASC` — FIFO justo. Solo el primero recibe la notificación; los demás tendrán que esperar a la siguiente salida.
- **`waitlist(count)` en queries Supabase:** devuelve `[{ count: N }]` como array de un elemento; extraer con `cls.waitlist[0]?.count ?? 0`.
- **`/api/class/leave` requiere service role** (via `createAdminClient`) porque la política RLS de `waitlist` no permite que el alumno que se va consulte la lista de espera de otros.

---

## Sesión 2026-05-23 (2) — Bugfixes críticos: feed, cupos, inscripción

### ✅ Bug 1: Clases vencidas en feed

**Web — `apps/web/src/app/(app)/feed/page.tsx` y `apps/web/src/components/feed/FeedClient.tsx`:**
- Añadidos dos filtros `.or()` en la query de Supabase:
  1. `type.neq.suelta,date.gte.${today}` — oculta sueltas con fecha pasada
  2. `type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${today}` — oculta periódicas/entrenamientos con `ends_at` vencido
- Filtro client-side para clases `recurrence='custom'`: solo se muestran si alguna de sus `custom_dates` es >= today

**Mobile — `apps/mobile/app/(app)/(tabs)/feed.tsx`:**
- Mismos dos filtros `.or()` + función `filterCustom()` aplicada sobre los resultados

**Nota de datos:** clases ya vencidas que existan en DB seguirán apareciendo en `MyClassesClient` (tab "Que tomo") si el alumno tiene enrollment con `pending_payment` — esto es intencional para que pueda resolver el pago.

### ✅ Bug 1 (complementario): Banner de pagos pendientes en "Mis clases"

**Web — `apps/web/src/components/class/MyClassesClient.tsx`:**
- `EnrolledTab` recibe prop `onGoToHistory: () => void`
- Banner amarillo al inicio del tab "Clases que tomo" cuando hay enrollments con `pending_payment` o `payment_submitted`
- Texto: "Tienes X pago/s pendiente/s. Ver en Historial; debes resolverlo con tu profesor/a."
- "Ver en Historial" llama `onGoToHistory()` que cambia el tab a `'history'`

**Mobile — `apps/mobile/app/(app)/(tabs)/my-classes.tsx`:**
- `EnrolledTab` recibe prop `onGoToHistory: () => void`
- Banner amarillo equivalente con `AlertTriangle` de lucide-react-native
- Stroke: `isDark ? '#fbbf24' : '#ca8a04'` (dark mode correcto; requirió añadir `useTheme` al componente)
- "Ver en Historial" llama `onGoToHistory()` que cambia el tab a `'history'`

### ✅ Bug 2: Cupos inconsistentes entre feed y detalle

**Causa raíz:** `ClassCard.tsx` (web) filtraba `status === 'confirmed'` para calcular cupos tomados, mientras que la vista `class_spots` cuenta todos los enrollments `status != 'cancelled'` (pending_payment + payment_submitted + confirmed).

**Web — `apps/web/src/components/feed/ClassCard.tsx`:**
```ts
// Antes: status === 'confirmed'
const takenCount = (classData.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
```

**Mobile — `apps/mobile/components/feed/MobileClassCard.tsx`:**
- Antes mostraba `Cupos: ${classData.max_spots}` (total, sin descontar inscritos)
- Ahora calcula `taken = status !== 'cancelled'` y muestra `${available}/${max_spots} cupos` o `Sin cupos disponibles`

### ✅ Bug 3: Usuarios sin suscripción pueden inscribirse

**API — `apps/web/src/app/api/class/enroll/route.ts` (NUEVO):**
- Endpoint centralizado `POST /api/class/enroll` con `{ classId }`
- Soporta Bearer token (mobile) y cookie (web) para auth
- Llama `getActiveTier()` + `canEnroll(tier)` → 403 `subscription_required` si no tiene plan
- Verifica: clase activa, profesor no puede inscribirse en su propia clase, cupos disponibles (via `class_spots`)
- Detecta y notifica al profesor si el alumno tiene deudas previas con él

**Web — `apps/web/src/app/(app)/class/[id]/page.tsx`:**
- Obtiene `userTier` con `getActiveTier()` y lo pasa a `ClassDetailClient`

**Web — `apps/web/src/components/class/ClassDetailClient.tsx`:**
- Nueva prop `userTier?: SubscriptionTier` (default `'none'`)
- `canUserEnroll = canEnroll(userTier)` — controla la UI del CTA
- Cuando `!currentUser`: "Inicia sesión para reservar" (Link a `/auth/login`)
- Cuando `!canUserEnroll`: "Obtener plan para reservar" (Link a `/plans`)
- `handleEnroll()` ahora llama `POST /api/class/enroll` en vez de insertar directo en Supabase

**Mobile — `apps/mobile/app/(app)/class/[id]/index.tsx`:**
- `handleEnroll()` primero verifica `canEnroll(tier)` y muestra `Alert` con link a planes
- Si pasa el guard: llama `WEB_URL/api/class/enroll` con Bearer token
- Maneja: `subscription_required`, `already_enrolled`, `no_spots`, error genérico

### ✅ Bug 4: Re-inscripción bloqueada por UNIQUE constraint

**API — `apps/web/src/app/api/class/enroll/route.ts`:**
- Antes del INSERT, busca enrollments existentes para el par `(student_id, class_id, session_id IS NULL)`
- Si existe con `status !== 'cancelled'`: 409 `already_enrolled`
- Si existe con `status = 'cancelled'`: UPDATE a `pending_payment` (upsert) en vez de INSERT
- Si no existe: INSERT fresco con spots check previo
- Elimina el crash silencioso por violación de UNIQUE constraint

### Archivos modificados

| Archivo | Tipo | Cambio |
|---|---|---|
| `apps/web/src/app/(app)/feed/page.tsx` | Web | Filtros de clases vencidas |
| `apps/web/src/components/feed/FeedClient.tsx` | Web | Filtros de clases vencidas en `loadFeed()` |
| `apps/web/src/components/feed/ClassCard.tsx` | Web | Cupos: `!== 'cancelled'` en lugar de `=== 'confirmed'` |
| `apps/web/src/app/(app)/class/[id]/page.tsx` | Web | Fetch + pass de `userTier` |
| `apps/web/src/app/api/class/enroll/route.ts` | Web | NUEVO — endpoint centralizado con tier check + upsert |
| `apps/web/src/components/class/ClassDetailClient.tsx` | Web | `userTier` prop, `canUserEnroll`, `handleEnroll` vía API |
| `apps/web/src/components/class/MyClassesClient.tsx` | Web | Banner de pagos pendientes en `EnrolledTab` |
| `apps/mobile/app/(app)/(tabs)/feed.tsx` | Mobile | Filtros de clases vencidas |
| `apps/mobile/components/feed/MobileClassCard.tsx` | Mobile | Cupos: disponibles vs total |
| `apps/mobile/app/(app)/class/[id]/index.tsx` | Mobile | `handleEnroll` vía API con tier check |
| `apps/mobile/app/(app)/(tabs)/my-classes.tsx` | Mobile | Banner de pagos pendientes en `EnrolledTab` |

---

## Sesión 2026-05-24 — Agenda / Calendario personal (web + mobile)

### ✅ Función compartida `getClassSessions`

Implementada en ambas plataformas con la misma lógica:

**Web:** `apps/web/src/lib/utils.ts` — función `getClassSessions(classData, fromDate, toDate): string[]`
**Mobile:** `apps/mobile/lib/utils.ts` — mismo contrato + helpers `toYMD`, `formatTime`

Reglas de cálculo por tipo:
- **Suelta:** retorna `date` si cae en el rango
- **Custom:** filtra `custom_dates` por el rango
- **Weekly:** pasos de 7 días desde `start_date`, respeta `ends_at` / `ends_indefinitely`
- **Biweekly:** pasos de 14 días, misma lógica
- **Monthly:** mismo día del mes de `start_date`; si el mes no tiene ese día, usa el último válido
- **Límite de seguridad:** si `ends_indefinitely = true`, cap en `fromDate + 3 meses` para evitar loops infinitos
- **Zona horaria:** todas las fechas YYYY-MM-DD se parsean como `new Date(y, m-1, d)` (local midnight) para evitar el off-by-one de UTC

### ✅ Web — `/agenda`

**`apps/web/src/app/(app)/agenda/page.tsx`:**
- Fetch de enrollments confirmados con datos de clase + profesor
- Fetch de clases dictadas si `canTeach(tier)`
- Deduplica: si el usuario es profesor de una clase en la que también está inscrito, la muestra solo como "Tú dictas"

**`apps/web/src/components/agenda/AgendaClient.tsx`:**
- Vista **Mes / Semana** toggleable en el header
- **Vista Mes:** calendario mensual navegable (prev/next), grilla 7 columnas, semanas desde lunes, puntos de color por tipo de clase, día actual destacado con `bg-violet-100 ring-brand-600/40`, panel de eventos al hacer clic en un día
- **Vista Semana:** lista de 7 días (lun–dom), sección por día con badge "Hoy", eventos o "Sin clases"
- **Colores:** morado-flow `#7F77DD` para inscritas, brand-600 `#c026d3` para que dicta
- **Cards de evento:** barra lateral de color, badge de estilo, hora formateada, "@username del profesor" o "Tú dictas"
- **Leyenda** de colores en el header
- **Sección de disponibilidad personal** colapsable al final: chips de días (Lun–Dom) toggleables, estado local (sin persistencia aún)
- Dark mode completo con todos los tokens existentes

**`apps/web/src/components/ui/BottomNav.tsx`:**
- Ícono `CalendarDays` importado de lucide-react
- Tab "Agenda" agregado entre "Mis clases" y "Perfil" en ambos grupos (canTeach y estudiante)

### ✅ Mobile — tab Agenda

**`apps/mobile/lib/utils.ts`:** nuevo archivo con `getClassSessions`, `toYMD`, `formatTime`

**`apps/mobile/app/(app)/(tabs)/agenda.tsx`:**
- Vista semanal (lista lun–dom), apropiada para mobile
- Header con navegación semana anterior/siguiente (ChevronLeft/Right)
- Header de día destacado con badge "Hoy" cuando es el día actual
- Fetch de enrollments confirmados + clases dictadas en un solo `useEffect`
- Deduplica clases (teaching tiene precedencia sobre enrolled)
- Cards compactas con barra lateral de color, estilo, hora formateada, "@username" o "Tú dictas"
- Tap navega a `/(app)/class/${id}`
- Sección "Mis días disponibles" colapsable al final (estado local, sin persistencia)
- Dark mode completo
- Pull-to-refresh con `RefreshControl`

**`apps/mobile/app/(app)/(tabs)/_layout.tsx`:**
- **Decisión: Opción B** — tab "Publicar" (`create`) ocultado del BottomNav con `href: null`; la ruta `/(tabs)/create` sigue accesible por navegación directa desde otras pantallas
- Tab "Agenda" agregado con ícono `CalendarDays`
- Total: 5 tabs visibles (Inicio, Explorar, Mis clases, Agenda, Perfil)
- **Pendiente (post-MVP):** agregar FAB en el feed para acceder rápidamente a publicar clase/video sin el tab

### Pendientes (post-sesión 2026-05-24)

- [ ] **FAB mobile para publicar:** botón flotante en el feed (`(tabs)/feed.tsx`) que navega a `/(tabs)/create`, reemplazando la experiencia anterior del tab eliminado
- [x] **Disponibilidad en mobile:** ✅ implementado en sesión 2026-05-24 (3)
- [ ] **Filtrado de clases por disponibilidad:** usar `user_busy_blocks` para marcar o filtrar clases en Explorar que choquen con horarios ocupados del usuario (feature futura)

### Archivos creados / modificados

| Archivo | Tipo | Cambio |
|---|---|---|
| `apps/web/src/lib/utils.ts` | Web | `getClassSessions()` añadida |
| `apps/web/src/app/(app)/agenda/page.tsx` | Web | NUEVO — server component con fetch |
| `apps/web/src/components/agenda/AgendaClient.tsx` | Web | NUEVO — calendario mes/semana + disponibilidad |
| `apps/web/src/components/ui/BottomNav.tsx` | Web | Tab "Agenda" (CalendarDays) entre Mis clases y Perfil |
| `apps/mobile/lib/utils.ts` | Mobile | NUEVO — getClassSessions, toYMD, formatTime |
| `apps/mobile/app/(app)/(tabs)/agenda.tsx` | Mobile | NUEVO — vista semanal + disponibilidad |
| `apps/mobile/app/(app)/(tabs)/_layout.tsx` | Mobile | create → href:null; Agenda tab añadido |

---

## Sesión 2026-05-24 (2) — Navegación, descripción de posts y disponibilidad horaria

### ✅ 1. Navegación a detalle de clases propias

**`ClassCard.tsx` (web):**

- El propietario ahora ve "Ver clase" (→ `/class/[id]`) como CTA, igual que cualquier alumno
- El botón "Editar" ya existe dentro de `/class/[id]`, accesible para el profesor desde ahí
- Antes: el profesor veía "Editar" → `/class/[id]/edit` como única acción visible en el feed

**`MyClassesClient.tsx` (web) — TeachingTab:**

- El título de cada clase en el acordeón es un `<Link href="/class/[id]">` con `e.stopPropagation()` para no interferir con el toggle del acordeón
- Hover con color brand-600, indica que es clickeable

### ✅ 2. Descripción breve en posts tipo video

**Migración:** `021_post_description.sql` — `ALTER TABLE posts ADD COLUMN description TEXT`

**Web:**

- `CreatePostModal.tsx`: eliminado CityCombobox, reemplazado por `<textarea>` de descripción (opcional, max 280 chars, con contador)
- `PostCard.tsx`: interfaz actualizada (`city` → opcional, `description` → opcional), ciudad quitada del header, descripción muestra debajo del video
- `feed/page.tsx`: posts select ahora explícito con `description` incluida

**Mobile:**

- `create-post.tsx`: eliminado estado `city`/`userCity`, reemplazado por estado `description` con TextInput multiline (max 280)
- `MobilePostCard.tsx`: muestra `post.description` debajo del título cuando existe

**Retrocompatibilidad:** Posts existentes sin description quedan con NULL y no muestran nada — sin crash.

### ✅ 3. Disponibilidad horaria — modelo y UI base

**Migración:** `022_user_availability.sql`

- `profiles`: `sleep_start SMALLINT DEFAULT 0`, `sleep_end SMALLINT DEFAULT 8`
- `user_busy_blocks`: `(user_id, weekday 0=Lun..6=Dom, hour 0-23)`, UNIQUE(user_id, weekday, hour), RLS solo propio usuario

**Utilitarios compartidos:** `packages/shared/src/lib/availability.ts` (exportado desde `index.ts`)

- `isSleepHour(hour, start, end)` — maneja cruce de medianoche
- `isBlockOccupied(weekday, hour, blocks, start, end)` — combina sueño + marcados
- `getSleepHours(start, end)` — lista de horas en ventana de sueño
- `dateToWeekday(date)` — JS Date → 0=Lun..6=Dom

**UI:** `AgendaClient.tsx` — `AvailabilitySection` completamente rediseñada:

- Se carga lazy (Supabase fetch al primer `open`)
- Config de sueño: dos `<select>` de 0-23h + botón Guardar con feedback "¡Guardado!"
- Grid 7 columnas × 24 filas con celdas de 28×20px aproximado
- **Sueño (índigo):** bloques no clicables, mostrados automáticamente según config
- **Ocupado (coral/naranja):** bloques marcados por el usuario
- **Libre (gris claro):** hover verde para indicar que se puede marcar
- Auto-save por bloque (optimistic update → delete/insert en Supabase)
- Leyenda de colores, dark mode completo

### Cambios de archivos

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/feed/ClassCard.tsx` | "Ver clase" para propietario (antes "Editar") |
| `apps/web/src/components/class/MyClassesClient.tsx` | Título clase → Link en TeachingTab |
| `supabase/migrations/021_post_description.sql` | NUEVO — description en posts |
| `apps/web/src/components/feed/CreatePostModal.tsx` | City → description textarea |
| `apps/web/src/components/feed/PostCard.tsx` | Muestra description, oculta city |
| `apps/web/src/app/(app)/feed/page.tsx` | Select explícito con description |
| `apps/mobile/app/(app)/class/create-post.tsx` | City → description |
| `apps/mobile/components/feed/MobilePostCard.tsx` | Muestra description |
| `supabase/migrations/022_user_availability.sql` | NUEVO — user_busy_blocks + sleep cols |
| `packages/shared/src/lib/availability.ts` | NUEVO — utilitarios disponibilidad |
| `packages/shared/src/index.ts` | Exporta availability |
| `apps/web/src/components/agenda/AgendaClient.tsx` | AvailabilitySection → grid horario completo |

---

## Sesión 2026-05-24 (3) — Disponibilidad horaria en mobile

### ✅ Sección "Mis horarios ocupados" en mobile

Completado el pendiente de la sesión anterior: `apps/mobile/app/(app)/(tabs)/agenda.tsx` ahora tiene la misma funcionalidad de disponibilidad horaria que la web.

**Cambios en `agenda.tsx`:**

- Imports agregados: `Moon`, `Check` de lucide-react-native; `isSleepHour` de `@danceclass/shared`
- Estado nuevo: `busyBlocks (Set<string>)`, `sleepStart`, `sleepEnd`, `availLoading`, `availLoaded`, `savingSleep`, `sleepSaved`
- Eliminados: `DAYS_AVAIL`, estado `availability (Record<string, boolean>)` sin persistencia
- Función `loadAvailability()`: carga lazy (solo al primer open) de `profiles.sleep_start/sleep_end` + `user_busy_blocks` del usuario
- Función `handleAvailOpen()`: toggle open + dispara carga si aún no se ha cargado
- Función `toggleBlock(weekday, hour)`: optimistic update en Set + delete/insert en Supabase
- Función `saveSleep()`: guarda `sleep_start`/`sleep_end` en profiles; feedback visual "Guardado" 2 s

**UI:**

- Config de sueño: botones −/+ para ajustar hora de inicio y fin (wrappea 23 → 0 y viceversa); botón Guardar con estado de loading y feedback verde con check icon
- Leyenda de colores: índigo (sueño), coral (ocupado), gris (libre)
- Grid 7×24: `ScrollView horizontal` + `nestedScrollEnabled`; columna de etiquetas de hora (32px), 7 celdas de 34×22px con `borderRadius: 3`
- Colores: sueño `#c7d2fe`, ocupado `rgba(216,90,48,0.55)`, libre `#f3f4f6` / `#2E1B5C` dark
- Celdas de sueño: `disabled` (no se pueden tocar), `activeOpacity: 1`
- Dark mode completo usando `isDark` para colores de fondo de celdas libres

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `apps/mobile/app/(app)/(tabs)/agenda.tsx` | Disponibilidad horaria completa con persistencia |

---

## Sesión 2026-05-25 (4) — Fix agenda + Ensayos post-MVP + Playwright

### ✅ Bug crítico: agenda no mostraba clases

**Causa raíz:** `getClassSessions()` (web y mobile) retornaba vacío para clases periódicas porque `start_date` nunca fue guardado en la DB. `CreateClassForm` y `EditClassForm` solo guardaban `day_of_week`, pero `getClassSessions` requería `start_date` como ancla y hacía early return si era null.

**Fix en `apps/web/src/lib/utils.ts` y `apps/mobile/lib/utils.ts`:**
Cuando `start_date` es null pero `day_of_week` está disponible, se deriva un ancla virtual: se retrocede desde `fromDate` al día de la semana correcto. Para clases quincenal sin `start_date`, puede mostrar semanas distintas a las reales (la fase es desconocida), pero es mejor que no mostrar nada.

**Fix en `CreateClassForm.tsx` (web):**
Agrega cómputo de `start_date` = próxima ocurrencia de `day_of_week` desde hoy, y lo incluye en el `insert`. Así las nuevas clases siempre tienen `start_date`.

**Fix en `EditClassForm.tsx` (web):**
Backfill de `start_date` al editar clases periódicas que no lo tenían, sin sobreescribir si ya existía.

### ✅ Testing con Playwright

El proyecto usa Playwright para tests E2E. Los tests de producción están en `tests/e2e-production/`. Para correr:

```bash
npx playwright test --config=playwright.production.config.ts
```

**Regla:** al crear nuevas features, agregar tests Playwright en `tests/` o `tests/e2e-production/` según corresponda (tests de solo lectura/smoke en producción; tests con mutaciones solo en entorno de desarrollo).

**Fix en `smoke.features.spec.ts`:**
`getByText('Ocupado')` causaba strict mode violation (coincidía con "Mis horarios **ocupados**" y con el label "**Ocupado**" de la leyenda). Fix: `getByText('Ocupado', { exact: true })`.

### ✅ Ensayos post-MVP (completado en esta sesión)

Ver memoria [Sesión 2026-05-25b](../memory/project_session_2026-05-25b.md) para detalles de los 4 TODOs implementados: coordinación, edición, página de detalle `/rehearsal/[id]`, y mobile completo.

**Archivos modificados en esta sesión:**

| Archivo | Cambio |
| --- | --- |
| `apps/web/src/lib/utils.ts` | `getClassSessions` fallback a `day_of_week` cuando `start_date` es null |
| `apps/mobile/lib/utils.ts` | Mismo fix |
| `apps/web/src/components/class/CreateClassForm.tsx` | Computa y guarda `start_date` al crear clase periódica |
| `apps/web/src/components/class/EditClassForm.tsx` | Backfill de `start_date` al editar si no existía |
| `tests/e2e-production/smoke.features.spec.ts` | Fix strict mode violation en `getByText('Ocupado', { exact: true })` |

---

## Sesión 2026-05-26 — Fix agenda + ensayos navegables

### Contexto

Se reportaron dos bugs críticos:
1. La agenda no mostraba ningún compromiso (clases, ensayos)
2. Los ensayos eran inaccesibles — página detalle `/rehearsal/[id]` retornaba 404 para todos, incluyendo el creador; las notificaciones navegaban a `/feed`

### Causa raíz de los problemas

#### Agenda vacía
- **Enrollment filter muy restrictivo:** `.eq('status', 'confirmed')` excluía `pending_payment` y `payment_submitted`
- **Teaching classes status:** `.eq('status', 'active')` excluía clases marcadas `completed` por el cron
- **RLS bloqueando ensayos:** queries de `rehearsals` y `rehearsal_invites` usaban `createClient()` (user client) → `auth.uid()` nulo → RLS bloqueaba todo → array vacío
- **EventCard href hardcodeado:** ensayos apuntaban a `/feed` en vez de `/rehearsal/${id}`
- **Columna `start_date` nunca migrada a producción:** `001_initial_schema.sql` no la incluye; ninguna migración posterior la agregó → PGRST204 al crear/seleccionar clases → `getClassSessions` no podía computar fechas periódicas

#### Ensayos inaccesibles
- **Página `/rehearsal/[id]/page.tsx`:** usaba `createClient()` → RLS bloqueaba la lectura → `notFound()`
- **API GET `/api/rehearsal/[id]/route.ts`:** mismo problema
- **Notificaciones:** los 3 tipos de ensayo (`rehearsal_invite`, `rehearsal_accepted`, `rehearsal_rejected`) tenían `href: () => '/feed'` hardcodeado

#### "Confirmar asistencia" 404
- **`/api/rehearsal/respond/route.ts`:** usaba `createClient()` para leer `rehearsal_invites` antes de verificar ownership → RLS bloqueaba → 404

#### Tab Ensayos en Mis Clases vacío
- **`my-classes/page.tsx`:** queries de `ownRehearsals` y `rehearsalInvites` usaban `createClient()` → RLS bloqueaba → arrays vacíos

#### Formulario de ensayo
- **Fecha en formato MM/DD/AAAA:** `<input type="date">` dependía del locale del OS (Chrome en WSL muestra formato americano)
- **Ciudad como input genérico:** campo de texto plano en vez de `CityCombobox`

### Fixes aplicados

#### `apps/web/src/app/(app)/agenda/page.tsx`
- Enrollment filter: `.eq('status', 'confirmed')` → `.in('status', ['confirmed', 'pending_payment', 'payment_submitted'])`
- Teaching classes: `.in('status', ['active', 'completed'])`
- Queries de rehearsals y rehearsal_invites: cambiadas a `createAdminClient()` para bypass RLS
- Lógica de `invite_status`: `'creator'` | `'accepted'` | `'pending'` — rechazados excluidos

#### `apps/web/src/components/agenda/AgendaClient.tsx`
- EventCard href: `/feed` → `` `/rehearsal/${ev.rehearsalId}` ``
- `inviteStatus` prop: diferencia creador / aceptado / pendiente (borde dashed + badge amarillo para pendientes)

#### `apps/web/src/components/notifications/NotificationsClient.tsx`
- Los 3 tipos de notificación de ensayo: `href: (data) => data.rehearsal_id ? \`/rehearsal/${data.rehearsal_id}\` : '/feed'`

#### `apps/web/src/app/(app)/rehearsal/[id]/page.tsx`
- Cambiado a `createAdminClient()` + verificación manual `isCreator || hasInvite` → `notFound()` si no autorizado

#### `apps/web/src/app/api/rehearsal/[id]/route.ts`
- Cambiado a `createAdminClient()` + verificación manual de acceso

#### `apps/web/src/app/api/rehearsal/respond/route.ts`
- Invite fetch: `createClient()` → `createAdminClient()` + verificación manual `invite.user_id === user.id`
- Corrige el 404 en "Confirmar asistencia"

#### `apps/web/src/app/(app)/my-classes/page.tsx`
- Queries de `ownRehearsals` y `rehearsalInvites`: `createClient()` → `createAdminClient()`
- Corrige el tab Ensayos que aparecía vacío

#### `apps/web/src/components/class/MyClassesClient.tsx`
- Nuevo tab "Ensayos" en segunda fila (junto a "Historial")
- Secciones "Ensayos que organizo" e "Invitaciones" con `RehearsalCard`
- `RehearsalCard`: badge, fecha, count de invitados, link a `/rehearsal/[id]`

#### `apps/web/src/components/rehearsal/CreateRehearsalModal.tsx`
- Fecha: `<input type="date">` → `DateInput` (DD/MM/AAAA, almacena YYYY-MM-DD)
- Ciudad: `<input>` genérico → `CityCombobox` con autocomplete de ciudades chilenas

#### `apps/mobile/app/(app)/(tabs)/agenda.tsx`
- Enrollment filter: `.eq('status', 'confirmed')` → `.in('status', ['confirmed', 'pending_payment', 'payment_submitted'])`

#### `supabase/migrations/024_add_start_date_to_classes.sql` (NUEVA — **APLICAR EN PRODUCCIÓN**)
```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_date DATE;
```
Corrige el PGRST204 al crear clases y permite que `getClassSessions` compute fechas periódicas correctamente.

### Patrón técnico: RLS con admin client

El patrón correcto para datos con RLS restrictiva en rutas server-side:
1. Usar `createAdminClient()` (service role) para el fetch → bypasea RLS
2. Verificar manualmente la autorización del usuario (`creator_id === user.id`, `invite.user_id === user.id`, etc.)
3. Retornar 401/404 si no autorizado

Este patrón ya estaba en uso en otras partes del proyecto (`/api/class/leave`, `/api/rehearsal/respond`); esta sesión lo extendió a ensayos.

### Estado post-sesión (2026-05-26)

- Agenda muestra clases inscriptas (confirmed/pending_payment/payment_submitted) + dictadas (active/completed) + ensayos (creador/aceptado/pendiente)
- Ensayos son navegables desde la agenda y desde notificaciones
- Tab Ensayos en Mis Clases muestra datos correctamente
- "Confirmar asistencia" en ensayos funciona
- Formulario de ensayo usa DateInput y CityCombobox
- ⚠️ **Pendiente aplicar migración 024 en Supabase producción** para activar creación de clases y agenda de periódicas

---

## Sesión 2026-05-26 (bugs y mejoras)

### ✅ Fix dark mode — ícono "Clase" en PublishChoiceClient

`text-brand-600` = `#2D1B69` desaparece sobre `dark:bg-dark-surface2` = `#2E1B5C` (mismo nivel de oscuridad). Fix: añadido `dark:text-brand-300` al ícono `<Calendar>` en `PublishChoiceClient.tsx`. Regla general: todo `text-brand-600` dentro de contenedores con `dark:bg-dark-surface2` requiere `dark:text-brand-300`.

### ✅ Fix dark mode — AuditionModal

El modal de postulación a entrenamiento usaba `bg-white` sin variante dark, resultando en una tarjeta blanca sobre fondo oscuro. Corregido en `AuditionModal.tsx`:

- Contenedor: `bg-white dark:bg-dark-surface`
- Labels: `dark:text-dark-text2`
- Error box: `dark:bg-red-900/20 dark:border-red-800 dark:text-red-400`
- Dropzone: `dark:border-dark-border`, ícono `dark:text-dark-border`, textos `dark:text-dark-text2`
- Video preview: `dark:border-dark-border dark:bg-dark-surface2`

### ✅ Fix bug — Calendario de coordinación de ensayos mostraba "0 integrantes"

`/api/rehearsal/group-availability` usaba `createClient()` (cliente regular con RLS) para buscar el rehearsal, a diferencia de todos los demás routes de rehearsal que usan `createAdminClient()`. La inconsistencia causaba que el rehearsal no fuera encontrado en algunos casos → API retornaba error → componente mostraba estado vacío silenciosamente.

Fix en `group-availability/route.ts`:

- Movido `const admin = createAdminClient()` antes del fetch del rehearsal
- Cambiado `(supabase as any).from('rehearsals')` → `(admin as any).from('rehearsals')`
- Las invitaciones se obtienen antes que antes para poder hacer el access check manual
- Access check manual: `isCreatorAccess = rehearsal.creator_id === user.id` || `hasInvite = invites.some(i => i.user_id === user.id)` → 403 si ninguno

### ✅ Fix bug — Cerrar postulaciones perdía decisiones locales

`handleCloseAuditions()` cerraba directamente (`audition_closed = true`) sin persistir las decisiones en borrador de `localDecisions`. El postulante aceptado quedaba como "pending" en DB y el contador de confirmados mostraba 0.

Fix en `AuditionsListClient.tsx` (web) y `class/[id]/auditions.tsx` (mobile):

- `handleCloseAuditions()` ahora persiste primero cualquier decisión en borrador (lógica idéntica a `handlePublish`)
- Luego envía notificaciones a los postulantes afectados
- Luego cierra (`audition_closed = true`)

### ✅ Mejora — Reabrir postulaciones

Nueva función `handleReopenAuditions()` en web y mobile:

- Botón "Reabrir postulaciones" (color lavanda, `bg-[#EEEDFE]`) visible cuando `auditionClosed = true`
- Alterna con "Cerrar postulaciones" (ámbar) según estado actual
- Reabrir NO resetea postulaciones ya aceptadas/rechazadas en DB
- Reabrir NO reenvía notificaciones antiguas
- Solo los nuevos borradores generados después de reabrir recibirán notificaciones al cerrar nuevamente
- Banner actualizado: "Postulaciones cerradas — los resultados publicados fueron enviados a los postulantes. Puedes reabrir si necesitas recibir más postulaciones."

### Archivos modificados (sesión 2026-05-26)

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/publish/PublishChoiceClient.tsx` | `dark:text-brand-300` en ícono Calendar |
| `apps/web/src/components/class/AuditionModal.tsx` | Dark mode completo en modal, labels, dropzone, error box |
| `apps/web/src/app/api/rehearsal/group-availability/route.ts` | Admin client para rehearsal fetch + access check manual |
| `apps/web/src/components/class/AuditionsListClient.tsx` | `handleCloseAuditions` persiste borradores + `handleReopenAuditions` + botón toggle + banner actualizado |
| `apps/mobile/app/(app)/class/[id]/auditions.tsx` | Mismo fix handleCloseAuditions + handleReopenAuditions + botón toggle + banner |

### No hay migraciones nuevas en esta sesión

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/web/src/app/(app)/agenda/page.tsx` | Enrollment filter, teaching status, admin client para ensayos |
| `apps/web/src/components/agenda/AgendaClient.tsx` | Href ensayos, inviteStatus, badge pendiente |
| `apps/web/src/components/notifications/NotificationsClient.tsx` | Hrefs de 3 tipos de notificación de ensayo |
| `apps/web/src/app/(app)/rehearsal/[id]/page.tsx` | Admin client + manual auth check |
| `apps/web/src/app/api/rehearsal/[id]/route.ts` | Admin client + manual auth check |
| `apps/web/src/app/api/rehearsal/respond/route.ts` | Admin client + manual user_id check |
| `apps/web/src/app/(app)/my-classes/page.tsx` | Admin client para ownRehearsals y rehearsalInvites |
| `apps/web/src/components/class/MyClassesClient.tsx` | Tab Ensayos + RehearsalCard + RehearsalsTab |
| `apps/web/src/components/rehearsal/CreateRehearsalModal.tsx` | DateInput + CityCombobox |
| `apps/mobile/app/(app)/(tabs)/agenda.tsx` | Enrollment filter |
| `supabase/migrations/024_add_start_date_to_classes.sql` | NUEVA — start_date en classes |

---

## Sesión 2026-05-27 (entrenamiento, billing_day, agenda colors, tests)

### ✅ Task 1 — Flujo de inscripción en entrenamiento con audición

Al aceptar postulantes en un entrenamiento, el sistema ahora auto-crea inscripciones `pending_payment` para los alumnos aceptados. Los alumnos rechazados/no aceptados no ven "Reservar cupo".

**Cambios en `canEnrollDirectly`:**
- Web (`ClassDetailClient.tsx`): eliminado `|| classData.audition_closed` — ahora `!isEntrenamiento || !classData.requires_audition`
- Mobile (`class/[id]/index.tsx`): mismo cambio

**Nuevo API route:** `apps/web/src/app/api/class/auditions/enroll-accepted/route.ts`
- POST `{ classId, applicantIds }` — crea enrollments `pending_payment` por alumno aceptado (upsert si había cancelado, skip si ya existe enrollment activo)
- Usa `createAdminClient()` para bypasear RLS

**`AuditionsListClient.tsx` (web) y `auditions.tsx` (mobile):**
- `enrollAccepted(toPublish)` — llama al nuevo route tras publicar decisiones
- `handleCloseAuditions` también crea enrollments para postulantes previamente aceptados

**UI para alumno aceptado en entrenamiento:**
- `ClassDetailClient.tsx`: `EnrollmentBanner` siempre visible fuera del bloque `canEnrollDirectly`; texto "¡Fuiste aceptad@! Tu cupo está reservado — completa el pago para confirmarlo."
- Mobile: nuevo bloque CTA independiente visible cuando `isEntrenamiento && requires_audition && enrollment && status !== 'cancelled'`

### ✅ Task 2 — Campo `billing_day` en entrenamientos

Nuevo campo entero (1-27, default 1) en clases de tipo entrenamiento.

**Migración:** `supabase/migrations/025_billing_day.sql`
```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS billing_day SMALLINT DEFAULT 1
  CHECK (billing_day BETWEEN 1 AND 27);
```

**Web:**
- `CreateClassForm.tsx`: campo input numérico en sección entrenamiento; persiste al crear
- `EditClassForm.tsx`: campo input numérico con valor inicial `classData.billing_day ?? 1`; persiste al editar
- `ClassDetailClient.tsx`: badge "Cobro mensual el día N de cada mes" junto a otros badges de fecha
- `PaymentClient.tsx`: texto informativo bajo el título de la clase

**Mobile:**
- `class/create.tsx`: estado `billingDay`, input numérico en sección entrenamiento, persiste en insert
- `class/[id]/edit.tsx`: estado `billingDay`, cargado desde `data.billing_day`, persiste en update
- `class/[id]/index.tsx`: fila informativa con ícono Calendar bajo el horario

### ✅ Task 3 — Rediseño de colores de eventos en la agenda

Anteriormente: todos los eventos usaban variantes de `#7F77DD` (morado flow), y "dicto" usaba `brand-600` = `#2D1B69` invisible en dark mode.

**Nuevos colores:**
| Tipo de evento | Color | Clase Tailwind |
|---|---|---|
| Clase inscrita (alumno) | Sky 500 `#0ea5e9` | `bg-sky-500` |
| Clase que dicto (profesor) | Emerald 500 `#10b981` | `bg-emerald-500` |
| Ensayo aceptado | Violet 500 `#8b5cf6` | `bg-violet-500` |
| Ensayo pendiente | Slate 400 `#94a3b8` | `bg-slate-400` |

**Archivos modificados:**
- `apps/web/src/components/agenda/AgendaClient.tsx`: barras laterales, fondos de cards, badges de estilo, label "Tú dictas", puntos de leyenda, puntos de calendario
- `apps/mobile/app/(app)/(tabs)/agenda.tsx`: leyenda, fondos de cards, barra de color, badge "Ensayo", chips de estilo, label "Tú dictas"

### ✅ Task 4 — Tests Playwright

Nuevo archivo: `tests/e2e/auditions-billing-agenda.spec.ts`

Cubre 4 grupos de tests (todos robustos — saltan con `test.skip()` si no hay datos):
1. **Auditions** — navegación a la página, lista de postulantes visible, no-aceptado no ve "Reservar cupo"
2. **Billing day** — formulario create/edit muestra el campo, acepta valores 1-27, detalle lo muestra
3. **Agenda colores** — página carga sin error, leyenda con 3 puntos, card con clase sky usa clase sky, "Tú dictas" usa emerald
4. **Rehearsals** — tab Ensayos en my-classes, rehearsal events con violet, link a /rehearsal/[id]

### Archivos modificados (sesión 2026-05-27)

| Archivo | Cambio |
|---|---|
| `apps/web/src/app/api/class/auditions/enroll-accepted/route.ts` | NUEVO — crea enrollments pending_payment para aceptados |
| `apps/web/src/components/class/AuditionsListClient.tsx` | enrollAccepted() + llamadas en handlePublish y handleCloseAuditions |
| `apps/mobile/app/(app)/class/[id]/auditions.tsx` | Misma lógica con Bearer token |
| `apps/web/src/components/class/ClassDetailClient.tsx` | canEnrollDirectly sin audition_closed, mensaje aceptad@ actualizado |
| `apps/mobile/app/(app)/class/[id]/index.tsx` | canEnrollDirectly + bloque CTA para entrenamiento con audición + billing_day display |
| `supabase/migrations/025_billing_day.sql` | NUEVA — columna billing_day en classes |
| `apps/web/src/components/class/CreateClassForm.tsx` | billing_day: schema, default, submit, UI |
| `apps/web/src/components/class/EditClassForm.tsx` | billing_day: schema, default, submit, UI |
| `apps/web/src/components/class/ClassDetailClient.tsx` | billing_day badge |
| `apps/web/src/components/payment/PaymentClient.tsx` | billing_day texto informativo |
| `apps/mobile/app/(app)/class/create.tsx` | billing_day: estado, insert, UI |
| `apps/mobile/app/(app)/class/[id]/edit.tsx` | billing_day: estado, load, update, UI |
| `apps/web/src/components/agenda/AgendaClient.tsx` | Nuevos colores sky/emerald/violet/slate |
| `apps/mobile/app/(app)/(tabs)/agenda.tsx` | Mismos nuevos colores |
| `tests/e2e/auditions-billing-agenda.spec.ts` | NUEVO — tests E2E auditions, billing_day, agenda, rehearsals |

### ⚠️ Pendiente aplicar en Supabase producción

- Migración `025_billing_day.sql`

---

## Ruta de preview visual — `/design-system-preview` (ELIMINADA en sesión 2026-05-26)

> **Eliminada** en la sesión de seguridad alpha (S-1 de planning/02). La carpeta `apps/web/src/app/design-system-preview/`, `apps/web/src/lib/design-system-preview/` y el test `tests/e2e/design-system-preview.spec.ts` ya no existen. Si se necesita un nuevo showroom, montarlo behind `NEXT_PUBLIC_ENABLE_DESIGN_SYSTEM_PREVIEW` y solo en dev.

### Propósito

Ruta temporal de showroom visual para rediseño con Google Stitch (o similar). Muestra los principales componentes y pantallas de la app con **mock data quemada**, sin depender de Supabase, auth ni APIs reales.

### Archivos creados

| Archivo | Descripción |
|---|---|
| `apps/web/src/app/design-system-preview/page.tsx` | Página principal — showroom navegable |
| `apps/web/src/lib/design-system-preview/mockData.ts` | Datos ficticios para todos los componentes |
| `tests/e2e/design-system-preview.spec.ts` | Tests Playwright sin auth |

### Cambios en archivos existentes

- `apps/web/src/middleware.ts` — `/design-system-preview` agregada a `PUBLIC_ROUTES`

### Cómo usar

**Local:**

```bash
npm run dev:web   # desde apps/web o raíz del monorepo
# luego navegar a:
# http://localhost:3000/design-system-preview
```

**Staging/Producción (si se despliega):**

```
https://dc-project-web.vercel.app/design-system-preview
```

**Entregar a Stitch:** copiar la URL de staging/producción y pegarla en Google Stitch como URL de referencia.

### Qué muestra

La página es un scrollable con 8 secciones:

1. **Navegación** — TopBar + BottomNav en distintos estados
2. **Feed** — ClassCard (5 variantes: suelta, periódica, descuento, entrenamiento, sin cupos) + PostCard (público, seguidores, con menú ⋮ autor)
3. **Detalle de clase** — carrusel, badges, metadata, profesor, waitlist, CTA inscripción, banner aceptado
4. **Agenda** — vista semanal con los 4 tipos de evento (sky/emerald/violet/slate), grid de disponibilidad horaria
5. **Mis clases** — 4 tabs: que tomo, que dicto (acordeón), ensayos, historial (con resumen mensual)
6. **Perfil** — perfil propio y perfil ajeno con StarRating interactivo
7. **Notificaciones** — todos los tipos con íconos y colores
8. **Modales** — ConfirmDialog, ReportModal, AuditionModal, AuditionsListClient, DiscountModal, PaymentClient

Incluye un toggle **Light/Dark** en el header sticky que aplica clase `dark` al contenedor wrapper.

### Seguridad

- ⚠️ No usar para lógica productiva.
- Para desactivar antes de producción: eliminar la carpeta `apps/web/src/app/design-system-preview/` y quitar `/design-system-preview` de `PUBLIC_ROUTES` en `middleware.ts`.
- No tiene env var obligatoria, pero se puede agregar `NEXT_PUBLIC_ENABLE_DESIGN_SYSTEM_PREVIEW` como guard opcional si se desea mayor control.

### Tests

Tests en `tests/e2e/design-system-preview.spec.ts`. Cómo correr:

```bash
# Desde la raíz del monorepo (requiere dev server corriendo)
npx playwright test tests/e2e/design-system-preview.spec.ts
```

Los tests verifican: carga sin auth, no redirige a login, secciones visibles, toggle dark/light, tabs de Mis Clases funcionales, ConfirmDialog abre/cierra.

---

## Sesión 2026-05-26 — Seguridad, RLS y hardening pre-alpha

Trabajo guiado por `planning/02-auth-security-rls.md`. Cierra hallazgos S-1, S-2, S-3, S-4, S-5, S-8, S-9, S-11, S-12, S-13. S-6 ya cubierto por `@supabase/ssr ^0.4`. S-7 (auditoría matriz de policies) y S-10 (rate limiting Upstash) quedan como acción del usuario por requerir SQL en Supabase o cuenta externa.

### Migraciones agregadas (aplicar manualmente en producción)

| Archivo | Qué hace |
|---|---|
| `026_notifications_policy_admin_only.sql` | DROP `notifications_insert_any (WITH CHECK true)`. CREATE `notifications_insert_self (auth.uid()=user_id)`. |
| `027_admin_actions.sql` | Crea tabla `admin_actions` con RLS solo service role. |
| `028_lock_teacher_payment_info.sql` | Reemplaza `payment_info_select_all USING(true)` con SELECT solo a teacher dueño o alumnos con enrollment activo. |
| `029_private_payment_receipts.sql` | `UPDATE storage.buckets SET public=false WHERE id='payment-receipts'`. Nueva policy SELECT solo a uploader o teacher de la clase. |

⚠️ **Orden de despliegue importante**: hacer push del código primero (clientes reciben nuevo bundle con `sendNotifications`); aplicar 026 solo después de confirmar deploy. 028 y 029 pueden aplicarse antes (rompen el ataque, no la app, porque ya removimos la dependencia del join público y movimos receipts a signed URLs).

### Nuevos archivos / componentes

| Archivo | Descripción |
|---|---|
| `apps/web/src/lib/supabase/require-user.ts` | Helper `requireUser(request)` — auth Bearer (mobile) + cookie (web). Devuelve `{ user }` o `{ error: NextResponse(401) }`. |
| `apps/web/src/app/api/notifications/send/route.ts` | Insertador centralizado. Valida `SENDER_INITIATED_TYPES` + relación sender↔contenido por tipo. |
| `apps/web/src/lib/notifications.ts` | `sendNotifications(payload)` — fetch a `/api/notifications/send` para web (cookies). |
| `apps/mobile/lib/notifications.ts` | Ídem mobile, agrega Bearer token de Supabase session. |
| `apps/web/src/app/api/payment/receipt-url/route.ts` | `GET ?paymentId=X` → signed URL 1h después de validar que el caller es alumno del enrollment o teacher de la clase. Tolera `receipt_url` como path puro o URL legacy. |

### Cambios en código

- **`apps/web/src/middleware.ts`** — Allow-list explícita: `PUBLIC_ROUTES` (login/register/terms/privacy/) + regex `PUBLIC_CLASS_DETAIL = /^\/class\/[^/]+\/?$/`. Subrutas de `/class/[id]/` ya exigen sesión.
- **20+ call sites migrados** a `sendNotifications()`:
  - Web: `TeacherProfileClient`, `UserCard`, `CreateClassForm`, `EditClassForm`, `AuditionsListClient`, `AuditionModal`, `ClassDetailClient`, `MyClassesClient`.
  - Mobile: `teacher/[username]`, `class/create`, `class/[id]/edit`, `class/[id]/auditions`, `class/[id]/index`, `(tabs)/my-classes`.
- **`apps/web/src/app/api/admin/content-action/route.ts`** — Cada acción inserta en `admin_actions` (admin_id, action_type, target, report_id, reason). Acepta `reason` en el body.
- **`apps/web/src/app/(app)/class/[id]/page.tsx`** — Quitado join `payment_info:teacher_payment_info(*)`. Datos bancarios solo se cargan en pantalla de pago.
- **`apps/web/src/components/payment/PaymentClient.tsx` + `apps/mobile/app/(app)/payment/[enrollmentId].tsx`** — Suben al bucket privado y guardan **path** en `payments.receipt_url` (no `getPublicUrl`).
- **`apps/web/src/components/class/MyClassesClient.tsx`, `DashboardClient.tsx`, mobile `(tabs)/my-classes.tsx`** — Botón "Ver comprobante" llama a `/api/payment/receipt-url` y abre la signed URL devuelta.
- **`apps/web/src/app/api/cron/cleanup-classes/route.ts` + `cleanup-unconfirmed/route.ts`** — Devuelven 503 si `CRON_SECRET` no está configurado. Cron de cuentas no confirmadas amplió ventana 24h→36h y loguea cada delete.
- **`apps/web/next.config.js`** — `headers()` agrega `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`.

### Eliminado

- `apps/web/src/app/design-system-preview/` (carpeta)
- `apps/web/src/lib/design-system-preview/` (carpeta)
- `tests/e2e/design-system-preview.spec.ts`
- `'/design-system-preview'` de `PUBLIC_ROUTES` en middleware

### Validaciones aplicadas en `/api/notifications/send` por tipo

| Tipo | Validación |
|---|---|
| `follow` / `friend_request` / `friend_accepted` | `data.from_user_id === sender` |
| `new_class` / `class_updated` / `class_cancelled` / `audition_accepted` / `audition_rejected` / `payment_confirmed` / `payment_rejected` | `classes.teacher_id === sender` (único `data.class_id` por batch) |
| `new_audition` | Sender tiene fila en `auditions` para esa `class_id`; recipient es el `teacher_id` |
| Otros tipos sensibles (`2x_*`, `class_discount`, `debt_warning`, `new_report`, `class_reminder`, `waitlist_available`, `rehearsal_*`) | **No aceptados** desde clientes. Solo via service role en sus respectivos API routes/cron. |

Batches deben compartir un único tipo (devuelve 400 si no). Máximo 500 destinatarios por request.

### Acciones del usuario pendientes

1. Aplicar las migraciones 026, 027, 028, 029 en Supabase prod.
2. Verificar en Supabase Dashboard → Storage que `payment-receipts` aparece como **Private** tras 029.
3. Confirmar `CRON_SECRET`, `SUPERADMIN_USER_ID` configurados en Vercel (los crons ahora devuelven 503 sin secret).
4. Verificar que `https://dc-project-web.vercel.app/design-system-preview` retorna 404 tras el próximo deploy.
5. (Opcional, post-alpha) Configurar Upstash + rate limiting para `/api/reports`, `/api/notifications/send`, `/api/class-2x/match`.
6. (Recomendado) Correr en Supabase SQL: `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd` para auditar matriz completa de RLS (hallazgo S-7).

---

## Sesión 2026-05-27 (2) — Integridad de datos y casos límite (planning/04)

**Objetivo:** cerrar todos los ítems de `planning/04-data-integrity-and-edge-cases.md`.

### Cambios implementados

| ID | Descripción |
|---|---|
| D-3 | `getClassSessions` emite `console.warn` cuando usa ancla virtual para clase biweekly sin `start_date` (web + mobile) |
| D-4 | Migración `030_dedup_class_reminders.sql`: UNIQUE INDEX en `notifications(user_id, type, data->>'class_id', date Chile)` para `class_reminder`. Cron usa `ON CONFLICT DO NOTHING` implícito por el constraint. |
| D-5 | `/api/ratings/upsert`: valida que la clase ya ocurrió antes de permitir calificar. Sueltas: `class.date < today`. Periódicas: `enrollment.created_at <= now - 7 días`. |
| D-6 | Cron reminders: helper `chileNow()` con `Intl.DateTimeFormat('America/Santiago')` para calcular "mañana" en hora chilena (no UTC). |
| D-7 | Texto aclaratorio "Quincenal = cada 14 días desde la fecha de inicio" en formularios create/edit (web + mobile). |
| D-8 | Validación cliente de `custom_dates` con regex `^\d{4}-\d{2}-\d{2}$` en create/edit form (web + mobile). |
| D-9/D-10 | Queries de conteo de clases del profesor filtran `.in('status', ['active', 'completed'])` en `/profile/page.tsx` y `/teacher/[username]/page.tsx`. |
| D-11 | Documentado: `class_spots` usa `session_id IS NULL` — correcto para el modelo de enrollment global actual. |
| D-12 | `packages/shared/src/lib/friendship.ts` con `isFriendOf()` y `getFriendIds()` bidireccionales; exportado desde `@danceclass/shared`. |
| D-13 | Documentado: constraint `notification_type` en migration 023 = 22 tipos = TypeScript enum. Query diagnóstica en CLAUDE.md. |
| D-14 | `AuditionModal` soporta UPDATE mientras status='pending' (web + mobile). `ClassDetailClient` muestra botón "Editar postulación" en ese estado. |
| D-15 | Documentado: modelo de enrollment global para periódicas (todos usan `session_id = NULL`). |
| D-16 | Documentado: patrón dual RLS + admin client en rehearsals — ambos coexisten, no eliminar RLS. |
| D-17 | Auditado: avatares, posts y comprobantes dejan archivos huérfanos en Storage. Documentado como deuda post-alpha. |

### Migración nueva

- `supabase/migrations/030_dedup_class_reminders.sql` — debe aplicarse en producción.

### Archivos modificados

- `apps/web/src/lib/utils.ts` — warning en ancla virtual
- `apps/mobile/lib/utils.ts` — warning en ancla virtual
- `apps/web/src/app/api/cron/cleanup-classes/route.ts` — `chileNow()`, cron timezone
- `apps/web/src/app/api/ratings/upsert/route.ts` — validación clase ya ocurrió
- `apps/web/src/components/class/CreateClassForm.tsx` — hint quincenal + validación custom_dates
- `apps/web/src/components/class/EditClassForm.tsx` — ídem
- `apps/mobile/app/(app)/class/create.tsx` — ídem
- `apps/mobile/app/(app)/class/[id]/edit.tsx` — ídem
- `apps/web/src/app/(app)/profile/page.tsx` — conteo clases con status filter
- `apps/web/src/app/(app)/teacher/[username]/page.tsx` — ídem
- `packages/shared/src/lib/friendship.ts` — nuevo helper bidireccional
- `packages/shared/src/index.ts` — export friendship
- `apps/web/src/components/class/AuditionModal.tsx` — soporte UPDATE (edit mode)
- `apps/web/src/components/class/ClassDetailClient.tsx` — botón "Editar postulación"
- `apps/mobile/app/(app)/class/[id]/index.tsx` — soporte UPDATE + botón editar
- `CLAUDE.md` — 6 nuevas notas técnicas

### Acciones del usuario pendientes

1. Aplicar `030_dedup_class_reminders.sql` en Supabase producción.
2. Verificar clases activas sin `start_date`: `SELECT COUNT(*) FROM classes WHERE type != 'suelta' AND start_date IS NULL AND status = 'active'`. Si > 0, hacer backfill.
3. Verificar constraint `notification_type` en prod (query en CLAUDE.md).

---

## Sesión 2026-05-28 — Bugs críticos pre-alpha (planning/01)

**Objetivo:** cerrar todos los ítems de `planning/01-critical-bugs.md`.

### Cambios implementados sesión 01

| ID | Descripción | Prioridad |
| --- | --- | --- |
| C-4 | Implementada eliminación de cuenta: `POST /api/account/delete` (Bearer + cookie), página web `/profile/delete-account`, pantalla mobile `profile/delete-account.tsx`. Anonimiza perfil, cancela subscription, tombstones email en auth, firma-out. Link visible en ambos perfiles. | P0 |
| C-1 | `/api/class/leave` ahora voidea payments `pending`/`payment_submitted` del enrollment al cancelar. `/api/class/enroll` voidea pagos no confirmados al re-inscribir desde `cancelled`. | P1 |
| C-9 | `CreateClassForm` y `EditClassForm`: helper `noExp` bloquea `e`, `E`, `+`, `-`, `.`, `,` en inputs numéricos. Agregados `step="1"` y rangos razonables (`max_spots ≤ 1000`, `price ≤ 10_000_000`, `billing_day 1–27`). | P1 |
| C-7 + C-2 | `ClassDetailClient`: nuevo estado `enrollError`. `handleEnroll` muestra mensaje claro cuando servidor retorna `no_spots` ("Esta clase se acaba de llenar. Intenta en otra fecha.") o error genérico. Botón Reportar oculto para anónimos (ya estaba correcto con `{currentUser && ...}`). | P1 |
| C-5 | `PaymentClient.onDrop` valida magic bytes antes de subir: JPEG(`ffd8`), PNG(`89504e47`), PDF(`25504446`), WEBP(`52494646`). Rechaza con alert si no coincide. | P1 |
| C-6 | Confirmado: banner naranja (fecha eliminación archivos) solo renderiza en `TeachingTab`. No afecta `EnrolledTab`. Comportamiento correcto. | P2 |
| C-3 | `ClassDetailClient.handleDeleteClass`: inmediatamente purga Storage `class-media` y filas `class_media` al soft-deletar, sin esperar el cron diario. | P2 |
| C-11 | `ClassCard`: `<Image loading="lazy">` + `<video preload="metadata">`. `PostCard` ya tenía `preload="metadata"`. | P2 |
| C-12 | Documentado en CLAUDE.md: precio al pago = precio vigente de la clase (incluyendo descuentos activos). Decisión consciente. | P2 |

### Pendientes como deuda técnica post-alpha

- **C-8** (useEffect sin cancel): refactor global a `useSWR` o `@tanstack/react-query`. Aplazar para post-alpha; el riesgo de regresión es alto y el daño es visual (clase fantasma que desaparece al navegar de nuevo).
- **C-10** (graceful Cloudinary failure): auditoría completa de `CreatePostModal` + fallback UI. Aplazar para post-alpha.

### Migración nueva sesión 01

- `supabase/migrations/031_account_deletion.sql` — añade `deleted_at TIMESTAMPTZ` a `profiles`. **Debe aplicarse en producción.**

### Archivos modificados sesión 01

- `supabase/migrations/031_account_deletion.sql` — nueva migración
- `apps/web/src/app/api/account/delete/route.ts` — nuevo endpoint eliminación cuenta
- `apps/web/src/app/(app)/profile/delete-account/page.tsx` — nueva página web
- `apps/mobile/app/(app)/profile/delete-account.tsx` — nueva pantalla mobile
- `apps/web/src/app/(app)/profile/page.tsx` — link "Eliminar cuenta" + import Trash2
- `apps/mobile/app/(app)/(tabs)/profile.tsx` — link "Eliminar cuenta"
- `apps/web/src/app/api/class/leave/route.ts` — void payments al salir
- `apps/web/src/app/api/class/enroll/route.ts` — void pagos viejos al re-inscribir
- `apps/web/src/components/class/CreateClassForm.tsx` — helper noExp + step/max en inputs
- `apps/web/src/components/class/EditClassForm.tsx` — ídem
- `apps/web/src/components/class/ClassDetailClient.tsx` — enrollError state, no_spots msg, borrado Storage al eliminar
- `apps/web/src/components/payment/PaymentClient.tsx` — validación magic bytes MIME
- `apps/web/src/components/feed/ClassCard.tsx` — lazy loading + preload metadata
- `CLAUDE.md` — 8 nuevas notas técnicas

### Acciones del usuario pendientes sesión 01

1. **Aplicar `031_account_deletion.sql` en Supabase producción** — sin esto la columna `deleted_at` no existe y el endpoint fallará con error 42703.
2. Verificar que el endpoint `POST /api/account/delete` funciona en producción con una cuenta de prueba.
3. Aplicar `030_dedup_class_reminders.sql` si aún no se ha hecho.

---

## Sesión 2026-05-29 — Alpha-04: Pagos, suscripciones y flujo de dinero

### Resumen

Sesión correspondiente a `planning/03-payments-and-money.md`. Se implementaron todos los ítems P0, P1 y P2 de la sesión.

### Cambios implementados

**P-12 (P1) — Webhook: early 400 para `data.id` vacío:**
`/api/mercadopago/webhook` ahora retorna 400 antes de la verificación de firma si `data.id` está vacío, evitando posible spoofing de manifest.

**P-3 (P1) — Validación de clase vencida y audición en `/api/class/enroll`:**
El endpoint ahora valida:
- Clase suelta con `date` pasada → 400 `class_expired`
- Clase periódica con `ends_at` vencida → 400 `class_expired`
- Clase con `requires_audition=true` sin audición aceptada → 403 `audition_required`

**P-8 (P1) — Idempotencia en renovaciones mensuales de suscripción:**
Nueva tabla `subscription_renewals (id, subscription_id, mp_payment_id UNIQUE, processed_at)`. El webhook `subscription_authorized_payment` verifica que el `mp_payment_id` no fue procesado antes de extender `expires_at`.

**P-7 (P1) — UX de cancelación de suscripción:**
- `CancelSubscriptionButton` recibe `expiresAt` y lo muestra en el ConfirmDialog.
- Nuevo helper `getCancelledPendingExpiry` en `lib/subscription.ts`.
- `plans/page.tsx` muestra banner ámbar "Tu suscripción fue cancelada. Tienes acceso hasta DD/MM/YYYY" cuando el usuario tiene una suscripción cancelada con tiempo restante.

**P-11 (P2) — Polling en `/plans/success`:**
- Nuevo endpoint `GET /api/subscriptions/status` → `{ tier }`.
- Nuevo componente `SubscriptionPolling` (client): polling cada 2 s por hasta 30 s; muestra "Confirmando suscripción…" mientras espera, "Tu suscripción está activa." al confirmar, o "Tu pago se está procesando. Revisa en unos minutos." si timeout.
- `plans/success` obtiene `currentTier` server-side y lo pasa como `initialTier`.

**P-2 (P1) — Banner de suscripción por vencer en `/profile`:**
El perfil muestra un banner ámbar "Tu plan vence el DD/MM/YYYY — Renovar ahora" cuando `expires_at` está a ≤ 7 días.

**P-4 (P2) — Timeout de enrollments 2x sin pagar:**
El cron `cleanup-classes` cancela enrollments `is_2x=true` con `status=pending_payment` de más de 7 días, cancela también el `partner_enrollment`, voidea payments y notifica a ambos con `class_cancelled`.

**P-5 (P2) — Toggle "Notificar alumnos inscritos" en DiscountModal:**
Checkbox en `DiscountModal`. Si activo, el API `/api/class/discount` envía `class_discount` a alumnos con `pending_payment` (excluyendo los ya notificados como seguidores). El precio actualizado ya aplica automáticamente porque `PaymentClient` lee el precio en runtime.

**P-9 (P2) — Contactar profesor (reembolso) en `EnrolledTab`:**
Cuando una clase está `status='cancelled'` y el enrollment es `confirmed`, el `EnrolledTab` muestra el label "(clase cancelada)" y un link "Solicitar reembolso al profesor" → `/teacher/[username]`. Decisión independiente: se usa link al perfil en vez de mailto porque el email del profesor no está en la tabla `profiles`.

**P-10 (P2) — Disclaimer de precio en `PaymentClient`:**
Bajo el monto, texto: "El monto mostrado es el precio vigente al momento de pagar. Puede diferir del precio al inscribirse si el profesor aplicó un descuento posterior."

### Migración nueva sesión 04

- `supabase/migrations/032_subscription_renewals.sql` — tabla de deduplicación de renovaciones. **Debe aplicarse en producción.**

### Archivos modificados sesión 04

- `supabase/migrations/032_subscription_renewals.sql` — nueva migración
- `apps/web/src/app/api/mercadopago/webhook/route.ts` — early 400 + idempotencia renovaciones
- `apps/web/src/app/api/class/enroll/route.ts` — validación clase vencida + audición
- `apps/web/src/lib/subscription.ts` — `getCancelledPendingExpiry`, tipo `SubRow` con `status`
- `apps/web/src/app/(app)/plans/page.tsx` — banner cancelación + `formatDate` local
- `apps/web/src/components/plans/CancelSubscriptionButton.tsx` — prop `expiresAt`, fecha en ConfirmDialog
- `apps/web/src/app/(app)/plans/success/page.tsx` — `SubscriptionPolling` + dark mode
- `apps/web/src/app/api/subscriptions/status/route.ts` — nuevo endpoint GET tier
- `apps/web/src/components/plans/SubscriptionPolling.tsx` — nuevo componente cliente polling
- `apps/web/src/app/(app)/profile/page.tsx` — `activeSub`, banner vencimiento, import `AlertCircle`
- `apps/web/src/app/api/cron/cleanup-classes/route.ts` — cancelación automática 2x stale
- `apps/web/src/components/class/DiscountModal.tsx` — toggle `notifyEnrolled`
- `apps/web/src/app/api/class/discount/route.ts` — lógica `notify_enrolled`
- `apps/web/src/components/class/MyClassesClient.tsx` — link reembolso en EnrolledTab
- `apps/web/src/components/payment/PaymentClient.tsx` — disclaimer precio

### Acciones del usuario pendientes sesión 04

1. **Verificar `MERCADOPAGO_ACCESS_TOKEN` en Vercel** — debe empezar con `APP_USR-` (producción). Si empieza con `TEST-`, los pagos son de sandbox.
2. **Aplicar `032_subscription_renewals.sql` en Supabase producción** — sin esto el webhook `subscription_authorized_payment` fallará con error 42P01 al insertar en la tabla inexistente.
3. Hacer un pago real de $1.500 para validar el flujo end-to-end en producción.
4. Confirmar que el webhook URL en el dashboard de MP apunta a producción: `https://dc-project-web.vercel.app/api/mercadopago/webhook`.

---

## Sesión 2026-05-29 (sesión 05) — Paridad mobile y plataformas

Implementación de mejoras de paridad mobile según `planning/05-mobile-parity-and-platforms.md`. Todos los P0/P1 de código resueltos; los pendientes de usuario (EAS build, Supabase redirect URLs) documentados.

### Cambios de código (sesión 05)

**M-2 — FAB para crear clase en feed mobile:**

Nuevo componente `apps/mobile/components/ui/FloatingActionButton.tsx` — botón circular absoluto bottom-right, `brand-600`, ícono `Plus`. Agregado en `(tabs)/feed.tsx`: visible solo si `canTeach(tier)`. El tier se obtiene en `init()` junto al resto de los fetches iniciales.

**M-4 — Deep link "Volver a la app" en plans/success:**

`apps/web/src/app/(app)/plans/success/page.tsx`: link `danceclass://plans/success` al final de la página. Cuando se abre en el in-app browser de Expo, el tap redirige de vuelta a la app mobile.

**M-9 — Botón Share en MobilePostCard:**

`apps/mobile/components/feed/MobilePostCard.tsx`: ícono `Share2` en el header del post. Usa `Share.share()` de React Native. Comparte título + URL del feed.

**M-12 — Pull-to-refresh en pantallas faltantes:**

`RefreshControl` añadido en `(tabs)/my-classes.tsx` (ScrollView), `notifications.tsx` (FlatList) y `teacher/[username].tsx` (ScrollView). En todos los casos `load()` fue convertido a `useCallback`.

**M-14 — Error boundary global:**

Nuevo `apps/mobile/components/ui/ErrorBoundary.tsx` — class component React. Muestra "Algo salió mal" + botón "Reintentar". Wrappea `<RootLayout>` en `_layout.tsx`.

**M-15 — Helper `pluralize` y `formatDateLocal` en shared:**

`packages/shared/src/types/index.ts`: `pluralize(n, singular, plural)` y `formatDateLocal(dateStr)` (YYYY-MM-DD → fecha local sin off-by-one). Aplicado en class detail mobile: "1 cupo disponible de 5".

### Items verificados sin cambios (sesión 05)

M-1 (FriendsTwoxList en feed): post-alpha, la sección 2x ya existe en el detalle de clase. M-3 (EAS build): `projectId` ya en `app.json`. M-6 (permisos): `NSPhotoLibraryUsageDescription` y permisos Android ya correctos. M-10 (FlatList): ya implementado. M-16 (TopBar badge): ya implementado.

### Archivos modificados sesión 05

`apps/mobile/components/ui/FloatingActionButton.tsx` (nuevo), `apps/mobile/components/ui/ErrorBoundary.tsx` (nuevo), `apps/mobile/app/(app)/(tabs)/feed.tsx`, `apps/mobile/app/(app)/(tabs)/my-classes.tsx`, `apps/mobile/app/(app)/notifications.tsx`, `apps/mobile/app/(app)/teacher/[username].tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/components/feed/MobilePostCard.tsx`, `apps/mobile/app/(app)/class/[id]/index.tsx`, `apps/web/src/app/(app)/plans/success/page.tsx`, `packages/shared/src/types/index.ts`.

### Acciones del usuario pendientes sesión 05

1. **`eas login` + `eas init`** en `apps/mobile/` → confirmar/actualizar `projectId` en `app.json`.
2. **Env vars en Expo dashboard** (EAS Secrets): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. **Supabase Auth** → URL Configuration → añadir `danceclass://**` en Redirect URLs.
4. **Build EAS preview Android** → `eas build --profile preview --platform android` → instalar en dispositivo real.
5. (Opcional alpha) Build iOS — requiere Apple Developer ($99/año).

---

## Sesión 06 — Testing y QA (2026-05-30)

### T-3 — Unit tests: helpers shared y utils web

Nuevos archivos en `tests/unit/`:

**`shared-helpers.test.ts`** — Tests para funciones puras de `packages/shared/src/types/index.ts`:

- `canTeach`, `canTeachUnlimited`, `canEnroll`, `canUploadVideo`, `canPostVideo`, `canUploadMedia` — todos los 4 tiers cubiertos
- `pluralize` — n=0, n=1, n>1
- `formatDateLocal` — YYYY-MM-DD parsing sin off-by-one UTC (caso borde: 2026-01-01 debe mostrar enero, no diciembre)

**`utils.test.ts`** — Tests para funciones puras de `apps/web/src/lib/utils.ts`:

- `formatTime` — 24h → 12h AM/PM: 00:00→"12:00 AM", 12:00→"12:00 PM", 23:59→"11:59 PM", etc.
- `formatDate` — YYYY-MM-DD sin off-by-one UTC; también acepta ISO timestamp
- `getClassSessions` — suelta (dentro/fuera/bordes de ventana), custom (filtro de rango), weekly (4 lunes de junio), biweekly (semanas alternas), monthly (día 15 en 3 meses; día 31 clampeado a último día de Feb)

### T-4 — CI: GitHub Actions

Nuevo archivo `.github/workflows/ci.yml`:

- Job **typecheck**: `tsc --noEmit` en `apps/web` (Node 20, `npm ci`)
- Job **test-unit**: instala Playwright + corre `npm run test:unit` (sin servidor)
- Job **smoke-prod** (condicional): corre contra producción solo si `vars.RUN_SMOKE_TESTS=true` y secrets `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` configurados
- Artefactos de fallo subidos con `actions/upload-artifact@v4` (7 días)

### T-5 — Seed de datos E2E

Nuevo archivo `tests/e2e/seed.ts`:

- `seedClass()` — crea clase suelta `[TEST]` para mañana + enrollment `pending_payment` del alumno; retorna `{ classId, enrollmentId }`
- `seedEntrenamiento()` — crea entrenamiento con `requires_audition: true`
- `cleanSeed()` — borra exactamente los registros creados en la sesión (pagos → enrollments → clases)
- `cleanAllTestData()` — limpieza completa de todas las clases `[TEST]%` (fallback post-suite)
- Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` de instancia de **test** (nunca producción)

### Archivos creados sesión 06

`tests/unit/shared-helpers.test.ts` (nuevo), `tests/unit/utils.test.ts` (nuevo), `.github/workflows/ci.yml` (nuevo), `tests/e2e/seed.ts` (nuevo).

---

## Sesión 2026-05-30 — UI/UX Polish (planning/06)

### Objetivo

Mejorar empty states, centralizar validaciones, accesibilidad de teclado en modales, KAV en mobile y sweep final de dark mode.

### ✅ U-1 — Empty states con copy orientador

| Pantalla | Cambio |
|---|---|
| `/feed` Siguiendo | "Aún no sigues a nadie" + Link `[Explorar profesores]` → `/explore` |
| `/feed` Cerca (sin ciudad) | "Sin clases cerca tuyo" + Link `[Editar perfil]` → `/profile/edit` |
| `/notifications` | Título "Sin notificaciones" + subtítulo "Te avisaremos aquí cuando pase algo." |
| `/explore` clases/usuarios | Query vacía: "Ningún resultado para 'X'"; sin query: "No hay … con estos filtros" |
| `/my-classes` Historial | "Aún no tienes pagos registrados…" + Link `[Explorar clases]` → `/explore` |
| `/my-classes` Ensayos | "Aún no organizaste ni te invitaron…" + Link `[Crear ensayo]` → `/publish` |
| `/agenda` día sin eventos | "Día libre — inscríbete a una clase desde el feed." |

**Archivos:** `FeedClient.tsx`, `NotificationsClient.tsx`, `ExploreClient.tsx`, `MyClassesClient.tsx`, `AgendaClient.tsx`.

### ✅ U-3 — Validadores centralizados

Nuevo archivo `packages/shared/src/lib/validators.ts` exportado desde `@danceclass/shared`:

- `validateUsername(value)` — regex `^[a-z0-9_]{3,20}$`; retorna string de error o `null`
- `validateRut(value)` — algoritmo check-digit (módulo 11); acepta formatos con/sin puntos y guión
- `validateFullName(value)` — max 100 chars
- `validateBio(value)` — max 280 chars
- `validateInstagramHandle(value)` — sin `@`, letras/números/guión bajo/punto
- `validateChileanPhone(value)` — formato `+56XXXXXXXXX`

**Integración:**
- `EditProfileForm.tsx` (web): `validateUsername` en `handleSubmit` antes de llamar a Supabase
- `PaymentInfoForm.tsx` (web): RUT via `z.string().superRefine(validateRut)` en schema Zod
- `profile/edit.tsx` (mobile): `validateUsername` reemplaza el guard previo `if (!username.trim())`

### ✅ U-13 — KeyboardAvoidingView en formularios mobile

`KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` wrapping `ScrollView` añadido en:
- `class/create.tsx`
- `class/[id]/edit.tsx`
- `profile/edit.tsx`
- `profile/payment-info.tsx`

Login y register ya lo tenían desde antes.

### ✅ U-15 — Avatar fallback con ícono User

`apps/web/src/lib/utils.ts` → `getInitials()` reescrita con regex Unicode `\p{L}\p{N}` para soportar nombres con emoji o caracteres especiales sin crash. Si el resultado tiene 0 iniciales válidas, `Avatar.tsx` renderiza `<User>` (lucide-react, tamaño `icon` de `sizeMap`) en lugar de un contenedor vacío.

### ✅ U-16 — Cerrar modales con Escape

Nuevo hook `apps/web/src/hooks/useEscapeKey.ts`:
```typescript
export function useEscapeKey(handler: () => void, enabled = true)
```
Integrado (con `enabled = !loading/!saving`) en: `ConfirmDialog`, `AuditionModal`, `DiscountModal`, `CreatePostModal`, `RatingModal`.

### ✅ U-18 — Dark mode sweep

Componentes con residuos corregidos:
- `CustomDatesCalendar.tsx`: nav buttons, mes/año, día headers, celdas de fecha, leyenda
- `DashboardClient.tsx`: encabezados, clase/horario, contadores, sin-inscripciones
- `CreatePostModal.tsx`: container, labels, upload zone, texto/icono dropzone, visibilidad options

### ✅ U-2, U-8, U-10 — Verificados (sin cambios necesarios)

- U-2: no hay `window.confirm()` en el codebase. Todos los destructivos ya usan `ConfirmDialog`.
- U-8: loading states ya completos en ClassDetailClient, PaymentClient, MyClassesClient, todos los modales.
- U-10: `StatusBar style={isDark ? 'light' : 'dark'}` ya implementado en `_layout.tsx` mobile.

### Archivos modificados sesión 07

| Archivo | Cambio |
|---|---|
| `packages/shared/src/lib/validators.ts` | NUEVO — validateUsername, validateRut, validateFullName, validateBio, validateInstagramHandle, validateChileanPhone |
| `packages/shared/src/index.ts` | Export validators |
| `apps/web/src/hooks/useEscapeKey.ts` | NUEVO — hook Escape key |
| `apps/web/src/lib/utils.ts` | `getInitials` Unicode-safe |
| `apps/web/src/components/ui/Avatar.tsx` | Fallback ícono `User` cuando sin iniciales |
| `apps/web/src/components/ui/ConfirmDialog.tsx` | `useEscapeKey` |
| `apps/web/src/components/class/AuditionModal.tsx` | `useEscapeKey` |
| `apps/web/src/components/class/DiscountModal.tsx` | `useEscapeKey` |
| `apps/web/src/components/class/CustomDatesCalendar.tsx` | Dark mode completo |
| `apps/web/src/components/class/DashboardClient.tsx` | Dark mode completo |
| `apps/web/src/components/feed/CreatePostModal.tsx` | `useEscapeKey` + dark mode |
| `apps/web/src/components/ui/RatingModal.tsx` | `useEscapeKey` |
| `apps/web/src/components/feed/FeedClient.tsx` | Empty states Siguiendo/Cerca |
| `apps/web/src/components/notifications/NotificationsClient.tsx` | Empty state |
| `apps/web/src/components/feed/ExploreClient.tsx` | Empty states con/sin query |
| `apps/web/src/components/class/MyClassesClient.tsx` | Empty states Historial/Ensayos |
| `apps/web/src/components/agenda/AgendaClient.tsx` | Empty state día libre |
| `apps/web/src/components/profile/EditProfileForm.tsx` | `validateUsername` en handleSubmit |
| `apps/web/src/components/profile/PaymentInfoForm.tsx` | `validateRut` en Zod schema |
| `apps/mobile/app/(app)/profile/edit.tsx` | `validateUsername` + KAV |
| `apps/mobile/app/(app)/class/create.tsx` | KAV |
| `apps/mobile/app/(app)/class/[id]/edit.tsx` | KAV |
| `apps/mobile/app/(app)/profile/payment-info.tsx` | KAV |

### Archivos modificados sesión 06

`planning/07-testing-and-qa.md` (reporte de cierre), `CLAUDE.md` (sección Testing), `resumen.md`.

### Acciones del usuario pendientes sesión 06

1. **Habilitar GitHub Actions** en el repo: Settings → Actions → Allow all actions.
2. (Opcional) Crear variable `RUN_SMOKE_TESTS=true` en GitHub Actions Settings → Variables para activar smoke tests en CI.

---

## Sesión 2026-05-27 — Performance y Observabilidad (planning/08)

### Objetivo

Instalar "ojos en el sistema": logs estructurados, error tracking con Sentry, alertas de cron con Healthchecks.io, badge de notificaciones en tiempo real.

### ✅ O-3 — Logger estructurado JSON

Nuevo helper `apps/web/src/lib/logger.ts` con `logger.info/warn/error`. Emite JSON estructurado `{ level, event, ...meta, ts }` — Vercel lo indexa en el log explorer y permite filtrar por campo. Aplicado en:

- `api/cron/cleanup-classes/route.ts`
- `api/cron/cleanup-unconfirmed/route.ts`
- `api/mercadopago/webhook/route.ts`

### ✅ O-2 — Healthchecks.io para crons

Función `pingHealthcheck(uuid)` añadida al final de ambos crons. Llama a `https://hc-ping.com/<UUID>` con timeout 5s; falla silenciosamente (nunca bloquea el cron). UUIDs vienen de env vars `HEALTHCHECK_CLEANUP_CLASSES_UUID` y `HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID`.

**Acción pendiente del usuario:** crear cuenta en healthchecks.io → 2 monitores (daily, grace 2h) → agregar UUIDs en Vercel.

### ✅ O-1 — Sentry

- `@sentry/nextjs` ^8 añadido a `apps/web/package.json`
- `apps/web/sentry.client.config.ts` — init cliente con `NEXT_PUBLIC_SENTRY_DSN`, `tracesSampleRate: 0.1`, ignora errores de red
- `apps/web/sentry.server.config.ts` — init servidor
- `apps/web/src/instrumentation.ts` — hook de Next.js 14 que importa el config servidor
- `apps/web/next.config.js` — `withSentryConfig` dentro de try/catch (no rompe si paquete no instalado en local Node v12)

**Acción pendiente del usuario:** crear cuenta Sentry free → obtener DSN → agregar `NEXT_PUBLIC_SENTRY_DSN` en Vercel.

### ✅ O-5 — Cloudinary en remotePatterns

`next.config.js` incluye `res.cloudinary.com` como dominio permitido para `<Image>` de Next.js.

### ✅ O-9 — Realtime badge de notificaciones

Nuevo componente `apps/web/src/components/ui/NotificationBell.tsx` (client component). Reemplaza el Link+Bell estático en `TopBar.tsx`. Suscribe a Supabase Realtime (`postgres_changes INSERT, filter: user_id=eq.${userId}`) e incrementa el badge en tiempo real. Al navegar a `/notifications` resetea el badge a 0.

**Acción pendiente del usuario:** habilitar Realtime en la tabla `notifications` desde el dashboard de Supabase → Table Editor → notifications → Realtime ON.

### ✅ O-8 — N+1 queries verificado (no hay problema)

`my-classes/page.tsx` ya usa `Promise.all` con nested selects (no hay loops de fetches por clase).

### Archivos modificados sesión 08

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/logger.ts` | NUEVO — structured JSON logger |
| `apps/web/src/app/api/cron/cleanup-classes/route.ts` | logger + healthcheck ping |
| `apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts` | logger + healthcheck ping |
| `apps/web/src/app/api/mercadopago/webhook/route.ts` | logger (reemplaza console.log) |
| `apps/web/next.config.js` | Cloudinary remotePattern + withSentryConfig |
| `apps/web/package.json` | `@sentry/nextjs: ^8.0.0` añadido |
| `apps/web/sentry.client.config.ts` | NUEVO — Sentry client init |
| `apps/web/sentry.server.config.ts` | NUEVO — Sentry server init |
| `apps/web/src/instrumentation.ts` | NUEVO — Next.js 14 server instrumentation hook |
| `apps/web/src/components/ui/NotificationBell.tsx` | NUEVO — realtime badge component |
| `apps/web/src/components/ui/TopBar.tsx` | Usa NotificationBell |
| `planning/08-performance-and-observability.md` | Reporte de cierre completo |
| `planning/00-overview.md` | Sesión 8 marcada ✅ |

### Acciones del usuario pendientes sesión 08

1. **Sentry:** crear cuenta free en sentry.io → proyecto Next.js → copiar DSN → `NEXT_PUBLIC_SENTRY_DSN` en Vercel → hacer deploy.
2. **Healthchecks.io:** crear cuenta en healthchecks.io → crear 2 checks (schedules: `0 3 * * *` y `0 4 * * *`, grace 2h) → copiar UUIDs → `HEALTHCHECK_CLEANUP_CLASSES_UUID` y `HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID` en Vercel.
3. **Supabase Realtime:** en Supabase dashboard → Table Editor → `notifications` → toggle Realtime ON.
4. **Vercel Analytics:** en dashboard de Vercel del proyecto → Analytics tab → Enable (gratis para hobby).
3. (Opcional) Crear secrets `E2E_USER_EMAIL` y `E2E_USER_PASSWORD` en GitHub Actions para smoke tests.
4. **Ejecutar bug bash** con 3–5 personas antes del launch (T-7).
5. Configurar `.env.test` cuando haya instancia de Supabase test para poder usar `seed.ts` en E2E locales.

