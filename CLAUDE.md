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
`UPDATE classes SET status='cancelled'`, preserva historial de enrollments y pagos.

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

---

## Funcionalidades futuras (no prioritarias para MVP)

- Notificaciones push Expo
- Sistema 2x en mobile
- Descuentos de último minuto en mobile
- OCR de comprobantes
- Dashboard analytics para profesores
- Renovación anual automática
