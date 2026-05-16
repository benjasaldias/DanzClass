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
- **`/class/[id]`** — detalle con carrusel, info, CTA de reservar
  - Profesor: editar, eliminar; Alumno: salir de la clase
  - Clases custom: botón **"Ver fechas"** abre `CustomDatesCalendar` con calendario de solo lectura destacando las fechas
- **`/class/[id]/edit`** — edición pre-rellenada con `class_type`

### ✅ Mis clases (`/my-classes`)
- Tabs: "Clases que tomo" / "Clases que dicto"
- Tab "Dicto": deudores globales + por clase, confirmación de pagos, eliminación de alumnos
- Banner naranja con fecha de eliminación de archivos (suelta: fecha+7d, periódica: fin de mes+7d)
- Sección post-eliminación con pagos pendientes y botón "Pago Confirmado"

### ✅ Notificaciones (`/notifications`)
- Tipos: follow, friend_request, friend_accepted, new_class, class_updated, class_cancelled, payment_confirmed, payment_rejected, 2x_request, 2x_match, **debt_warning**

### ✅ Perfil público (`/teacher/[username]`)
- Stats: clases dictadas, cupos pagados, cuántos confían
- Botón "Confío en este usuario" (toggle, muestra count)
- Popup post-clase preguntando recomendación (`EndorsementPopup`)
- Follow/unfollow, amistad completa (enviar/aceptar/eliminar)

### ✅ Perfil propio (`/profile`) — ACTUALIZADO sesión 2026-05-15
- Mismo layout rico que perfil ajeno: avatar, bio, ciudad, seguidores, stats, Instagram
- Botones de acción como pills: **Editar Perfil**, **Datos Transferencia** (solo si canTeach), **Cerrar Sesión**
- Banner de plan de suscripción justo debajo de los botones
- Estilos de baile (baila/enseña)
- Clases activas publicadas + inscripciones propias

### ✅ Posts/Videos
- `CreatePostModal` — sube video a **Cloudinary** (si configurado) o Supabase Storage como fallback; visibilidad: Público / Seguidores / Amigos
- `PostCard` — video adaptivo al ratio nativo (horizontal o vertical), sin `aspect-video` fijo
- Badge de privacidad en PostCard: ícono + label para `followers` y `friends`
- Botón de **denuncia** (flag) en header del PostCard — visible para quien no es el autor

### ✅ Sistema de denuncias (`ReportModal`)
- Modal con 4 razones predefinidas: infracción de derechos de autor, contenido inapropiado, spam, otro
- Descripción adicional opcional; UNIQUE constraint evita reportes duplicados
- **Posts:** botón flag en `PostCard` (solo para no-autores)
- **Clases:** botón "Reportar" en header de `ClassDetailClient` (solo para no-profesores)
- Reportes guardados en tabla `reports`; estado `pending/reviewed/dismissed` para gestión futura

### ✅ Términos de Uso (`/terms`)
- Página pública en `/terms` — 11 cláusulas en español, sin login requerido
- Cláusula 2: el usuario **declara ser titular de los derechos** sobre el audio y video que sube
- DanceClass se posiciona como plataforma intermediaria (safe harbor)
- **Registro** actualizado: checkbox obligatorio `z.literal(true)` que enlaza a `/terms`; no se puede crear cuenta sin aceptarlo

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
| `ui/ReportModal.tsx` | Modal de denuncia con 4 razones + descripción opcional |
| `feed/ClassCard.tsx` | Card de clase con tono lila, cupos x/y, badge estilo-tipo |
| `feed/PostCard.tsx` | Card de video con ratio adaptivo, badge de privacidad, botón de denuncia |
| `feed/FeedClient.tsx` | Feed unificado clases+posts con filtros |
| `feed/ExploreClient.tsx` | Explorar con filtros de usuarios |
| `feed/UserCard.tsx` | Card de usuario con follow + amistad |
| `feed/CreatePostModal.tsx` | Modal crear video con visibilidad p/s/amigos |
| `feed/PostCard.tsx` | Video adaptivo al ratio nativo |
| `class/ClassDetailClient.tsx` | Detalle con botón "Ver fechas" para clases custom |
| `class/CustomDatesCalendar.tsx` | Calendar modal de solo lectura con fechas destacadas |
| `class/CreateClassForm.tsx` | Formulario con class_type + límites plan básico |
| `class/EditClassForm.tsx` | Formulario de edición con class_type |
| `class/MyClassesClient.tsx` | Tabs tomo/dicto, deudores, banner eliminación |
| `notifications/NotificationsClient.tsx` | Lista con `debt_warning` |
| `payment/PaymentClient.tsx` | Pago con comprobante |
| `plans/SubscribeButton.tsx` | Mensual (crédito) y anual (cualquier medio) |
| `publish/PublishChoiceClient.tsx` | Elección Clase vs Video |
| `profile/EditProfileForm.tsx` | Edición completa del perfil |
| `profile/TeacherProfileClient.tsx` | Perfil público con trust, stats, amistad |
| `profile/PaymentInfoForm.tsx` | Datos de transferencia del profesor |

---

## Tipos relevantes (packages/shared/src/types/index.ts)

```typescript
type SubscriptionTier = 'none' | 'basic' | 'teacher' | 'pro'
// 'teacher' mantenido solo por compatibilidad DB; eliminado de UI y planes

type NotificationType =
  | '2x_request' | '2x_match'
  | 'friend_request' | 'friend_accepted'
  | 'payment_confirmed' | 'payment_rejected'
  | 'follow' | 'new_class' | 'class_updated' | 'class_cancelled'
  | 'debt_warning'

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
│   │   ├── class/[id]/page.tsx
│   │   ├── class/[id]/edit/page.tsx
│   │   ├── my-classes/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── payment/[enrollmentId]/page.tsx
│   │   ├── teacher/[username]/page.tsx
│   │   ├── profile/page.tsx              # ACTUALIZADO — layout rico
│   │   ├── profile/edit/page.tsx
│   │   ├── profile/payment-info/page.tsx
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
│   │   └── cron/cleanup-classes/route.ts  # NUEVA — limpieza diaria 03:00 UTC
│   ├── terms/page.tsx                    # NUEVA — página pública /terms
   └── auth/login/ + auth/register/
├── components/
│   ├── ui/ (TopBar, BottomNav, Avatar, ConfirmDialog, MonthCalendar,
│   │        CityCombobox, TrustButton, EndorsementPopup, LogoutButton,
│   │        ReportModal)
│   ├── feed/ (FeedClient, ClassCard, PostCard, ExploreClient,
│   │          UserCard, CreatePostModal)
│   ├── class/ (ClassDetailClient, CustomDatesCalendar, CreateClassForm,
│   │           EditClassForm, DashboardClient, MyClassesClient)
│   ├── notifications/ (NotificationsClient)
│   ├── payment/ (PaymentClient)
│   ├── plans/ (SubscribeButton, CancelSubscriptionButton)
│   ├── publish/ (PublishChoiceClient)
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
└── 011_drop_music_columns.sql          ✅ (elimina columnas music_* de posts)
```

---

## Pendientes

### ⚠️ Variable de entorno por verificar

- `CRON_SECRET` en Vercel → Settings → Environment Variables. Debe ser cualquier string aleatorio (p.ej. `openssl rand -base64 32`). Si no está, el cron de limpieza de archivos retorna 401.

### ⏳ Cloudinary — Setup pendiente

El código ya está integrado en `CreatePostModal`. Solo falta hacer el setup en Cloudinary y agregar las variables en Vercel. Ver instrucciones completas en la sección **Integración Cloudinary** más abajo.

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

## Próximos pasos — Conversión Mobile (PRIORIDAD)

La web está completa. El siguiente gran bloque es convertir/implementar todas las pantallas en la app mobile Expo.

### Antes de empezar
1. Explorar `apps/mobile/` para ver qué pantallas ya existen y en qué estado están.
2. Identificar qué lógica de `apps/web/src/` puede reutilizarse directamente vs qué necesita adaptación para React Native.

### Pantallas a implementar en mobile (basado en web)
| Pantalla | Ruta web | Notas |
|---|---|---|
| Feed | `/feed` | ClassCard + PostCard adaptados a RN; video nativo |
| Explorar | `/explore` | Search + UserCard en RN |
| Publicar | `/publish` | ChoiceSheet + CreateClassForm + video upload |
| Detalle clase | `/class/[id]` | Carrusel, inscripción, calendario custom |
| Mis clases | `/my-classes` | Tabs, deudores, banner eliminación |
| Perfil propio | `/profile` | Stats, botones, plan, estilos, clases |
| Perfil ajeno | `/teacher/[username]` | Follow, amistad, trust, endorsement |
| Notificaciones | `/notifications` | Lista tipos |
| Planes | `/plans` | MP checkout (usar `expo-web-browser` para abrir checkout) |
| Pago | `/payment/[id]` | Subir comprobante (ImagePicker) |
| Editar perfil | `/profile/edit` | Avatar, estilos, ciudad |
| Datos transferencia | `/profile/payment-info` | Datos bancarios del profesor |
| Crear/editar clase | `/create-class`, `/class/[id]/edit` | Form complejo con calendario |
| Auth | `/auth/login`, `/auth/register` | Ya puede existir |

### Consideraciones técnicas mobile
- **Pagos MP:** usar `expo-web-browser` para abrir el checkout de MP (no hay SDK nativo oficial)
- **Videos:** `expo-video` o `expo-av` para reproducción; `expo-image-picker` para selección
- **Storage uploads:** `supabase.storage.from(...).upload()` funciona igual que en web
- **Notificaciones push:** `expo-notifications` con Expo Push Notifications (pendiente MVP)
- **NativeWind:** ya configurado; la mayor parte de las clases Tailwind funcionan igual

### Funcionalidades futuras (no prioritarias para MVP)
- Notificaciones push Expo
- Sistema 2x (buscar compañer@ de baile)
- Descuentos de último minuto
- OCR de comprobantes
- Dashboard de analytics para profesores
- Renovación anual automática
