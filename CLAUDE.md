# DanzClass — Prompt de contexto para Claude Code

Este archivo es el punto de entrada para cualquier sesión de desarrollo nueva. Léelo completo antes de tocar cualquier archivo del proyecto.

---

## Qué es DanzClass

Plataforma web + móvil para conectar profesores y estudiantes de baile urbano en Chile. El mercado actual es completamente informal: los profesores usan Instagram Stories y WhatsApp para publicar clases, los pagos van por transferencia bancaria con captura de pantalla, y hay problemas de sobrecupo y descuentos de último minuto sin alcance.

---

## Stack técnico

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`), sin Turborepo
- **Web:** Next.js 14 (App Router) + TypeScript + Tailwind CSS — `apps/web/`
- **Mobile:** Expo SDK 51 (Expo Router) + React Native + NativeWind — `apps/mobile/`
- **Backend:** Supabase — PostgreSQL + Auth + Storage + Realtime
- **Tipos compartidos:** `packages/shared/` — tipos TypeScript + cliente Supabase base
- **Node.js local:** v12 (WSL2) — **no puede buildear Next.js**. Siempre buildear en Vercel; verificar errores TS manualmente antes de pushear.

---

## Sistema de diseño y paleta de colores

La app tiene una identidad visual basada en la cultura de la danza urbana chilena. Es inclusiva, transversal en géneros y estilos, y equilibra energía con comodidad visual para uso prolongado (registro de clases, exploración de contenido).

### Paleta principal

| Token Tailwind | Hex | Nombre | Uso |
|---|---|---|---|
| `brand-600` | `#c026d3` | **Marca original** | Color de marca heredado — se mantiene en botones activos, íconos de navegación seleccionados, pills activos y el logo. Es el acento de identidad de la app. |
| `violet-500` / `#7F77DD` | `#7F77DD` | **Morado Flow** | Acento principal en componentes nuevos: CTAs secundarios, barras de acento en cards de clase, badges de estado "Inscrito", fondos de header. Complementa a `brand-600` sin reemplazarlo. |
| `#1A1035` | `#1A1035` | **Noche Urbana** | Fondos oscuros: splash screen, modo oscuro (futuro), headers de secciones con peso visual fuerte. No usar como fondo general de pantallas. |
| `emerald-50/60` + `emerald-100` | — | **Verde Activo** | Sección de precios en `ClassCard` (`bg-emerald-50/60 border-t border-emerald-100`). Clases confirmadas, asistencia, logros desbloqueados. |
| `#D85A30` / naranja | `#D85A30` | **Coral Fuego** | Alertas de energía: banner de descuento activo, cupos limitados, banners de eliminación de archivos. Siempre acompañado de ícono o texto explicativo. Nunca como decoración. |
| `#F5F3FF` | `#F5F3FF` | **Blanco Violeta** | Fondo de pantallas interiores. Alternativa a blanco puro — da calidez sin cansar. |
| `#EEEDFE` | `#EEEDFE` | **Lavanda Suave** | Fondo de tarjetas secundarias, chips de etiqueta, badges de estilo. |
| `#6B6880` | `#6B6880` | **Gris Humo** | Texto secundario, metadata (hora, lugar, fecha), placeholders. |

### Reglas de uso

**`brand-600` (`#c026d3`) — color de marca original:**
Mantenerlo en todos los elementos que ya lo usan: ícono activo del BottomNav, pills de filtro activos ("Global" en el feed), badges de estilo de baile, el logo. Es el color de identidad reconocible para los usuarios actuales. No reemplazarlo masivamente.

**Morado Flow (`#7F77DD`) — acento complementario:**
Usar en componentes nuevos que necesiten acento de color sin ser el color de marca principal. Por ejemplo: barra lateral de acento en nuevas tarjetas de clase, fondos de header en mobile, botones de acción secundaria. Funciona bien junto a `brand-600` porque son de la misma familia violeta pero con distinto peso visual.

**Coral Fuego (`#D85A30`) y naranja:**
Reservado para urgencia y descuentos. Ya se usa en: banner "¡Descuento activo!", banner naranja de eliminación de archivos, precio tachado con nuevo precio en naranja. No extender a más usos decorativos.

**Verde (`emerald-*`):**
Solo para precios y confirmaciones. Ya implementado en `ClassCard` (`bg-emerald-50/60`). Mantener esa convención.

**Fondos de pantalla:**
Preferir `#F5F3FF` (Blanco Violeta) o `bg-violet-50` para pantallas interiores en mobile. Evitar blanco puro que fatiga la vista en sesiones largas.

**Tipografía sobre colores:**
- Sobre `brand-600` o `#7F77DD`: texto blanco (`text-white`)
- Sobre `#EEEDFE` (Lavanda Suave): texto `#534AB7` (violeta oscuro)
- Sobre `#D85A30` (Coral): texto blanco
- Sobre fondos claros (`#F5F3FF`, `emerald-50`): texto `gray-800` o `gray-700`

### Referencia visual — pantalla actual

La web app actual (screenshot de referencia) muestra:
- Header blanco con logo "DanzClass" + ícono de nota musical en `brand-600`
- Pills de filtro: "Siguiendo" (sin fondo), "Global" (activo, fondo `brand-600`, texto blanco), "Cerca" (sin fondo)
- Dropdown "Todos" con borde sutil
- Avatar del usuario: iniciales "BS" sobre fondo `brand-600/20` con texto `brand-600`
- Etiqueta de estilo ("House") en `brand-600` sin fondo
- BottomNav: íconos en gris con el activo ("Inicio") en `brand-600`
- Fondo general blanco en feed

Esta referencia define el baseline visual. Los cambios de color deben ser aditivos y coherentes con este look, no un rediseño.

---

## Migraciones SQL aplicadas (en orden, todas en `supabase/migrations/`)

| Archivo | Contenido clave |
|---|---|
| `001_initial_schema.sql` | Schema base: `profiles`, `teacher_payment_info`, `follows`, `classes`, `class_media`, `class_sessions`, `enrollments`, `payments`, `notifications`. Vistas `class_spots`, `session_spots`. Triggers `handle_new_user`, `update_updated_at`. RLS en todas las tablas. |
| `002_subscription_tiers.sql` | Elimina `role` de `profiles`. Crea `subscriptions` (tier: none/basic/teacher/pro). Añade `friendships`. Añade `styles_dancing TEXT[]`, `styles_teaching TEXT[]`, `enrolled_classes_public BOOLEAN` a `profiles`. |
| `003_profiles_extra.sql` | `ALTER TABLE profiles ADD COLUMN` para `styles_dancing`, `styles_teaching`, `enrolled_classes_public`. |
| `004_class_schedule_improvements.sql` | `price_suelta INTEGER`, `custom_dates TEXT[]` en `classes`. Extiende constraint `recurrence` con `'custom'`. |
| `005_storage_policies.sql` | Buckets `class-media` (50MB) y `avatars` (5MB), ambos públicos, con políticas RLS. |
| `006_notification_types.sql` | Extiende constraint de notificaciones: `follow`, `new_class`, `class_updated`, `class_cancelled`. Política `notifications_insert_any`. |
| `007_payment_receipts_bucket.sql` | Bucket `payment-receipts` (10MB, imagen/PDF). |
| `008_trust_posts.sql` | Tablas: `trust_endorsements`, `posts` (id, user_id, title, video_url, thumbnail_url, visibility, city), `dismissed_debts`. Bucket `posts-media` (100MB). Notificación `debt_warning`. |
| `009_class_type_post_visibility.sql` | `class_type TEXT CHECK ('coreografía'/'freestyle'/'otro')` en `classes`. `visibility TEXT CHECK ('public'/'followers'/'friends')` en `posts`, reemplaza `is_public`. Backfill automático. |
| `010_reports_music.sql` | Tabla `reports` (reporter_id, content_type, content_id, reason, description, status). UNIQUE por usuario+contenido. RLS. ⚠️ Esta versión incluía columnas `music_*` en posts (ya eliminadas en 011). |
| `011_drop_music_columns.sql` | Elimina `music_id`, `music_title`, `music_artist`, `music_preview_url` de `posts`. |
| `012_add_new_report_notification.sql` | Notificación `new_report` en constraint. |
| `013_2x_requests.sql` | Tabla `class_2x_requests` (user_id, class_id, matched_with, status, payment_assignee). `is_2x BOOLEAN`, `partner_enrollment_id UUID` en `enrollments`. `price_suelta_2x INTEGER` en `classes`. Notificación `2x_payment_turn`. |
| `014_discounts.sql` | `discount_price INTEGER`, `discount_price_monthly INTEGER` en `classes`. Notificación `class_discount`. |
| `015_entrenamiento.sql` | Tipo `'entrenamiento'` en `classes`. `requires_audition`, `audition_closed`, `ends_at DATE`, `ends_indefinitely BOOLEAN` en `classes`. Tabla `auditions`. Bucket `audition-videos` (privado, 100MB). Notificaciones `audition_accepted`, `audition_rejected`. |
| `020_reminders_and_waitlist.sql` | Extiende constraint notifications con `class_reminder` y `waitlist_available`. Tabla `waitlist` (class_id, user_id, UNIQUE(class_id,user_id)) con RLS. |
| `021_post_description.sql` | `ALTER TABLE posts ADD COLUMN description TEXT` (nullable, retrocompatible). Reemplaza `city` en posts tipo video. |
| `022_user_availability.sql` | Columnas `sleep_start SMALLINT DEFAULT 0` y `sleep_end SMALLINT DEFAULT 8` en `profiles`. Tabla `user_busy_blocks` (user_id, weekday 0=Lun..6=Dom, hour 0-23, UNIQUE por user+weekday+hour). RLS: solo el propio usuario. |
| `023_rehearsals.sql` | Tabla `rehearsals` (id, creator_id, title, city, date_mode, rehearsal_date, rehearsal_time, custom_dates, notes, status). Tabla `rehearsal_invites` (rehearsal_id, user_id, status pending/accepted/rejected, UNIQUE). Notificaciones `rehearsal_invite`, `rehearsal_accepted`, `rehearsal_rejected`. |
| `024_add_start_date_to_classes.sql` | `start_date DATE` en `classes` (nullable). Permite definir desde cuándo aplica una clase periódica. |
| `025_billing_day.sql` | `billing_day SMALLINT DEFAULT 1 CHECK (BETWEEN 1 AND 27)` en `classes`. Día del mes para cobro mensual de entrenamientos. |
| `026_notifications_policy_admin_only.sql` | Elimina `notifications_insert_any (WITH CHECK true)`. Crea `notifications_insert_self (auth.uid()=user_id)`. Cross-user va por `/api/notifications/send`. |
| `027_admin_actions.sql` | Tabla `admin_actions` (admin_id, action_type, target_table, target_id, report_id, reason). RLS solo service role. |
| `028_lock_teacher_payment_info.sql` | Sustituye `payment_info_select_all USING(true)` por SELECT solo al teacher dueño o alumnos con enrollment activo. |
| `029_private_payment_receipts.sql` | Flipea `payment-receipts` a `public=false` y reemplaza policy SELECT por uploader o teacher de la clase. Display vía signed URL en `/api/payment/receipt-url`. |
| `030_dedup_class_reminders.sql` | Deduplicación de recordatorios de clase. |
| `031_account_deletion.sql` | `deleted_at TIMESTAMPTZ` en `profiles` para soft-delete de cuenta. |
| `032_subscription_renewals.sql` | Tabla `subscription_renewals (mp_payment_id UNIQUE)` para deduplicar `subscription_authorized_payment` reenviados por MP. RLS: solo service role. |

**Antes de proponer cualquier migración nueva:** verificar que el constraint de `notification_type` en la última migración incluya todos los tipos anteriores, ya que cada migración lo reescribe completo.

---

## Estado de implementación web (`apps/web/`)

### Autenticación y layout
- Login/Register con react-hook-form + zod
- Middleware protege rutas `/(app)/*`
- `layout.tsx` carga perfil, suscripción y count de notificaciones

### Feed (`/feed`)
- Tabs: Siguiendo / Global / Cerca
- Dropdown: Todos / Clases / Videos
- `ClassCard` con tono lila, cupos x/y, badge estilo-tipo, precios 2x inline, sección precio en `bg-emerald-50/60`
- `PostCard` con video adaptivo al ratio nativo, menú ⋮ (editar privacidad/eliminar para autor), botón denuncia para no-autores
- Posts filtrados por `visibility` según relación con el autor

### Publicar (`/publish`)
- Página de elección: Clase (→ `/create-class`) o Video (modal inline)
- `BottomNav` "Publicar" apunta a `/publish` si `canTeach(tier)`

### Explorar (`/explore`)
- Búsqueda de clases por texto
- Búsqueda de usuarios con filtros: Tod@s / Amig@s / Siguiendo

### Clases
- `/create-class` — tipo, estilo, `class_type` (opcional), nivel, fechas con `DateInput` (DD/MM/AAAA), media, precio
- `/class/[id]` — carrusel sin crop (`object-contain`), sección amigos buscando 2x (colapsable), `TwoxRequestButton`, botón "Ver fechas" para custom
- `/class/[id]/edit` — zona peligrosa con botón eliminar (soft-delete, notifica inscritos)
- `/class/[id]/auditions` — `AuditionsListClient`: decisiones locales en borrador, botón "Publicar resultados" batch

### Mis clases (`/my-classes`)
- Tabs: "Clases que tomo" / "Clases que dicto"
- Tab Dicto: deudores globales + por clase, confirmación de pagos, eliminación de alumnos
- Banner naranja con fecha de eliminación de archivos

### Notificaciones (`/notifications`)
Todos los tipos implementados: `follow`, `friend_request`, `friend_accepted`, `new_class`, `class_updated`, `class_cancelled`, `payment_confirmed`, `payment_rejected`, `2x_request`, `2x_match`, `2x_payment_turn`, `debt_warning`, `new_report`, `class_discount`, `audition_accepted`, `audition_rejected`, `new_audition`, `class_reminder`, `waitlist_available`

### Perfiles
- `/teacher/[username]` — stats (avg stars con `StarRating`), follow/amistad, posts con filtro de visibilidad por relación
- `/profile` — mismo layout rico, botones como pills, plan, estilos, clases propias, mis publicaciones; avg stars bajo guard `canTeach(tier)`
- `/profile/edit` — avatar, estilos, ciudad
- `/profile/payment-info` — datos bancarios del profesor

### Planes y pagos (`/plans`, `/payment/[enrollmentId]`)
- Básico: $1.500/mes, Pro: $3.500/mes (Mercado Pago, mensual y anual)
- Pago con comprobante; detecta `is_2x`, muestra `price_2x`, maneja `payment_assignee`

### Funcionalidades especiales ya implementadas
- **Sistema 2x:** buscar compañer@ de baile; race condition manejada con 404
- **Descuentos espontáneos:** `DiscountModal` + API + notificación a seguidores
- **Tipo Entrenamiento:** audiciones con decisiones en borrador + publicación batch
- **Valoraciones de profesores:** `StarRating` + `RatingModal`/`RatingPopup` + `/api/ratings/upsert`; reemplaza el sistema de confianza (TrustButton/EndorsementPopup eliminados)
- **Denuncias:** `ReportModal` → `/api/reports` → notifica superadmin
- **Panel superadmin:** `/admin` solo para `SUPERADMIN_USER_ID` env var
- **Términos de uso:** `/terms` público, aceptación obligatoria en registro
- **Deudores:** notificación al profesor + `dismissed_debts`
- **Cron limpieza:** `/api/cron/cleanup-classes` diario a las 03:00 UTC
- **Cloudinary:** videos de posts; fallback a Supabase Storage si no configurado
- **Compartir clase:** botón "Compartir" en `ClassDetailClient` copia URL al portapapeles; visible para todos incluso sin sesión
- **Acceso anónimo a clases:** `/class/*` es ruta pública (middleware); `ClassDetailClient` acepta `currentUser: User | null`; sin sesión: oculta acciones y muestra "Inicia sesión para reservar"
- **Historial de pagos:** tercer tab "Historial" en `/my-classes`; vista alumno (mis pagos) + vista profesor (pagos recibidos + resumen mensual); sin nuevas tablas
- **Recordatorios 24h antes:** cron en `/api/cron/cleanup-classes` calcula clases de mañana (sueltas, sessions, custom, periódicas) y envía `class_reminder` a alumnos confirmados; deduplicación por Set
- **Lista de espera:** tabla `waitlist` + rutas `/api/class/waitlist/join`, `/api/class/waitlist/leave`, `/api/class/leave`; UI en `ClassDetailClient` (cuando `isFull`: "Avisarme si hay cupo" / "Estás en la lista de espera"); badge "N en lista de espera" en `MyClassesClient` tab Dicto; notificación `waitlist_available` al primer en lista cuando alguien cancela su inscripción
- **Inscripción centralizada:** `POST /api/class/enroll` — valida tier (`canEnroll()`), soporta Bearer+cookie, upsert si había enrollment cancelado (evita violación UNIQUE), detecta deudas y notifica al profesor. `ClassDetailClient` llama esta ruta; mobile también vía `WEB_URL/api/class/enroll` con Bearer token.
- **Filtro de clases vencidas en feed:** dos filtros `.or()` en la query Supabase: `(1) type.neq.suelta,date.gte.TODAY` y `(2) type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.TODAY`. Clases `recurrence='custom'` se filtran client-side por `custom_dates`. Aplicado en `feed/page.tsx`, `FeedClient.tsx` y `feed.tsx` (mobile).
- **Cupos en feed:** `ClassCard.tsx` y `MobileClassCard.tsx` calculan cupos usando `status !== 'cancelled'` (no solo `confirmed`) para coincidir con la vista `class_spots`.
- **Banner de pagos pendientes:** `EnrolledTab` en `MyClassesClient.tsx` (web) y `my-classes.tsx` (mobile) muestra un banner amarillo con count de `pending_payment + payment_submitted` y botón "Ver en Historial" que cambia el tab activo.
- **Navegación a detalle desde feed/mis clases:** `ClassCard` muestra "Ver clase" para todos (incluyendo el profesor) — el botón "Editar" ya está dentro de `/class/[id]`. En `MyClassesClient` tab Dicto, el título de cada clase es un `<Link>` a `/class/[id]` con `e.stopPropagation()` para no colapsar el acordeón.
- **Descripción en posts tipo video:** campo `description TEXT` (nullable) en tabla `posts`. `CreatePostModal` y `create-post.tsx` (mobile) reemplazan el campo "Ciudad" por un textarea de descripción (max 280 chars, opcional). `PostCard` y `MobilePostCard` muestran la descripción bajo el video. La ciudad sigue existiendo en la columna pero ya no se pide ni muestra en posts.
- **Disponibilidad horaria:** tabla `user_busy_blocks` (weekday 0=Lun…6=Dom, hour 0-23) + columnas `sleep_start`/`sleep_end` en `profiles`. Utilitarios en `packages/shared/src/lib/availability.ts` (`isSleepHour`, `isBlockOccupied`, `getSleepHours`, `dateToWeekday`). UI en web `AgendaClient` y mobile `agenda.tsx` (sección "Mis horarios ocupados"): grid 7×24 con colores diferenciados para sueño (índigo), ocupado (coral), libre (gris). Config de sueño: selects en web, botones +/− en mobile. Toggle de bloques con persistencia directa en Supabase (carga lazy al abrir la sección, auto-save por bloque). Web y mobile en paridad funcional.
- **Auto-inscripción al aceptar audición:** `POST /api/class/auditions/enroll-accepted` — crea enrollments `pending_payment` para los alumnos aceptados al publicar resultados o cerrar audiciones. Usa `createAdminClient()`. `AuditionsListClient` (web) y `auditions.tsx` (mobile) llaman este route tras escribir cada decisión. El alumno aceptado ve "¡Fuiste aceptad@! Tu cupo está reservado" + botón "Ir a pagar" en lugar del formulario de audición. `canEnrollDirectly` para entrenamiento es ahora `!isEntrenamiento || !classData.requires_audition` (sin `|| audition_closed`).
- **`billing_day` en entrenamientos:** campo `SMALLINT DEFAULT 1 CHECK (1..27)` en `classes` (migración 025). Visible en `CreateClassForm`, `EditClassForm`, `ClassDetailClient` (badge "Cobro mensual el día N de cada mes"), `PaymentClient`, y detalle mobile. Forms mobile en `class/create.tsx` y `class/[id]/edit.tsx`.
- **Colores de eventos en agenda:** clases inscritas = sky-500 (`#0ea5e9`), clases que dicto = emerald-500 (`#10b981`), ensayos aceptados = violet-500 (`#8b5cf6`), ensayos pendientes = slate-400 (`#94a3b8`). Fix de `brand-600` = `#2D1B69` invisible en dark mode para eventos de enseñanza.
- **Notificaciones cross-user via API (sesión 2026-05-26 — alpha hardening):** la policy `notifications_insert_any` (`WITH CHECK (true)`) fue **eliminada** en migración 026 y reemplazada por `notifications_insert_self` (`auth.uid() = user_id`). Las inserciones para otros usuarios ahora pasan por `POST /api/notifications/send` (web `apps/web/src/lib/notifications.ts` → `sendNotifications`; mobile `apps/mobile/lib/notifications.ts` con Bearer token). El route usa `createAdminClient()` y valida por tipo: `follow/friend_*` → `data.from_user_id === sender`; `new_class/class_updated/class_cancelled/audition_accepted/audition_rejected/payment_confirmed/payment_rejected` → sender = `classes.teacher_id` de `data.class_id`; `new_audition` → sender tiene fila en `auditions` y recipient es el teacher. Cada batch debe ser un único tipo. Los cron y otros API routes que usan service role siguen insertando directo. **Nunca volver a `supabase.from('notifications').insert(...)` desde el cliente** — usar `sendNotifications()`.
- **`payment-receipts` bucket privado + signed URLs (sesión 2026-05-26):** migración 029 flipea `storage.buckets.public = false` y reemplaza la policy `SELECT USING(true)` con una que solo permite leer al uploader (estudiante) o al teacher de la clase asociada (via join `payments→enrollments→classes`). Para mostrar comprobantes, los componentes llaman a `GET /api/payment/receipt-url?paymentId=X` que valida y emite signed URL de 1h. `PaymentClient.tsx` (web) y `payment/[enrollmentId].tsx` (mobile) ahora guardan el **path** (no `getPublicUrl`) en `payments.receipt_url`. El cron `cleanup-classes` tolera ambos formatos (path puro y URL legacy con `/payment-receipts/<path>`).
- **`teacher_payment_info` con RLS restrictiva (sesión 2026-05-26):** migración 028 reemplaza `payment_info_select_all USING(true)` con SELECT permitido solo al propio profesor o a usuarios con enrollment activo (pending_payment/payment_submitted/confirmed) en alguna clase suya. `apps/web/src/app/(app)/class/[id]/page.tsx` ya no hace join con `payment_info`. El fetch se hace en `PaymentClient` (web) o `payment/[enrollmentId].tsx` (mobile) cuando el alumno carga su pantalla de pago.
- **Middleware con allow-list explícita de `/class/`:** solo `/class/:id` exacto es público; `/class/:id/edit`, `/class/:id/auditions`, etc. redirigen a login si no hay sesión. Las pages mantienen sus guards de ownership. Regex: `PUBLIC_CLASS_DETAIL = /^\/class\/[^/]+\/?$/`.
- **Helper `requireUser` para nuevos API routes:** `apps/web/src/lib/supabase/require-user.ts` — autentica request por Bearer token (mobile) o cookie (web) y devuelve `{ user }` o `{ error: NextResponse(401) }`. `@supabase/ssr ^0.4` ya valida el JWT contra Supabase Auth al llamar `getUser()`, por lo que sesiones revocadas son rechazadas en server-side.
- **`admin_actions` audit log (migración 027):** cada acción del panel superadmin (`delete_content`, `dismiss_report`) inserta una fila con `admin_id`, `target_table`, `target_id`, `report_id`, `reason`. RLS bloquea SELECT/INSERT cliente; solo service role puede tocar la tabla.
- **CRON_SECRET fortalecido:** `/api/cron/cleanup-classes` y `/api/cron/cleanup-unconfirmed` devuelven 503 si `process.env.CRON_SECRET` no está configurado (antes hubieran aceptado peticiones con `Bearer undefined`). `cleanup-unconfirmed` también amplió el margen de 24 h → 36 h para no eliminar cuentas que confirman en la ventana del cron, y loguea cada borrado.
- **Security headers en `next.config.js`:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`. CSP queda pendiente para post-alpha (requiere whitelist de Cloudinary/Supabase/MP).

**Soft-delete pattern (sesión 2026-05-27 — integridad de datos):**

El patrón oficial de soft-delete en DanzClass es `status='cancelled'` en la tabla `classes`. No usamos `deleted_at`. Aplicar el mismo patrón en cualquier tabla futura que necesite soft-delete para preservar historial. Queries de profesor **siempre** deben filtrar con `.in('status', ['active', 'completed'])` para excluir clases canceladas de conteos públicos.

**Vista `class_spots` y modelo de enrollment para periódicas (sesión 2026-05-27):**

`class_spots` (definida en `001_initial_schema.sql`) cuenta `enrollments WHERE session_id IS NULL AND status != 'cancelled'`. Esto es correcto para el modelo actual: **todas las inscripciones usan `session_id = NULL`** (inscripción global a la clase), incluso para clases periódicas/entrenamientos. `session_spots` existe en la DB pero no se usa. Cada mes de cobro en una clase periódica genera un nuevo registro en `payments` contra el mismo `enrollment.id`. Este modelo es simple y suficiente para MVP; migrar a session-based sería un refactor mayor post-alpha.

**`notification_type` constraint — diagnóstico antes de agregar tipos (sesión 2026-05-27):**

Cada migración que añade un nuevo tipo de notificación reescribe el CHECK constraint completo. Antes de agregar cualquier tipo nuevo, verificar el constraint actual en producción:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'notifications'::regclass AND conname = 'notifications_type_check';
```
El constraint en `023_rehearsals.sql` lista 22 tipos. Debe coincidir exactamente con `NotificationType` en `packages/shared/src/types/index.ts`. Si divergen, crear migración correctiva antes de insertar el nuevo tipo.

**Rehearsals — patrón dual RLS + admin client (sesión 2026-05-27):**

Las rutas `/api/rehearsal/*` usan `createAdminClient()` + verificación manual de acceso. Las queries de páginas (feed, agenda, my-classes) usan el cliente regular con RLS habilitado. **Ambos patrones coexisten**: no asumir que eliminar las policies de RLS es seguro solo porque los API routes usan admin client — las pages dependen de ellas. La policy RLS de `rehearsals` permite SELECT al `creator_id` o a cualquier invitado con fila en `rehearsal_invites`.

**Audiciones — modo edición de postulación pendiente (sesión 2026-05-27):**

`AuditionModal` (web: `components/class/AuditionModal.tsx`; mobile: inline en `class/[id]/index.tsx`) acepta prop `existing?: AuditionExisting | null`. Si `existing.status === 'pending'`, el modal hace UPDATE en lugar de INSERT y no reenvía notificación al profesor. Si `status` es `accepted`/`rejected`, `isEdit = false` y se bloquea el botón desde UI. `ClassDetailClient.tsx` pasa `existing={myAudition}` siempre; el modal decide si es edit o insert.

**Storage — archivos huérfanos (sesión 2026-05-27):**

Los siguientes casos generan archivos huérfanos en Supabase Storage que **no se limpian automáticamente**:
- Avatar antiguo al subir uno nuevo (`EditProfileForm`, bucket `avatars`) — el path viejo queda en Storage.
- Video/thumbnail de un post al eliminarlo (`PostCard.tsx` solo hace `posts.delete()`, no borra Storage).
- Comprobante de pago de un enrollment cancelado (bucket `payment-receipts`).
- Media de una clase al hacer soft-delete (limpiado por cron diario `cleanup-classes`, que sí borra class_media rows y Storage objects).
Solución MVP: aceptar el leak y limpiar manualmente o via cron post-alpha. Priorizar fix post-alpha para avatares y posts.

---

## Componentes UI clave (`apps/web/src/components/`)

| Componente | Descripción |
|---|---|
| `ui/TopBar.tsx` | Barra superior con badge de notificaciones sin leer |
| `ui/BottomNav.tsx` | Nav inferior; "Publicar" → `/publish` para `canTeach` |
| `ui/Avatar.tsx` | Avatar con fallback a iniciales |
| `ui/ConfirmDialog.tsx` | Modal de confirmación con backdrop, modo destructivo |
| `ui/MonthCalendar.tsx` | Calendario para fechas custom; prop `disablePast` para crear clase |
| `ui/CityCombobox.tsx` | Combobox con ciudades chilenas + texto libre |
| `ui/StarRating.tsx` | Display mode: texto `★ 4.7 (23 valoraciones)` en amarillo; interactive: 5 estrellas ★ clicables con hover. Props: `value, count?, size?, interactive?, onChange?` |
| `ui/RatingModal.tsx` | Modal para calificar un profesor; llama `/api/ratings/upsert`; solo enteros 1–5 |
| `ui/RatingPopup.tsx` (web) | Popup post-clase que verifica inscripciones pendientes de calificar; llama `/api/ratings/upsert` |
| `ui/LogoutButton.tsx` | Cerrar sesión; prop `asButton` para renderizar como pill |
| `ui/ReportModal.tsx` | Modal denuncia; llama `/api/reports` (no inserta directo); dark mode completo |
| `ui/DateInput.tsx` | Fecha en DD/MM/AAAA; almacena YYYY-MM-DD; sin `type="date"` |
| `ui/LogoIcon.tsx` | SVG del logo oficial; usa `fill="currentColor"` — controlar color con className |
| `feed/ClassCard.tsx` | Card clase: tono lila, cupos x/y, badge, precios 2x, fondo emerald en precio |
| `feed/PostCard.tsx` | Video adaptivo; menú ⋮ autor; botón denuncia no-autores |
| `feed/FeedClient.tsx` | Feed unificado clases+posts con filtros |
| `feed/ExploreClient.tsx` | Búsqueda con filtros de usuarios |
| `feed/UserCard.tsx` | Card usuario con follow + amistad |
| `feed/CreatePostModal.tsx` | Modal crear video con visibilidad; Cloudinary o fallback |
| `class/ClassDetailClient.tsx` | Carrusel sin crop; dropdown amigos 2x; `TwoxRequestButton`; botón "Ver fechas"; botón Compartir; soporte anónimo; UI lista de espera cuando `isFull` |
| `class/CustomDatesCalendar.tsx` | Calendar modal solo lectura con fechas destacadas |
| `class/CreateClassForm.tsx` | Form con `DateInput`, `class_type` opcional, `onWheel` desactivado en números |
| `class/EditClassForm.tsx` | Ídem + zona peligrosa con eliminar |
| `class/TwoxRequestButton.tsx` | Estado: buscando / emparejado con turno de pago / transferir |
| `class/FriendsTwoxList.tsx` | Sección feed: amigos buscando 2x; race condition feedback |
| `class/AuditionsListClient.tsx` | Decisiones locales en borrador; batch "Publicar resultados" |
| `class/DiscountModal.tsx` | Modal descuento profesor; llama `/api/class/discount` |
| `class/AuditionModal.tsx` | Formulario postulación alumno |
| `class/MyClassesClient.tsx` | Tabs tomo/dicto/historial, deudores, banner eliminación, resumen mensual profesor |
| `class/DashboardClient.tsx` | Dashboard profesor |
| `notifications/NotificationsClient.tsx` | Lista con todos los tipos de notificación |
| `payment/PaymentClient.tsx` | Comprobante; detecta 2x; botón transferir turno |
| `plans/SubscribeButton.tsx` | Mensual (crédito) y anual (cualquier medio vía MP) |
| `publish/PublishChoiceClient.tsx` | Elección Clase vs Video |
| `profile/EditProfileForm.tsx` | Edición completa perfil |
| `profile/TeacherProfileClient.tsx` | Perfil público: ratings (avg stars), stats, amistad, posts filtrados |
| `profile/PaymentInfoForm.tsx` | Datos bancarios del profesor |
| `admin/AdminReportsClient.tsx` | Reportes pendientes con acciones delete/dismiss |

---

## Tipos relevantes (`packages/shared/src/types/index.ts`)

```typescript
type SubscriptionTier = 'none' | 'basic' | 'teacher' | 'pro'
// 'teacher' mantenido solo por compatibilidad DB; eliminado de UI

type NotificationType =
  | '2x_request' | '2x_match' | '2x_payment_turn'
  | 'friend_request' | 'friend_accepted'
  | 'payment_confirmed' | 'payment_rejected'
  | 'follow' | 'new_class' | 'class_updated' | 'class_cancelled' | 'class_discount'
  | 'debt_warning' | 'new_report'
  | 'audition_accepted' | 'audition_rejected' | 'new_audition'
  | 'class_reminder' | 'waitlist_available'

canTeach(tier)          // basic | teacher | pro
canTeachUnlimited(tier) // teacher | pro
canUploadVideo(tier)    // basic | teacher | pro
```

---

## Decisiones técnicas importantes

**Logo oficial — `LogoIcon` (SVG inline):**
El logo es una marca geométrica tipo "D" construida con rectángulos (sin dependencia de fuentes externas). Para web: `ui/LogoIcon.tsx` usa `fill="currentColor"` — el color se controla con clases Tailwind (`text-brand-600 dark:text-brand-300`). Para mobile: `components/ui/LogoIcon.tsx` usa `react-native-svg` con prop `color`. `Music2`/`Music` de lucide se conserva solo en roles semánticos (empty states, notificaciones de clase, filtros de género) — no como logo.

**TypeScript + Supabase — "Type instantiation is excessively deep":**
Queries con joins anidados superan el límite de inferencia. Fix: `(supabase as any).from(...)` o `.select('...' as any)`.

**`DateInput` en vez de `type="date"`:**
Chrome ignora el atributo `lang` y muestra el formato del OS. Se usa `type="text"` + `inputMode="numeric"` con auto-formateo de barras al escribir dígitos. El estado interno es YYYY-MM-DD.

**`visibility` en posts:**
Columna TEXT con CHECK ('public'/'followers'/'friends'). Reemplaza `is_public` booleano desde migración 009.

**`class_type` en clases:**
Columna TEXT nullable ('coreografía'/'freestyle'/'otro'). Schema Zod usa `z.preprocess((v) => v === '' ? undefined : v, z.enum(...).optional())` para tolerar el string vacío del `<select>`.

**Video adaptivo en PostCard:**
`<video>` con `w-full h-auto max-h-[85vh]` sin `aspect-video`. El navegador renderiza el ratio nativo.

**Carrusel en ClassDetailClient:**
`bg-black min-h-[240px]` como contenedor; imágenes con `object-contain max-h-[70vh]`; videos con `max-h-[85vh]`. Sin crop.

**ReportModal → API route:**
No inserta directo en Supabase desde el cliente. Llama a `POST /api/reports` que usa service role para insertar + notificar al superadmin.

**Superadmin sin rol en DB:**
Identificado solo por `SUPERADMIN_USER_ID` env var comparado server-side.

**Race condition en 2x match:**
API filtra `.eq('status', 'looking')`; si dos usuarios matchean simultáneo, el segundo recibe 404 y el frontend lo muestra y quita la entrada.

**Soft-delete clases:**
`UPDATE classes SET status='cancelled'`, preserva historial de enrollments y pagos. Al soft-deletar desde `ClassDetailClient.handleDeleteClass`, se borran inmediatamente los objetos de Storage de `class-media` + sus filas en `class_media`. El cron diario actúa como red de seguridad.

**Eliminación de cuenta — soft-delete con tombstone:**
`POST /api/account/delete` (acepta Bearer + cookie): anonimiza perfil (`full_name='Usuario eliminado'`, `username='deleted_<timestamp>'`, campos personales a null), pone `deleted_at=now()`, cancela subscriptions activas, cambia el email en `auth.users` a `deleted-{uuid}@deleted.danzclass.internal` (tombstone) para impedir re-login, firma-out. El usuario no puede volver a entrar. Hard-delete post-30 días pendiente de cron (deuda técnica conocida). Pantalla web: `/profile/delete-account`; mobile: `profile/delete-account.tsx`. Link visible en `/profile` y pantalla de perfil mobile.

**Política de precio al momento de pago:**
El precio mostrado y cobrado al alumno en `PaymentClient` es siempre el precio vigente de la clase al momento de pagar (incluyendo descuentos activos). No se congela el precio al momento de inscripción. Esto es intencional: permite que descuentos espontáneos beneficien a alumnos con inscripción pendiente. `PaymentClient` muestra un disclaimer explicando esto.

**Webhook MP — idempotencia de renovaciones (sesión 2026-05-29):**
La tabla `subscription_renewals (id, subscription_id, mp_subscription_id, mp_payment_id UNIQUE, processed_at)` (migración 032) previene que un `subscription_authorized_payment` reenviado por MP extienda `expires_at` doble. Antes de extender, el webhook verifica que el `eventDataId` (ID del authorized_payment) no existe en esa tabla; si ya existe, loguea y retorna 200. Además, el webhook ahora rechaza con 400 cualquier evento con `data.id` vacío en el query string.

**`/api/class/enroll` — validaciones adicionales (sesión 2026-05-29):**
El endpoint ahora rechaza inscripciones a: (1) clases tipo `suelta` con `date` pasado → 400 `class_expired`; (2) clases periódicas con `ends_at` vencido y `ends_indefinitely=false` → 400 `class_expired`; (3) clases con `requires_audition=true` sin audición `accepted` del alumno → 403 `audition_required`. El frontend ya oculta el botón, pero estas validaciones protegen la API contra POSTs directos.

**Suscripción cancelada con tiempo restante (sesión 2026-05-29):**
`getCancelledPendingExpiry(userId, supabase)` en `lib/subscription.ts` busca suscripciones con `status='cancelled'` y `expires_at > now`. Usado en `plans/page.tsx` para mostrar banner ámbar "Tu suscripción fue cancelada. Tienes acceso hasta DD/MM/YYYY." `getActiveSubscription` solo retorna suscripciones `active/grace`; la función nueva es complementaria. Re-suscribirse antes de `expires_at` crea una nueva suscripción activa (el registro cancelado queda en la tabla como historial).

**`SubscriptionPolling` — fallback de activación (sesión 2026-05-29):**
`/api/subscriptions/status` (GET, cookieauth) devuelve `{ tier }` para polling cliente. `SubscriptionPolling` hace polling cada 2 s hasta 30 s; si `tier !== 'none'` antes del timeout muestra "activa", si timeout muestra mensaje de procesamiento. La página `/plans/success` activa la suscripción server-side antes del render (idempotente), así el polling solo actúa si el webhook fue más rápido que el render o si los params no llegaron.

**2x stale cleanup en cron (sesión 2026-05-29):**
El cron `cleanup-classes` cancela enrollments `is_2x=true` + `status=pending_payment` con `created_at` de más de 7 días. Cancela el partner_enrollment si también está `pending_payment`, voidea payments de ambos, notifica con `class_cancelled` (data: `{ reason: '2x_payment_timeout' }`). El contador se loguea como `cancelled_2x=N`.

**`DiscountModal` — toggle notificar alumnos inscritos (sesión 2026-05-29):**
Checkbox "Notificar también a alumnos inscritos con pago pendiente" (off por default). Si activado, `/api/class/discount` envía `class_discount` a enrollments `pending_payment` excluyendo los ya notificados como seguidores (deduplicación por `followerIds` Set). El precio con descuento ya aplica automáticamente al leer en runtime; el toggle solo controla la notificación.

**Reembolso en `EnrolledTab` (sesión 2026-05-29):**
Cuando `cls.status === 'cancelled'` y `enrollment.status === 'confirmed'`, se muestra el label "(clase cancelada)" y el link "Solicitar reembolso al profesor" → `/teacher/[username]`. El botón **no es un mailto** porque el email del profesor no está en `profiles` (solo en `auth.users`). El flujo de reembolso es manual: el alumno contacta al profesor via su perfil público. Documentar en `/terms` que los reembolsos se gestionan externamente (pendiente post-alpha).

**Inputs numéricos — bloquear caracteres inválidos:**
Todos los `<input type="number">` de precios, cupos, duración y billing_day tienen `onKeyDown={noExp}` donde `noExp` bloquea `e`, `E`, `+`, `-`, `.`, `,`. También tienen `step="1"` y rangos razonables (`max=10_000_000` para precios, `max=1000` para cupos, etc.). Función helper `noExp` definida en `CreateClassForm.tsx` y `EditClassForm.tsx`.

**Validación MIME de comprobantes — magic bytes:**
`PaymentClient.onDrop` valida magic bytes del archivo antes de subir: `ffd8` (JPEG), `89504e47` (PNG), `25504446` (PDF), `52494646` (WEBP). Si no coincide o el MIME type no está en la allowlist, se rechaza con alert. La policy de Storage ya limita a 10MB y tipos imagen/PDF como segunda capa.

**Banner naranja (fecha eliminación archivos) — solo TeachingTab:**
El banner coral con fecha de eliminación de archivos solo aparece en el loop `classData` del `TeachingTab` en `MyClassesClient`. No se renderiza en `EnrolledTab`. Comportamiento consciente y confirmado.

**`/api/class/leave` — manejo de pagos al salir:**
Al cancelar enrollment, se marcan como `void` todos los payments del enrollment con `status IN ('pending', 'payment_submitted')`. Al re-inscribirse desde `cancelled`, el endpoint `/api/class/enroll` voidea pagos no confirmados previos antes de reactivar el enrollment. Esto evita pagos huérfanos en el historial del profesor.

**Cron seguridad:**
`CRON_SECRET` validado con `Authorization: Bearer` header que Vercel inyecta automáticamente.

**Notificaciones cross-user:**
Política RLS `notifications_insert_any` con `WITH CHECK (true)`.

**Lista de espera — `waitlist(count)` en queries Supabase:**
Devuelve `[{ count: N }]` como array de un elemento. Extraer con `cls.waitlist[0]?.count ?? 0`. Usado en MyClassesClient (web) y my-classes.tsx (mobile).

**`/api/class/leave` usa `createAdminClient`:**
El alumno que se va necesita leer la tabla `waitlist` (cuya política RLS solo permite ver al propio usuario o al profesor de la clase) para notificar al primero en espera. Se usa service role para bypasear RLS en ese fetch puntual.

**Scroll en campos numéricos:**
Todos los `<input type="number">` tienen `onWheel={(e) => (e.target as HTMLInputElement).blur()}`.

**Modo oscuro (web):** ✅ Completo (sesión 2026-05-19)

- Estrategia: `darkMode: 'class'` en `tailwind.config.ts` + `next-themes` (`ThemeProvider` en root layout)
- Toggle: `ThemeToggle.tsx` (sun/moon), solo en `/profile` — esquina superior derecha
- Persistencia: `localStorage` automático vía next-themes; fallback a `prefers-color-scheme`
- Tokens dark en tailwind: `dark-bg` (#1A1035), `dark-surface` (#241547), `dark-surface2` (#2E1B5C), `dark-border` (#3D2870), `dark-text` (#EEEDFE), `dark-text2` (#A39BBF)
- Overrides globales en `globals.css`: `.dark .input`, `.dark .card`, `.dark .btn-secondary`, `.dark body`
- Todos los componentes migrados ✅

**Modo oscuro (mobile):** ✅ Completo (sesión 2026-05-19)

- Estrategia: NativeWind `useColorScheme` + `setColorScheme` con clase `dark` en root view
- Context: `apps/mobile/context/ThemeContext.tsx` — `useTheme()` expone `theme`, `toggleTheme`; persiste con `AsyncStorage` (clave `'app_theme'`)
- Toggle: pantalla de perfil propio (`(tabs)/profile.tsx`)
- Mismos tokens dark que web: `dark-bg`, `dark-surface`, `dark-surface2`, `dark-border`, `dark-text`, `dark-text2`
- Todas las pantallas mobile migradas ✅

**Reglas obligatorias para evitar texto invisible en dark mode (sesión 2026-05-22):**

Al agregar cualquier texto, borde, ícono o fondo de color en la app, respetar estas reglas sin excepción:

1. **Objetos de colores estáticos** — los objetos tipo `const STATUS_COLORS = { pending: 'bg-yellow-50 text-yellow-700 border-yellow-200' }` solo funcionan en light mode. Siempre agregar variantes dark en la misma string:

   ```ts
   pending: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400'
   ```

   Aplica a: `LEVEL_COLORS`, `ENROLL_STATUS`, `PAYMENT_STATUS`, `PAYMENT_PILL`, `NOTIF_CONFIG`, y cualquier mapa similar.

2. **Inline `style` con colores** — `style={{ backgroundColor: '#f5f3ff' }}` no soporta dark mode. Convertir siempre a NativeWind `className` equivalente: `className="bg-blanco-violeta dark:bg-dark-surface2"`. Nunca usar hex hardcodeado en `style` para fondos o textos que deban ser distintos en dark.

3. **Stroke de íconos Lucide en mobile** — `stroke="#374151"` es gris oscuro: invisible sobre fondo oscuro. Siempre usar `stroke={isDark ? '#EEEDFE' : '#374151'}` requiriendo `const { isDark } = useTheme()`. Importar desde la ruta correcta según profundidad:
   - `app/(app)/(tabs)/` → `'../../../context/ThemeContext'`
   - `app/(app)/class/[id]/` → `'../../../../context/ThemeContext'`
   - `app/(app)/class/` o `app/(app)/profile/` o `app/(app)/teacher/` → `'../../../context/ThemeContext'`
   - `components/` → `'../../context/ThemeContext'`

4. **Cards de alerta con color** (amarillo, rojo, azul, verde) — siempre incluir dark en bg, border Y texto. Patrón:

   ```tsx
   // Amarillo
   className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
   // texto: text-yellow-700 dark:text-yellow-400, título: text-yellow-900 dark:text-yellow-300
   
   // Rojo
   className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
   // texto: text-red-700 dark:text-red-400 / text-red-600 dark:text-red-400
   
   // Verde
   className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
   // texto: text-green-700 dark:text-green-400
   
   // Azul
   className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800"
   // texto: text-blue-700 dark:text-blue-400
   
   // Brand/violeta
   className="bg-brand-50 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/50"
   // texto: text-brand-700 dark:text-brand-300, valor: text-brand-900 dark:text-brand-200
   ```

5. **Divisores** — `<div className="h-7 w-px bg-gray-200" />` es invisible sobre `dark-bg`. Siempre: `bg-gray-200 dark:bg-dark-border`.

6. **Texto `text-gray-900`** sin dark — en dark mode es negro sobre negro. Toda aparición de `text-gray-900` debe llevar `dark:text-dark-text`. Igual para `text-gray-700` → `dark:text-dark-text2`, `text-gray-500` → `dark:text-dark-text2`, `text-gray-400` → `dark:text-dark-text2/60`.

7. **Pills de estado en mobile con `style` inline** — `PAYMENT_PILL_COLORS` con hex en `style={{ backgroundColor, color, borderColor }}` no adapta al dark mode. Usar NativeWind class strings y `className` en su lugar (ver implementación actual en `my-classes.tsx`).

8. **`text-brand-600` sobre fondos oscuros** — `brand-600` en `tailwind.config.ts` es `#2D1B69` (navy oscuro), que desaparece sobre `dark-surface2` (`#2E1B5C`). Todo uso de `text-brand-600` en íconos dentro de contenedores que cambian a `dark:bg-dark-surface2` requiere `dark:text-brand-300`. Ejemplo: `<Calendar className="h-6 w-6 text-brand-600 dark:text-brand-300" />`. La BottomNav ya usa este patrón correctamente (`isActive ? 'text-brand-600 dark:text-brand-300'`).

**Sistema de valoraciones (ratings) — reemplaza TrustButton/EndorsementPopup (sesión 2026-05-22):**

- Tabla `ratings` en Supabase (migration 019): `(rater_id, rated_user_id, enrollment_id, stars)` UNIQUE por rater+rated
- `TrustButton.tsx` y `EndorsementPopup.tsx` (web) **eliminados** — reemplazados por sistema de estrellas
- `StarRating` rediseñado: display = texto `★ 4.7 (23 valoraciones)` en `text-yellow-500`; interactive = 5 ★ unicode clicables con hover amarillo. Sin SVG ni LinearGradient.
- API route `/api/ratings/upsert`: soporta Bearer token (mobile) y cookies (web); verifica inscripción confirmada con el profesor antes de permitir el upsert; retorna `{ ok, avgRating, ratingCount }`
- `RatingModal` + `RatingPopup` (web) usan la API route (no insertan directo)
- Mobile: `components/ui/RatingPopup.tsx` — slide-up Modal que verifica clases finalizadas pendientes de calificar; llama a la API route
- Feed mobile: batch-fetch de ratings de profesores al cargar clases; se pasa como prop `teacherRating` a `MobileClassCard`
- Perfiles (`/profile` web + `(tabs)/profile.tsx` mobile): muestran `StarRating` bajo `canTeach(tier)` guard; reemplazaron la query de `trust_endorsements`
- `TeacherProfileClient.tsx`: stats row muestra avg stars con count

**Admin reports — join FK a auth.users (sesión 2026-05-22):**

`reporter:profiles!reporter_id` falla silenciosamente porque `reporter_id` tiene FK a `auth.users`, no a `profiles`. Fix en `/admin/page.tsx`: fetch de reports sin join, luego fetch separado de profiles por IDs y merge manual en `reporterMap`.

**Fechas YYYY-MM-DD — off-by-one (sesión 2026-05-22):**

`new Date('YYYY-MM-DD')` parsea como UTC midnight → en Chile (UTC-3/UTC-4) muestra el día anterior. Fix: detectar string de solo fecha con regex y construir con `new Date(y, m-1, d)` (tiempo local). Aplica en `apps/web/src/lib/utils.ts` → `formatDate()` y en todas las funciones `formatDate` en mobile.

**payment.map crash al confirmar inscripción (sesión 2026-05-22):**

`e.payment` en enrollments puede ser un objeto single (no array) cuando Supabase devuelve un join one-to-one. Fix en `MyClassesClient.tsx`: `Array.isArray(e.payment) ? e.payment.map(...) : e.payment`.

**Explore web — filtros colapsables (sesión 2026-05-19):**

- Ícono `SlidersHorizontal` con badge de count de filtros activos; panel expandible/colapsable
- Estado activo en morado-flow (`#7F77DD`); inactivo en gris
- Eliminado el tab "Profesores" — solo "Clases" y "Personas" con sus subfiltros

**Explore mobile — filtro por género (sesión 2026-05-19):**

- Panel de filtros colapsable con `SlidersHorizontal` + badge count
- Chips de estilos de baile (`DANCE_STYLES` de `@danceclass/shared`) filtran clases y usuarios en tiempo real
- Estado activo en morado-flow

**Disponibilidad — weekday encoding (sesión 2026-05-24):**

`user_busy_blocks.weekday`: 0=Lunes, 6=Domingo (NO el estándar JS donde 0=Domingo). Igual que `DAYS_OF_WEEK` del shared package y que la agenda. `dateToWeekday(date)` en `packages/shared/src/lib/availability.ts` convierte un Date al índice correcto.

**Disponibilidad — sueño cruzando medianoche:**

Si `sleep_start > sleep_end` (ej. 23 → 7), `isSleepHour` lo maneja correctamente: `hour >= sleepStart || hour < sleepEnd`. Si `sleep_start === sleep_end`, se interpreta como "sin configuración" (retorna false). La UI aún no valida que el sueño tenga sentido (usuario podría poner 8 → 8), pero la lógica lo tolera sin crash.

**`user_busy_blocks` — toggle sin race condition:**

El bloque se actualiza optimísticamente en el estado local antes del await de Supabase. Si falla el insert/delete, el estado queda desincronizado pero no se muestra error (la próxima carga al reabrir la sección es la fuente de verdad). Aceptable para MVP.

**`/api/rehearsal/group-availability` — usa admin client para todos los fetches:**

A diferencia de otros API routes, este usa `createAdminClient()` para el fetch del rehearsal (no RLS). El acceso se verifica manualmente: `creator_id === user.id || invites.some(i => i.user_id === user.id)`. Usar el cliente regular (con RLS) causaba que el rehearsal no fuera encontrado en algunos escenarios, resultando en "0 integrantes" en el calendario de coordinación.

**Audiciones (entrenamiento) — `handleCloseAuditions` persiste borradores antes de cerrar:**

`handleCloseAuditions` (web `AuditionsListClient.tsx` + mobile `class/[id]/auditions.tsx`) primero publica cualquier decisión en borrador (`localDecisions`) con su notificación correspondiente, y luego cierra (`audition_closed = true`). Esto evita que decisiones aceptadas/rechazadas se pierdan al cerrar. La lógica es idéntica a `handlePublish` pero integrada en el cierre.

**Audiciones — Reabrir postulaciones:**

`handleReopenAuditions` permite al profesor deshacer un cierre accidental (`audition_closed = false`). NO resetea postulaciones ya aceptadas/rechazadas. NO reenvía notificaciones antiguas — solo los nuevos borradores generados después de reabrir recibirán notificaciones al cerrar nuevamente. UI: botón "Reabrir postulaciones" (lavanda suave) visible cuando `auditionClosed = true`; se alterna con "Cerrar postulaciones" (ámbar).

**Audiciones — auto-inscripción de aceptados (sesión 2026-05-27):**

Al publicar o cerrar audiciones, `enrollAccepted()` llama a `POST /api/class/auditions/enroll-accepted` con los `applicantIds` aceptados. El route usa `createAdminClient()` y hace upsert: crea enrollment `pending_payment` si no existe ninguno activo, o lo reactiva si estaba `cancelled`. `canEnrollDirectly` para entrenamiento ya no incluye `|| classData.audition_closed` — así los usuarios rechazados o sin postulación nunca ven "Reservar cupo" tras el cierre. El alumno aceptado siempre verá el `EnrollmentBanner` con "Ir a pagar".

**Colores agenda — sky/emerald/violet/slate (sesión 2026-05-27):**

Los eventos de agenda en web (`AgendaClient.tsx`) y mobile (`agenda.tsx`) usan colores semánticamente diferenciados: sky-500 (inscrito), emerald-500 (enseño), violet-500 (ensayo aceptado), slate-400 (ensayo pendiente). Esto reemplaza el uso de `#7F77DD` para todo y de `brand-600` (`#2D1B69`) para enseñanza, que era invisible en dark mode.

---

## Variables de entorno (todas configuradas en Vercel ✅)

| Variable | Descripción |
|---|---|
| `APP_URL` | `https://dc-project-web.vercel.app` |
| `MERCADOPAGO_ACCESS_TOKEN` | Token producción MP |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto webhook MP |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para admin client |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloud name de Cloudinary |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Preset de upload Cloudinary |
| `SUPERADMIN_USER_ID` | UUID del superadmin (⚠️ verificar si está configurado) |
| `CRON_SECRET` | Secreto para el cron job (⚠️ verificar si está configurado) |

---

## Deploy

- **No buildear localmente** — Node.js v12 es incompatible con Next.js. Todo build va a Vercel.
- Verificar errores TypeScript manualmente antes de cada push.
- Cambiar variables `NEXT_PUBLIC_*` requiere un nuevo deploy (se incrustan en el bundle).
- **Supabase producción:** Site URL `https://dc-project-web.vercel.app`, Redirect URLs `https://dc-project-web.vercel.app/**`.

---

## Estado actual — Conversión mobile ✅ COMPLETA

Todas las pantallas mobile han sido implementadas. Web y mobile están en paridad funcional.

### Pantallas mobile implementadas

| Pantalla | Ruta mobile | Estado |
|---|---|---|
| Feed | `(tabs)/feed.tsx` | ✅ |
| Explorar | `(tabs)/explore.tsx` | ✅ filtros colapsables + filtro por género |
| Publicar | `(tabs)/create.tsx` | ✅ |
| Perfil propio | `(tabs)/profile.tsx` | ✅ toggle dark mode |
| Mis clases | `(tabs)/my-classes.tsx` | ✅ |
| Detalle clase | `class/[id]/index.tsx` | ✅ |
| Crear clase | `class/create.tsx` | ✅ |
| Editar clase | `class/[id]/edit.tsx` | ✅ |
| Publicar video | `class/create-post.tsx` | ✅ |
| Perfil ajeno | `teacher/[username].tsx` | ✅ |
| Notificaciones | `notifications.tsx` | ✅ |
| Planes | `plans/index.tsx` | ✅ |
| Pago | `payment/[enrollmentId].tsx` | ✅ |
| Editar perfil | `profile/edit.tsx` | ✅ |
| Datos transferencia | `profile/payment-info.tsx` | ✅ |
| Login | `(auth)/login.tsx` | ✅ |
| Registro | `(auth)/register.tsx` | ✅ |

### Funcionalidades futuras (post-MVP)

- Notificaciones push (Expo Notifications)
- Sistema 2x en mobile
- Descuentos espontáneos en mobile
- OCR de comprobantes
- Dashboard analytics
- Renovación anual automática

### Consideraciones técnicas mobile

- **`(supabase as any).from(...)`** para joins anidados o tablas sin tipo
- **`expo-web-browser`**: `WebBrowser.openBrowserAsync(url)` para checkout MP
- **`expo-video`**: `useVideoPlayer(url, cb)` + `<VideoView contentFit="contain" />`
- **`expo-clipboard`**: `Clipboard.setStringAsync(value)`
- **NativeWind + SafeAreaView**: `edges={['top']}` en pantallas con header propio
- **Lucide íconos**: usar prop `stroke` (no `color`) — ver `apps/mobile/types/lucide.d.ts`
- **Dark mode**: `useColorScheme` de NativeWind + `ThemeContext` en `context/ThemeContext.tsx`
- **FAB (FloatingActionButton)**: `components/ui/FloatingActionButton.tsx` — solo visible si `canTeach(tier)`. Fetch del tier en el `init()` del feed junto al profile/follows/friends.
- **Error boundary**: `components/ui/ErrorBoundary.tsx` — class component que wrappea `<RootLayout>` en `_layout.tsx`. Muestra "Algo salió mal" + "Reintentar".
- **Pull-to-refresh**: `RefreshControl` en todos los ScrollView/FlatList de pantallas con datos remotos. Patrón: `load()` como `useCallback`, estado `refreshing` separado del `loading` inicial.
- **`pluralize(n, singular, plural)`**: helper en `packages/shared/src/types/index.ts`. Retorna `"N singular/plural"`. Usar en cualquier conteo de cupos, alumnos, clases para evitar "1 cupos".
- **`formatDateLocal(dateStr)`**: en shared, convierte YYYY-MM-DD a fecha local con `es-CL` sin off-by-one. Usar en lugar de `new Date('YYYY-MM-DD').toLocaleDateString()`.
- **`KeyboardAvoidingView` en formularios**: todos los formularios largos (create, edit, profile/edit, payment-info) tienen `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">` wrapping el `<ScrollView>`. Login/register ya lo tenían. Auth forms ya tenían KAV correcto.
- **`useEscapeKey` en modales web**: `apps/web/src/hooks/useEscapeKey.ts` — hook que agrega listener `keydown` para Escape. Importar en todos los modales y usar `useEscapeKey(onClose, !isLoading)`. Aplicado en: `ConfirmDialog`, `AuditionModal`, `DiscountModal`, `CreatePostModal`, `RatingModal`.

**Validadores compartidos (`packages/shared/src/lib/validators.ts`, sesión 2026-05-30):**
- `validateUsername(value)` — regex `^[a-z0-9_]{3,20}$`, retorna error string o null
- `validateRut(rut)` — valida dígito verificador chileno
- `validateFullName`, `validateBio`, `validateInstagramHandle`, `validateChileanPhone`
- Usados en: web `EditProfileForm`, mobile `profile/edit.tsx`; RUT validado en `PaymentInfoForm.tsx`

**`Avatar.tsx` con fallback a ícono User (sesión 2026-05-30):**
Cuando `getInitials(name)` retorna string vacío (nombre con solo emojis, nulo o caracteres no alfanuméricos), `Avatar` muestra `<User>` de lucide en lugar de un span vacío. `getInitials` también fue reforzado con regex Unicode `\p{L}\p{N}` para limpiar caracteres raros antes de extraer iniciales.

---

## Testing

### Comandos

```bash
npm run test:unit          # unit tests sin servidor (Node.js puro via Playwright runner)
npm run test:e2e           # E2E dev (requiere `npm run dev:web` corriendo en :3000)
npm run test:e2e:prod      # smoke tests read-only contra producción
npm run typecheck --workspace=apps/web  # typecheck sin build
```

### Estructura

```text
tests/
├── unit/
│   ├── availability.test.ts   # isSleepHour, isBlockOccupied, getSleepHours, dateToWeekday
│   ├── shared-helpers.test.ts # canTeach/Enroll/etc, pluralize, formatDateLocal
│   └── utils.test.ts          # formatTime, formatDate, getClassSessions
├── e2e/
│   ├── helpers/auth.ts        # loginAs() helper
│   ├── seed.ts                # seedClass/seedEntrenamiento/cleanSeed helpers
│   ├── classes.spec.ts
│   ├── posts.spec.ts
│   ├── auditions-billing-agenda.spec.ts
│   └── availability.spec.ts
└── e2e-production/            # smoke tests read-only (sin escritura en DB)
    ├── smoke.public.spec.ts
    ├── smoke.navigation.spec.ts
    ├── smoke.auth.spec.ts
    └── smoke.features.spec.ts
```

### CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada push a `main` y en PRs:

- **typecheck**: `tsc --noEmit` en `apps/web`
- **test-unit**: unit tests sin servidor
- **smoke-prod** (opcional): requiere variable `RUN_SMOKE_TESTS=true` + secrets `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`

### Seed de datos E2E

`tests/e2e/seed.ts` provee `seedClass()`, `seedEntrenamiento()`, `cleanSeed()`, `cleanAllTestData()`. Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` apuntando a una instancia de **test** (nunca producción). Las clases creadas se titulan `[TEST] ...` para facilitar limpieza manual.

### Tests críticos faltantes (post-alpha)

Los siguientes flujos no tienen test automatizado todavía:

- Registro → confirmación email → login (requiere servidor de email en CI)
- Suscripción sandbox MP (requiere cuenta comprador MP sandbox)
- Inscripción + pago completo (requiere Next.js dev server en CI)

---

## Observabilidad y monitoreo (sesión 2026-05-27)

**Logger estructurado (`apps/web/src/lib/logger.ts`):**
Helper JSON-structured con `logger.info`, `logger.warn`, `logger.error`. Emite objetos `{ level, event, ...meta, ts }` a `console.log/warn/error` — Vercel los indexa como JSON y permite filtrar por `level` o `event` en el log explorer. Usar en todos los API routes críticos (ya aplicado en cron y webhook).

**Sentry (`@sentry/nextjs` ^8):**
- Paquete agregado a `apps/web/package.json`. Se instala en el próximo deploy de Vercel.
- Config cliente: `apps/web/sentry.client.config.ts` — lee `NEXT_PUBLIC_SENTRY_DSN`, `tracesSampleRate: 0.1`, ignora errores de red/fetch.
- Config server: `apps/web/sentry.server.config.ts` — lee `SENTRY_DSN` o `NEXT_PUBLIC_SENTRY_DSN`.
- Init server via `apps/web/src/instrumentation.ts` (Next.js 14 stable instrumentation hook).
- `next.config.js` wrappea con `withSentryConfig` dentro de un try/catch (no rompe si el paquete no está instalado localmente con Node v12).
- **Acción pendiente del usuario:** crear cuenta Sentry free → obtener DSN → agregar `NEXT_PUBLIC_SENTRY_DSN` en Vercel.

**Healthchecks.io para crons:**
Ambos crons (`cleanup-classes`, `cleanup-unconfirmed`) llaman a `https://hc-ping.com/<UUID>` al final de cada ejecución exitosa. Si el ping no llega en 26h → alerta al admin.
- Env vars: `HEALTHCHECK_CLEANUP_CLASSES_UUID` y `HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID`.
- El ping falla silenciosamente (try/catch, timeout 5s) — nunca bloquea el cron.
- **Acción pendiente del usuario:** crear cuenta en healthchecks.io → crear 2 monitores (schedule diario, grace 2h) → agregar UUIDs en Vercel.

**Realtime badge de notificaciones (`NotificationBell.tsx`):**
`TopBar` usa el componente `NotificationBell` (client component) en lugar del Link+Bell estático. Recibe `initialCount` y `userId`; suscribe a Supabase Realtime (`postgres_changes INSERT` en tabla `notifications` filtrado por `user_id`). Al llegar una nueva notificación, incrementa el badge en tiempo real sin recargar la página. Al navegar a `/notifications`, resetea el badge a 0. Requiere que la tabla `notifications` tenga Realtime habilitado en el dashboard de Supabase.

**Cloudinary en `remotePatterns`:**
`next.config.js` ahora incluye `res.cloudinary.com` como dominio permitido para `next/image`. Esto permite usar `<Image>` en lugar de `<img>` para thumbnails de Cloudinary en iteraciones futuras.

**N+1 queries — verificado no existe:**
`my-classes/page.tsx` carga todo con `Promise.all` de queries nested (Supabase joins). No hay loops de fetches secuenciales.

**Backups Supabase:**
Free tier no tiene backups automáticos. Para alpha: hacer dump manual semanal con `supabase db dump > backup_YYYYMMDD.sql` o upgrade a Pro ($25/mes) que incluye daily backups.

**`AlphaBanner` — banner de reporte de bugs para alpha (sesión 2026-05-27):**
`apps/web/src/components/ui/AlphaBanner.tsx` — client component con estado `visible` inicializado desde `sessionStorage` (`alpha_banner_dismissed`). Se muestra como una barra violeta fixed bajo el TopBar (`top-14`). Incluye link `mailto:contacto@danzclass.com?subject=Bug%20DanzClass` y botón de dismiss. Montado en `apps/web/src/app/(app)/layout.tsx` justo después de `<TopBar />`. En mobile: link "¿Encontraste algo raro? Reportar" en el bloque de botones del perfil propio (`(tabs)/profile.tsx`) usando `Linking.openURL('mailto:...')`.

---

## Procedimientos de rollback (alpha)

Estos procedimientos aplican si algo falla catastróficamente en las primeras 24-48 h post-launch.

**1. Frontend Vercel rollback (~2 min):**
Dashboard Vercel → proyecto → Deployments → click en el deploy anterior → "Promote to Production". No requiere git.

**2. Migración DB rollback:**
Cada migración debe tener un SQL inverso documentado aquí. Las migraciones de DanzClass son principalmente additive (ADD COLUMN, CREATE TABLE) — hacer rollback de ellas borra datos. Antes de deployar en producción, anota el SQL inverso:

```sql
-- Ejemplo: rollback de 025_billing_day.sql
ALTER TABLE classes DROP COLUMN IF EXISTS billing_day;
```

Para rollback de constraint (notification_type), recrear con el CHECK anterior.

**3. Mobile EAS rollback:**
Si hay un build OTA (Expo Updates): publicar el canal con la versión anterior usando `eas update --channel production --branch <branch-anterior>`.
Si es un build nativo con nueva versión de store: el rollback es publicar la versión anterior del APK/IPA directamente (Google Play / TestFlight permiten promover builds anteriores).

**4. Webhook MP — modo silencioso:**
Si el webhook de MP tiene bugs y está procesando mal suscripciones:

1. Cambiar el handler a responder `200 OK` sin procesar: `return NextResponse.json({ received: true })` en las primeras líneas.
2. Loguear todos los eventos recibidos para procesamiento manual posterior.
3. No deshabilitar el webhook en el dashboard de MP — si falla, MP reintenta y puede saturar logs.

**5. Feature flags manuales (sin sistema formal):**
Para desactivar features durante alpha sin rollback completo, agregar un env var `NEXT_PUBLIC_DISABLE_<FEATURE>=true` y condicionar el render. Candidatos: `DISABLE_2X`, `DISABLE_DISCOUNTS`, `DISABLE_ENSAYOS`. Requiere nuevo deploy de Vercel (variables `NEXT_PUBLIC_*` se incrustan en el bundle).

---

## Estado actual — Alpha pública (sesión 2026-05-27)

La app está lista para invitar a los primeros usuarios alpha. Todos los P0 del plan de pre-lanzamiento han sido implementados. Acciones pendientes del usuario antes del go-live:

- Verificar env vars en Vercel (especialmente `MERCADOPAGO_ACCESS_TOKEN` en producción, no sandbox)
- Confirmar que migraciones 024 y 025 están aplicadas en Supabase producción
- Configurar Sentry DSN (`NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN`)
- Build EAS para Android (`eas build --platform android --profile preview`)
- Crear tag git `alpha-v0.1.0` en el commit de launch
- Backup pre-launch: `supabase db dump > backups/pre-alpha-2026-05-27.sql`

---

## Funcionalidades futuras (no prioritarias para MVP)

- Notificaciones push Expo
- Sistema 2x en mobile
- Descuentos de último minuto en mobile
- OCR de comprobantes
- Dashboard analytics para profesores
- Renovación anual automática
