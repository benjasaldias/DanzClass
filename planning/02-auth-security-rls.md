# Sesión 2 — Autenticación, seguridad y RLS

> **Objetivo de la sesión:** garantizar que ningún usuario puede ver, modificar o eliminar datos fuera de su scope. Eliminar rutas/funcionalidades de testing del bundle de producción. Endurecer el uso del service role.

## Instrucciones obligatorias
- Cualquier cambio en una **policy RLS** debe ir en una migración nueva con número correlativo (`026_*.sql`).
- Toda ruta API que usa `createAdminClient()` debe documentar **por qué** el RLS no alcanza y **qué guard manual** está aplicando.
- Al terminar, **actualizar `CLAUDE.md`** con cualquier patrón nuevo (ej. nuevo helper de auth) y **`resumen.md`** con resumen de cambios.
- Completar el reporte de cierre al final.

---

## S-1 — `/design-system-preview` accesible en producción (P0)

**Archivos:**
- [apps/web/src/middleware.ts](../apps/web/src/middleware.ts) — `'/design-system-preview'` en `PUBLIC_ROUTES`.
- [apps/web/src/app/design-system-preview/page.tsx](../apps/web/src/app/design-system-preview/page.tsx)
- [apps/web/src/lib/design-system-preview/mockData.ts](../apps/web/src/lib/design-system-preview/mockData.ts)

**Riesgo:**
- Cualquiera con la URL accede a todos los componentes y datos mock.
- Si entra a Google Search ("site:dc-project-web.vercel.app"), puede aparecer como página real → daño reputacional.
- El bundle JS aumenta innecesariamente.

**Acción:**
1. Eliminar la carpeta `apps/web/src/app/design-system-preview/` y `apps/web/src/lib/design-system-preview/` antes del alpha.
2. Quitar `'/design-system-preview'` de `PUBLIC_ROUTES`.
3. Quitar el test `tests/e2e/design-system-preview.spec.ts`.
4. (Alternativa) Si se quiere preservar: protegerlo con `if (process.env.NEXT_PUBLIC_ENABLE_DESIGN_SYSTEM_PREVIEW !== 'true') return notFound()` en el `page.tsx` y mantenerlo behind env var solo en dev.

**Verificación:**
- Visitar `https://dc-project-web.vercel.app/design-system-preview` → debe retornar 404.

---

## S-2 — Middleware `/class/*` totalmente público (P1)

**Archivos:**
- [apps/web/src/middleware.ts](../apps/web/src/middleware.ts) línea con `pathname.startsWith('/class/')`

**Hallazgo:**
- El middleware permite cualquier ruta `/class/...` sin auth, incluido `/class/[id]/edit`, `/class/[id]/auditions`.
- Cada page hace su propio `redirect('/auth/login')` server-side. **Funciona hoy**, pero es frágil: cualquier developer que añada `/class/[id]/admin-stuff/page.tsx` sin guard expone datos.

**Acción:**
1. Cambiar la regla a allow-list explícita:
   ```ts
   const PUBLIC_CLASS_PATHS = (pathname: string) =>
     /^\/class\/[^/]+\/?$/.test(pathname) // solo la ruta exacta /class/:id, NO subrutas
   ```
2. Toda subruta de `/class/[id]/` (edit, auditions) requiere login → el middleware redirige, las pages siguen con sus guards de ownership.

**Verificación:**
- Cerrar sesión → visitar `https://.../class/<id>/edit` → debe redirigir a login.
- Visitar `https://.../class/<id>` → debe seguir mostrando la página pública.

---

## S-3 — `notifications_insert_any` permite spoofing cross-user (P1)

**Archivos:**
- [supabase/migrations/006_notification_types.sql](../supabase/migrations/006_notification_types.sql) — policy `WITH CHECK (true)`
- Múltiples API routes que insertan notifications (ratings, enroll, leave, audition, etc.)

**Hallazgo:**
- La policy actual permite a **cualquier usuario autenticado** insertar una notificación para **cualquier** otro usuario, con cualquier `type` y `data`.
- Un atacante puede enviar notificaciones falsas (`payment_confirmed`, `audition_accepted`) a otros usuarios desde el cliente, sin pasar por nuestra API.

**Acción:**
1. Migración nueva `026_notifications_policy_admin_only.sql`:
   ```sql
   DROP POLICY IF EXISTS notifications_insert_any ON notifications;
   CREATE POLICY notifications_insert_self ON notifications
     FOR INSERT WITH CHECK (auth.uid() = user_id);
   ```
   *(solo el destinatario puede insertarse a sí mismo notificaciones — flujo de "marcar como leída" requiere UPDATE no INSERT)*
2. Confirmar que **todas** las inserciones cross-user pasan por API routes con `createAdminClient()` (que bypasea RLS).
3. Auditar rutas que aún inserten notificaciones desde el cliente directo (revisar grep `from('notifications').insert`).

**Verificación:**
- Desde DevTools en producción, intentar `supabase.from('notifications').insert(...)` para otro user_id → debe retornar 403.

---

## S-4 — `SUPERADMIN_USER_ID` como env var sin audit log (P2)

**Archivos:**
- [apps/web/src/app/(app)/admin/page.tsx](../apps/web/src/app/(app)/admin/page.tsx)
- [apps/web/src/app/api/admin/content-action/route.ts](../apps/web/src/app/api/admin/content-action/route.ts)

**Hallazgo:**
- Si la env var se rota o se borra accidentalmente, el panel queda en estado indefinido.
- No hay log de "el superadmin eliminó el post X el día Y por razón Z" más allá del campo `status='reviewed'` en `reports`.

**Acción:**
1. Crear tabla `admin_actions (id, admin_id, action_type, target_table, target_id, reason, created_at)`.
2. Cada acción del panel admin (`delete`, `dismiss`) inserta en `admin_actions`.
3. Considerar (post-alpha) migrar el `SUPERADMIN_USER_ID` a una tabla `admins (user_id, role)` con RLS estricta.

**Verificación:**
- Eliminar un post desde `/admin` → ver fila nueva en `admin_actions` con timestamp + razón.

---

## S-5 — Service role usado ampliamente en routes — superficie de ataque (P2)

**Hallazgo:**
- Routes que usan `createAdminClient()`:
  - `/api/class/enroll` — OK (necesita escribir enrollments cross-user)
  - `/api/class/leave` — OK (necesita leer waitlist con RLS restrictivo)
  - `/api/class/auditions/enroll-accepted` — OK (admin batch op)
  - `/api/rehearsal/[id]` — OK (RLS no permite leer rehearsals donde no eres invitado)
  - `/api/rehearsal/respond` — OK
  - `/api/rehearsal/group-availability` — OK
  - `/api/reports` — OK
  - `/api/ratings/upsert` — OK
  - `/api/class/discount` — OK (notifica seguidores)
  - `/api/mercadopago/webhook` — OK
  - `/api/cron/cleanup-classes` — OK
  - `/api/cron/cleanup-unconfirmed` — OK

**Riesgo:**
- Cualquier bug en una de estas rutas que omita la verificación de identidad permite escalada total.
- Ej: si un atacante puede llamar `/api/class/leave` con un `enrollmentId` que no es suyo → ¿el código verifica `enrollment.student_id === userId`?

**Acción:**
1. Para cada route arriba, verificar línea por línea:
   - Auth (Bearer o cookie) presente
   - Match del `userId` con el recurso modificado (no solo "estoy logueado")
2. Crear helper compartido `requireUser(request, opts)` que devuelva `userId` o lance 401.
3. Crear helper `requireOwnership(userId, table, recordId, ownerColumn)` que valide antes de modificar.

**Verificación:**
- Test Playwright: usuario A intenta cancelar `enrollmentId` que pertenece a usuario B → debe recibir 403.

---

## S-6 — `auth.getUser()` en server components no verifica con servidor (P1)

**Hallazgo:**
- En múltiples páginas, `await supabase.auth.getUser()` desde `createClient()` (cookies) lee la cookie sin re-verificar el JWT contra el servidor.
- Si la sesión fue revocada (logout en otro device), la cookie aún tiene el JWT válido por su TTL.

**Acción:**
1. En `middleware.ts` y server pages críticas (admin, payment, profile/edit, profile/payment-info), usar `supabase.auth.getUser()` que ya valida contra el servidor (en `@supabase/ssr`).
2. Verificar que la versión de `@supabase/ssr` instalada (`^0.4.0`) hace la verificación servidor-side por defecto.
3. Documentar en CLAUDE.md.

---

## S-7 — RLS de tablas críticas — auditoría de cobertura (P1)

**Acción:**
1. En Supabase SQL editor correr:
   ```sql
   SELECT tablename, hasinserts, hasselects, hasupdates, hasdeletes
   FROM pg_tables JOIN pg_policies USING (tablename)
   WHERE schemaname = 'public';
   ```
2. Verificar que cada tabla tiene policy para SELECT/INSERT/UPDATE/DELETE — o si no tiene, justificar.
3. Tablas mínimo críticas:
   - `profiles` — INSERT solo trigger, UPDATE solo self, DELETE bloqueado (soft-delete vía campo).
   - `subscriptions` — SELECT self, INSERT/UPDATE solo service role.
   - `enrollments` — SELECT self o profesor; INSERT/UPDATE/DELETE solo service role o self con guards.
   - `payments` — SELECT self o profesor; INSERT solo self con `enrollment.student_id = auth.uid()`.
   - `classes` — SELECT all (público); INSERT/UPDATE/DELETE solo teacher (`teacher_id = auth.uid()`).
   - `class_media` — INSERT/UPDATE/DELETE solo teacher de la clase.
   - `posts`, `auditions`, `rehearsals`, `rehearsal_invites`, `ratings`, `reports`, `trust_endorsements`, `dismissed_debts`, `friendships`, `follows`, `waitlist`, `user_busy_blocks`, `class_2x_requests`, `notifications`, `auditions`, `teacher_payment_info` — todas deben tener policies acordes al modelo.

**Verificación:**
- Generar matriz `tabla x operación x permite` y revisarla con el modelo de datos esperado.

---

## S-8 — `teacher_payment_info` — datos bancarios accesibles a alumnos (P1)

**Archivos:**
- Schema `teacher_payment_info` (banco, tipo cuenta, número, RUT, titular)

**Hallazgo:**
- En `/class/[id]/page.tsx` se hace join `teacher:profiles!teacher_id(*, payment_info:teacher_payment_info(*))`.
- Esto expone los datos bancarios del profesor a **cualquier usuario que ve la clase**, incluyendo visitantes anónimos (ruta pública).
- Lógicamente, el alumno solo necesita ver los datos bancarios cuando **paga su cuota** (al subir comprobante), no en el listado general.

**Acción:**
1. En `ClassDetailClient`, no pasar `payment_info` al cliente.
2. En `PaymentClient.tsx` (donde realmente se necesita), hacer un fetch separado solo cuando el usuario tiene `enrollment` activo.
3. Considerar policy RLS en `teacher_payment_info` que solo permita SELECT al teacher mismo o a usuarios con enrollment activo en una clase suya.

**Verificación:**
- Visitar `/class/[id]` en incógnito → inspeccionar JS hidratado → no debe contener número de cuenta del profesor.

---

## S-9 — Validación de uploads de Storage (P1)

**Hallazgo:**
- Buckets:
  - `class-media` (50MB, image/video) — público
  - `posts-media` (100MB, image/video) — público
  - `avatars` (5MB, image) — público
  - `payment-receipts` (10MB, image/PDF) — público (?)
  - `audition-videos` (100MB, video) — privado

**Riesgo:**
- ¿`payment-receipts` es público? Si sí, alguien con la URL puede ver el comprobante de cualquier usuario.
- Buckets públicos con tamaño grande son blanco de hotlinking → costos.

**Acción:**
1. Confirmar visibility de `payment-receipts` en Supabase Storage → debe ser **privado** y los profesores ven mediante URL firmada.
2. Si está como público: cambiarlo a privado y migrar `PaymentClient` a generar `createSignedUrl(60 * 60)` cuando el profesor solicita ver.
3. Documentar en CLAUDE.md la decisión y patrón.

---

## S-10 — Rate limiting ausente (P1)

**Hallazgo:**
- Cero rate limiting en API routes. Un atacante puede:
  - Spam de notificaciones (si arreglamos S-3, pero antes).
  - Spam de `/api/reports` (denuncia masiva).
  - Spam de creación de clases (vaciar quotas si tier ilimitado).
  - Brute force de login (Supabase Auth tiene su propio, verificar configuración).

**Acción:**
1. Instalar `@upstash/ratelimit` + Upstash Redis (free tier).
2. Aplicar a rutas críticas: `/api/reports`, `/api/class/discount`, `/api/class-2x/match`, `/api/auth/*`, `/api/account/delete` (cuando se cree).
3. Configurar en Supabase Auth: max attempts login, captcha tras N fallos.

**Verificación:**
- Hacer 20 POST a `/api/reports` en 1 minuto → debe retornar 429 a partir del N-ésimo.

---

## S-11 — CORS y headers de seguridad (P2)

**Hallazgo:**
- `apps/web/next.config.js` (verificar) — ¿define `headers()` para CSP, X-Frame-Options, Permissions-Policy?
- Si no, la app es vulnerable a clickjacking embedidos en iframes maliciosos.

**Acción:**
1. Añadir en `next.config.js`:
   ```js
   async headers() {
     return [{ source: '/(.*)', headers: [
       { key: 'X-Frame-Options', value: 'DENY' },
       { key: 'X-Content-Type-Options', value: 'nosniff' },
       { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
       { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
     ]}]
   }
   ```
2. Considerar CSP (post-alpha, complicado por Cloudinary/Supabase domains).

---

## S-12 — `email_confirmed_at` y cleanup-unconfirmed — race condition (P2)

**Archivos:**
- [apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts](../apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts)
- [supabase/migrations/018_is_confirmed_profiles.sql](../supabase/migrations/018_is_confirmed_profiles.sql)

**Hallazgo:**
- Cron diario a las 04:00 UTC elimina cuentas no confirmadas > 24 h.
- Si el usuario confirma exactamente en la ventana de ejecución del cron, su cuenta puede eliminarse igual.
- El cron usa `email_confirmed_at IS NULL` lo cual debería ser atómico, pero confirmar.

**Acción:**
1. Cambiar criterio a `created_at < now - interval '36 hours'` (margen extra).
2. Logger cada eliminación con causa.

---

## S-13 — Cron sin autenticación robusta (P1)

**Archivos:**
- [apps/web/src/app/api/cron/cleanup-classes/route.ts](../apps/web/src/app/api/cron/cleanup-classes/route.ts)
- [apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts](../apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts)

**Hallazgo:**
- Vercel cron inyecta `Authorization: Bearer ${CRON_SECRET}`.
- Si `CRON_SECRET` no está configurado en Vercel, ambas rutas pueden ejecutarse por cualquiera con un `curl`.

**Acción:**
1. **Forzar** check de `CRON_SECRET`:
   ```ts
   if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
     return new Response('Unauthorized', { status: 401 })
   }
   ```
2. Si la env var no existe, devolver 503 (no 500) y loguear.

**Verificación:**
- Hacer `curl https://.../api/cron/cleanup-classes` sin header → 401.

---

## Reporte de cierre — Sesión 2026-05-26

### ✅ Logrado

| Hallazgo | Migración | Archivos modificados | Notas |
|---|---|---|---|
| S-1 — eliminar design-system-preview | — | `apps/web/src/middleware.ts`, eliminados `apps/web/src/app/design-system-preview/`, `apps/web/src/lib/design-system-preview/`, `tests/e2e/design-system-preview.spec.ts` | Página devuelve 404 en prod (Next.js servirá su not-found) |
| S-2 — middleware `/class/*` allow-list | — | `apps/web/src/middleware.ts` | Solo `/class/:id` exacto es público; subrutas exigen sesión |
| S-3 — cerrar `notifications_insert_any` | `026_notifications_policy_admin_only.sql` | nuevo `apps/web/src/lib/supabase/require-user.ts`, nuevo `apps/web/src/app/api/notifications/send/route.ts`, nuevo `apps/web/src/lib/notifications.ts`, nuevo `apps/mobile/lib/notifications.ts`. Migrados 12 call sites: TeacherProfileClient, UserCard, CreateClassForm, EditClassForm, AuditionsListClient, AuditionModal, ClassDetailClient, MyClassesClient (web) + teacher/[username], class/create, class/[id]/edit, class/[id]/auditions, class/[id]/index, (tabs)/my-classes (mobile) | Validación por tipo: `follow/friend_*` (sender match), `new_class/class_updated/cancelled/audition_accepted/rejected/payment_confirmed/rejected` (teacher de la clase), `new_audition` (postulante con audición en esa clase). Cron sigue usando admin client. |
| S-4 — admin_actions audit log | `027_admin_actions.sql` | `apps/web/src/app/api/admin/content-action/route.ts` | Cada `delete_content` / `dismiss_report` inserta fila con `admin_id`, `action_type`, `target_table/id`, `report_id`, `reason` |
| S-5 — auditoría ownership en API routes | — | — | Ya correcto: `/api/class/leave`, `/api/class/enroll`, `/api/class/discount`, `/api/class-2x/match`, `/api/class-2x/transfer-payment`, `/api/reports`, `/api/admin/content-action`, `/api/rehearsal/{create,update,invite,respond,group-availability,[id]}`, `/api/ratings/upsert`, `/api/class/auditions/enroll-accepted` — todos validan `user.id` contra el recurso. Helper `requireUser` introducido para nuevos routes; no se generaliza `requireOwnership` por ahora (cada caso usa joins distintos). |
| S-8 — `teacher_payment_info` privado | `028_lock_teacher_payment_info.sql` | `apps/web/src/app/(app)/class/[id]/page.tsx` (sin join `payment_info`) | RLS SELECT solo a teacher o alumno con enrollment activo. Mobile `payment/[enrollmentId]` ya hace su propio fetch al cargar el pago. |
| S-9 — payment-receipts privado + signed URLs | `029_private_payment_receipts.sql` | nuevo `apps/web/src/app/api/payment/receipt-url/route.ts`, web `PaymentClient.tsx` y mobile `payment/[enrollmentId].tsx` ahora guardan path; web `MyClassesClient.tsx`, `DashboardClient.tsx` y mobile `(tabs)/my-classes.tsx` solicitan signed URL; cron extrae path de path-puro o URL legacy | Bucket queda privado. Migration debe correrse Y verificar en Supabase Storage que `public=false` (la migración hace `UPDATE storage.buckets SET public=false`). Receipts subidos antes de la migración seguirán funcionando porque el route extrae el path de la URL legacy. |
| S-11 — security headers | — | `apps/web/next.config.js` | X-Frame-Options DENY, nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy bloquea camera/mic |
| S-12 — cleanup-unconfirmed | — | `apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts` | Ventana ampliada a 36 h; valida `CRON_SECRET` configurado; logger por delete |
| S-13 — CRON_SECRET fortalecido | — | `apps/web/src/app/api/cron/{cleanup-classes,cleanup-unconfirmed}/route.ts` | Si no hay env var → 503 (antes hubiera aceptado peticiones con `Bearer undefined`) |

### ⏳ Pendiente / decisiones de scope

| Hallazgo | Razón |
|---|---|
| S-6 — re-verificar `auth.getUser` en cada page | `@supabase/ssr` ^0.4 ya valida JWT contra Auth server al llamar `getUser()` (en middleware y server clients). No se hizo refactor adicional; documentado en CLAUDE.md. |
| S-7 — matriz RLS completa por tabla | Requiere correr SQL en Supabase (acceso del usuario). Se entregó como acción de usuario. |
| S-10 — rate limiting (Upstash) | Requiere cuenta Upstash y env vars. Marcado como acción pendiente del usuario; código no agregado para evitar dependencia incompleta. |
| Helper `requireOwnership` genérico | Cada route tiene una validación específica (joins distintos). Genérico añadiría abstracción sin valor inmediato. |

### ❌ Fallado

Ninguno.

### 🔁 Regresiones detectadas

- **Antes de aplicar la migración 026 en producción**: si las notificaciones-API route están deployadas pero la migración aún no corre, NADA se rompe (la policy abierta sigue activa, el route también funciona). Una vez aplicada la migración, los clientes que no hayan recibido el nuevo bundle quedarán sin poder insertar — pero solo afectaría a sesiones cacheadas viejas. Solución: deploy primero, luego migrar.
- **Antes de aplicar 028 en producción**: el flag `public=false` corta el endpoint `/object/public/...`. Los receipts viejos dejan de servirse por URL directa; la app ya migró a signed URLs vía el route → funcionará. Pero si el usuario tiene la URL antigua copiada en otro lado, romperá.

### 📌 Acciones del usuario pendientes

- [ ] Aplicar migración `026_notifications_policy_admin_only.sql` en Supabase prod
- [ ] Aplicar migración `027_admin_actions.sql` en Supabase prod
- [ ] Aplicar migración `028_lock_teacher_payment_info.sql` en Supabase prod
- [ ] Aplicar migración `029_private_payment_receipts.sql` en Supabase prod **y verificar** en Supabase Dashboard → Storage que el bucket `payment-receipts` aparece como Private
- [ ] Confirmar `CRON_SECRET` configurado en Vercel (si no, los crons devolverán 503)
- [ ] Confirmar `SUPERADMIN_USER_ID` en Vercel (panel admin queda sin acceso si falta)
- [ ] Verificar que `https://dc-project-web.vercel.app/design-system-preview` retorna 404
- [ ] Correr SQL S-7 en Supabase para auditar matriz de policies (`SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd`)
- [ ] (Opcional, post-alpha) Crear cuenta Upstash + agregar `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`; aplicar rate limiting en `/api/reports`, `/api/notifications/send`, `/api/class-2x/match`
- [ ] Cuando deploy esté listo, hacer push primero (clientes ven nuevo bundle con sendNotifications), luego aplicar migración 026 (deja de aceptar inserts cross-user RLS)

### 📝 Memoria actualizada

- [x] `CLAUDE.md` — sección "Decisiones técnicas importantes" con notificaciones cross-user vía API y signed URLs para payment-receipts; `requireUser` helper
- [x] `resumen.md` — bloque "Sesión 2026-05-26 — Seguridad y RLS alpha"
- [x] `planning/00-overview.md` — checkmark en sesión 1
