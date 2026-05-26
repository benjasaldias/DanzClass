# Sesión 4 — Integridad de datos y casos límite

> **Objetivo de la sesión:** ningún registro inconsistente, ninguna combinación de fechas/timezone/recurrencia que rompa la agenda, ninguna migración faltante en producción.

## Instrucciones obligatorias
- Verificar **producción** Supabase tabla por tabla (queries SQL de diagnóstico provistas).
- Toda nueva migración numerada secuencialmente (próxima es `026_*.sql`).
- Al terminar, **actualizar `CLAUDE.md`** (sección de migraciones) y **`resumen.md`**.

---

## D-1 — Migración `024_add_start_date_to_classes.sql` (P0) ⚠️

**Estado:** archivo existe en repo, **pendiente confirmar aplicación en producción** (según resumen.md sesión 2026-05-26).

**Acción:**
1. Ejecutar en Supabase SQL Editor:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'classes' AND column_name = 'start_date';
   ```
2. Si vacío → aplicar migración 024 manualmente.
3. Backfill recomendado tras aplicar:
   ```sql
   UPDATE classes
   SET start_date = COALESCE(start_date, date::date, created_at::date)
   WHERE start_date IS NULL AND type != 'suelta';
   ```

**Verificación:**
- Crear clase periódica → confirmar que `start_date` se guarda.
- Abrir Agenda → ver eventos de esa clase en las semanas siguientes.

---

## D-2 — Migración `025_billing_day.sql` (P0) ⚠️

**Estado:** archivo existe, pendiente confirmar producción.

**Acción:**
1. Verificar columna existe:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'classes' AND column_name = 'billing_day';
   ```
2. Aplicar si no existe.

**Verificación:**
- Crear entrenamiento con billing_day=15 → ver badge en detalle.

---

## D-3 — `getClassSessions` ancla virtual sin `start_date` (P1)

**Archivos:**
- [apps/web/src/lib/utils.ts](../apps/web/src/lib/utils.ts)
- [apps/mobile/lib/utils.ts](../apps/mobile/lib/utils.ts)

**Hallazgo:**
- Fix de sesión 2026-05-25: si `start_date` es null, deriva ancla virtual desde el día de la semana.
- Para `biweekly`, la fase real es desconocida → puede mostrar la semana incorrecta (off by one week).
- Tras aplicar D-1 + backfill, este fallback debería desactivarse.

**Acción:**
1. Tras backfill de D-1, agregar log/warning en `getClassSessions` cuando entra al path "ancla virtual".
2. Verificar en producción tras 1 semana: si el log sale → hay clases sin `start_date` que se escaparon.
3. Considerar query SQL de salud:
   ```sql
   SELECT COUNT(*) FROM classes
   WHERE type != 'suelta' AND start_date IS NULL AND status = 'active';
   ```
4. Si es 0, eliminar fallback en una sesión post-alpha.

---

## D-4 — Cron deduplicación por Set en memoria — frágil (P2)

**Archivos:**
- [apps/web/src/app/api/cron/cleanup-classes/route.ts](../apps/web/src/app/api/cron/cleanup-classes/route.ts)

**Hallazgo:**
- El cron fetch a `notifications` con `type='class_reminder'` del día y construye un Set `userId:classId`.
- Si el cron corre 2 veces (Vercel retry tras timeout), el segundo run podría notificar duplicado porque el Set se reconstruye solo desde el inicio de la ejecución.

**Acción:**
1. Usar `INSERT ... ON CONFLICT DO NOTHING` con UNIQUE index `(user_id, type, (data->>'class_id'), date_trunc('day', created_at))`.
2. Migración `026_dedup_class_reminders.sql`:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_class_reminder
   ON notifications (user_id, type, (data->>'class_id'), date_trunc('day', created_at))
   WHERE type = 'class_reminder';
   ```

---

## D-5 — `ratings.upsert` no valida que la clase finalizó (P2)

**Archivos:**
- [apps/web/src/app/api/ratings/upsert/route.ts](../apps/web/src/app/api/ratings/upsert/route.ts)
- [supabase/migrations/019_ratings.sql](../supabase/migrations/019_ratings.sql)

**Hallazgo:**
- El check actual: `enrollment.status === 'confirmed'` y `enrollment.student_id === userId`.
- No valida que la clase **ya ocurrió**. Un alumno puede inscribirse, confirmar pago, y al día siguiente dar 1 estrella aunque la clase aún no haya pasado.

**Acción:**
1. Para sueltas: validar `class.date < today`.
2. Para periódicas/entrenamientos: definir "primera sesión cumplida" (probablemente requiere `class_sessions` con `completed_at`).
3. Si la lógica es muy compleja, MVP: validar `enrollment.created_at < now - 7 días` (al menos pasó una semana).

---

## D-6 — Timezones: Chile (UTC-3 / UTC-4) y fechas almacenadas como `DATE` (P1)

**Archivos:**
- Múltiples lugares usan `new Date('YYYY-MM-DD')` y luego `formatDate`.

**Hallazgo:**
- El fix conocido (parsear con `new Date(y, m-1, d)` local) está aplicado.
- Pero `class_sessions` o `enrollments.created_at` son `TIMESTAMPTZ` — al renderearse en UI mobile/web pueden mostrar día anterior si el cliente está cerca de medianoche.
- Cron corre en UTC (03:00 UTC = medianoche Chile en verano, ~22 h en invierno).
- Recordatorios "24h antes" — ¿qué entiende el alumno? Si clase es Sábado 18:00 Chile, ¿recibe recordatorio Viernes 18:00 Chile (preferible) o Viernes 21:00 / 00:00 UTC?

**Acción:**
1. Estandarizar: toda fecha-pura (sin hora) es `DATE`. Toda fecha-hora es `TIMESTAMPTZ`.
2. Cron `cleanup-classes` calcular `tomorrow_chile` usando offset hardcodeado o `date_part('hour', now() AT TIME ZONE 'America/Santiago')`.
3. Tests unitarios para `formatDate`, `formatTime`, `getClassSessions` con fechas en bordes (1 enero, 31 diciembre).

---

## D-7 — Fecha de clase quincenal — "phase" desconocida desde recurrence (P2)

**Hallazgo:**
- "Quincenal" puede significar "cada 14 días" o "1° y 15° del mes". Hoy `getClassSessions` asume cada 14 días desde `start_date`.
- Si el profesor crea una quincenal pensando en "1 y 15", la app le va a mostrar fechas distintas.

**Acción:**
1. En `CreateClassForm`: explicación clara junto al selector "Cada 2 semanas desde la fecha de inicio".
2. Considerar agregar opción `'twice_monthly'` (1° y 15°) si feedback de profesores lo pide.

---

## D-8 — `custom_dates TEXT[]` sin validación de formato (P1)

**Hallazgo:**
- `custom_dates` se guarda como array de strings. Si por bug se cuela un `'2026-13-45'` o `'abc'`, la app intenta parsear y crashea silenciosamente (devuelve invalid Date).

**Acción:**
1. Migración con constraint: ya difícil con array TEXT.
2. Mejor: validar en cliente con regex `^\d{4}-\d{2}-\d{2}$` y en server route que crea/edita clase.
3. Considerar migrar a `custom_dates DATE[]` (tipo nativo Postgres) para que la DB lo valide.

---

## D-9 — Soft-delete contradictorio: `status='cancelled'` para clases vs `deleted_at` (P2)

**Hallazgo:**
- `classes` usa `status='cancelled'` para soft-delete.
- Otras tablas (posts, profiles) — verificar qué convención usan.
- Inconsistencia confunde queries y RLS.

**Acción:**
- Documentar el patrón actual en CLAUDE.md y aplicar consistentemente a futuras tablas.
- Opcional: añadir `deleted_at TIMESTAMPTZ` a todas + tipo `live` que combine en una vista.

---

## D-10 — Re-creación de clase eliminada — leak de datos viejos (P2)

**Hallazgo:**
- Si profesor elimina clase A (`status='cancelled'`) y luego crea clase B con el mismo título:
  - El feed muestra B (correcto).
  - Pero `MyClassesClient` tab Dicto puede listar también A (filtrar por `status='active'` en queries).

**Acción:**
- Auditar todas las queries de clases del profesor → siempre incluir `.eq('status', 'active')` o `.in('status', ['active','completed'])`.

---

## D-11 — Vista `class_spots` puede contar enrollments de sessions distintas (P1)

**Hallazgo:**
- Migración 001 define `class_spots` y `session_spots`. Verificar:
  - `class_spots.spots_taken` cuenta `enrollments WHERE class_id = X AND session_id IS NULL`.
  - `session_spots` cuenta por `session_id`.
- Si una clase periódica tiene `class_sessions` y enrollments, ¿qué cuenta `class_spots`?

**Acción:**
1. Inspeccionar definición exacta de `class_spots` en `001_initial_schema.sql`.
2. Confirmar: para periódicas, el modelo de cupos es por **sesión** (no por clase global). Si la app está mostrando `class_spots` para periódicas, está mostrando dato incorrecto.

---

## D-12 — `friendships` direccional (P2)

**Hallazgo:**
- `friendships(requester_id, addressee_id, status)`. Para buscar "soy amigo de X" hay que considerar ambas direcciones.
- Cualquier query que omita la condición OR produce false negatives.

**Acción:**
- Crear helper `isFriendOf(userA, userB)` que abstraiga la verificación bidireccional.
- Auditar todas las apariciones de `.from('friendships')`.

---

## D-13 — Constraint de `notification_type` desactualizado (P0 si aplica)

**Hallazgo:**
- Cada migración que añade un tipo reescribe el CHECK constraint completo (006, 008, 012, 013, 014, 015, 016, 020).
- Riesgo: si una migración futura olvida un tipo, queda imposible insertar ese tipo (constraint violation).

**Acción:**
1. SQL diagnóstico:
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass AND contype = 'c';
   ```
2. Verificar que el constraint actual lista TODOS los tipos del enum TypeScript (`NotificationType`).
3. Si difiere → migración 026 que actualice el constraint.

---

## D-14 — `auditions` — UNIQUE applicant+class, pero re-postulación bloqueada (P2)

**Hallazgo:**
- Una vez que el alumno postula a una clase, no puede modificar su postulación (UNIQUE constraint).
- Si subió video equivocado, queda atrapado.

**Acción:**
- UI: botón "Editar postulación" (UPDATE en lugar de INSERT) hasta que el profesor decida.
- Bloquear UPDATE una vez `status` no es `pending`.

---

## D-15 — `enrollments.session_id` mal usado para periódicas (P2)

**Hallazgo:**
- El modelo permite `session_id NULL` (inscripción a la clase global) o `session_id != NULL` (inscripción a una sesión específica).
- Hoy todo el código usa `session_id NULL` para todo tipo (incluso periódicas) → pierde la noción de "qué sesión está pagada".

**Acción:**
- Decidir si periódicas usan global enrollment (modelo actual, todos los meses con el mismo enrollment) o session-based.
- Si global: documentar que el modelo de pagos mensual usa el mismo enrollment con múltiples `payments` (uno por mes).
- Si session-based: refactor mayor — post-alpha.

---

## D-16 — `rehearsals` y `rehearsal_invites` — RLS bypaseada en todas las rutas (P1)

**Hallazgo:**
- Sesión 2026-05-26 confirmó: todas las rutas de rehearsal usan `createAdminClient()` con verificación manual.
- Esto significa que **el RLS de rehearsals no se usa nunca**. La policy actual es decoración.

**Acción:**
1. Revisar policies de `rehearsals` y `rehearsal_invites` — eliminarlas para no dar falsa sensación de seguridad.
2. O bien, arreglar las queries de cliente directo (si existen) para que funcionen con RLS y eliminar el admin client.

---

## D-17 — Limpieza de archivos huérfanos en Storage (P2)

**Hallazgo:**
- Avatar viejo cuando usuario sube uno nuevo — ¿se borra el anterior?
- Imágenes/videos de posts eliminados — ¿se borran?
- Comprobantes de pago cancelados — ¿se borran?

**Acción:**
- Auditar cada operación de UPDATE de avatar / DELETE de post → confirmar delete de Storage asociado.
- Si falta, agregar.

---

## D-18 — Datos huérfanos al eliminar usuario (P0 — depende de C-4)

**Hallazgo:**
- Cuando se implemente el delete account (C-4), decidir qué pasa con:
  - `classes` del profesor → cancelar / anonimizar
  - `enrollments` del alumno → mantener para historial
  - `posts` → eliminar / anonimizar
  - `ratings` dadas y recibidas → anonimizar
  - `notifications` → eliminar
  - `friendships`, `follows` → eliminar
  - `auditions` → mantener anonimizado
  - `messages` (si existen post-alpha) → eliminar

**Acción:**
- Documentar en `/privacy` y en una tabla de decisión interna.
- Implementar como parte de `/api/account/delete`.

---

## Reporte de cierre

### ✅ Logrado

| ID | Migración | Archivo |
|---|---|---|

### ⏳ Pendiente

| ID | Razón |
|---|---|

### ❌ Fallado

| ID | Causa |
|---|---|

### 📌 Acciones del usuario pendientes

- [ ] Aplicar migraciones 024, 025 si no estaban en prod
- [ ] Aplicar migración 026 (dedup class_reminder)
- [ ] Aplicar migración para notifications policy (S-3) — coordina con sesión 02
- [ ] Backfill `start_date` en producción

### 📝 Memoria a actualizar

- [ ] `CLAUDE.md` — sección "Migraciones SQL aplicadas" — actualizar
- [ ] `CLAUDE.md` — sección "Decisiones técnicas" — política de timezone, soft-delete
- [ ] `resumen.md` — bloque de sesión
