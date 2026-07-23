# Auditoría pre-release — Planificación de correcciones y mejoras

**Fecha:** 2026-07-22
**Alcance:** escaneo profundo de funcionalidad, integridad de datos, escalabilidad y UX antes de abrir la app a usuarios reales de testing.
**Naturaleza de este documento:** lista priorizada de hallazgos con evidencia (archivo:línea) y recomendación concreta. **No se modificó código.** El objetivo es que puedas filtrar qué vale la pena aplicar.

Prioridades:
- **P0 — Bloqueadores.** Correctitud / integridad de datos. Rompen la promesa central de la app (evitar sobrecupo) o silencian una feature completa. Arreglar antes de invitar usuarios.
- **P1 — Importantes.** Funcionalidad o UX con impacto real en el primer uso.
- **P2 — Escalabilidad.** No duele con 20 usuarios; sí con 2.000.
- **P3 — Detalles.** Pulido, inconsistencias menores, deuda acotada.

---

## Resumen ejecutivo

La app está madura y muy completa. Los hallazgos más serios **no son de features faltantes sino de tres puntos de integridad**:

1. **La inscripción puede sobre-vender cupos** (race condition read-check-insert sin candado atómico). Es exactamente el problema que la app promete resolver.
2. **La restricción `UNIQUE` de `enrollments` no previene inscripciones duplicadas** por cómo Postgres trata los `NULL`.
3. **Los posts con visibilidad "seguidores"/"amigos" son invisibles para su audiencia** — la RLS de `posts` nunca se actualizó cuando se introdujo la columna `visibility`. La feature está muerta en silencio.

Ninguno de los tres da error visible en una demo con un solo usuario, por eso probablemente pasaron desapercibidos. Los tres aparecen apenas hay concurrencia o relaciones sociales reales.

---

## ✅ Estado de resolución (2026-07-22)

**Todos los P0 y P1 fueron resueltos en código** (typecheck web limpio con Node 20). **P1-2 (expiración de descuentos) se dejó sin tocar por ser una decisión intencional de producto** (marcado por el usuario). Resumen:

| Ítem | Estado | Qué se hizo |
| --- | --- | --- |
| P0-1 Sobrecupo | ✅ Resuelto | Trigger `enforce_class_capacity` con lock por clase (`056`) + mapeo de error en `enroll/route.ts` |
| P0-2 Inscripción duplicada | ✅ Resuelto | Índice único parcial `enrollments_unique_active` (`056`) + manejo de `23505` en la ruta |
| P0-3 Posts invisibles | ✅ Resuelto | RLS `posts_select` reescrita con `visibility` + follows/friendships (`057`) |
| P1-1 Cupos fantasma | ✅ Resuelto | Auto-cancelación a 72h en el cron + notificación consciente del motivo (web + mobile) |
| P1-2 Descuentos no expiran | ⏸️ Intencional | Decisión de producto — no se modificó |
| P1-3 Webhook marketplace | ✅ Parcial | Verificación de monto agregada; la firma de split queda como gate de sandbox |
| P1-4 `already_enrolled` mudo | ✅ Resuelto | La ruta devuelve `enrollmentId`+`status`; cliente navega al pago (web + mobile) |
| P1-5 Perfil profesor gateado | ✅ Resuelto | `/teacher/[username]` agregado a rutas públicas del middleware |

**Escalabilidad (P2, 2026-07-22):** P2-1 (cupos vía `class_spots`), P2-2 (RPC `teacher_financial_summary` + migración `058`), P2-3 (batching del cron), P2-4 ("Cargar más" en el feed) **resueltos**. **P2-5 dejado intencionalmente como está** (el `getUser()` del middleware refresca la sesión; no tocar sin medir). De paso se corrigieron **dos bugs latentes** que tenían roto el Panel Financiero (columnas inexistentes `payments.created_at` y `classes.price_monthly`). Ver los bloques ✅ RESUELTO de cada P2.

**Detalles (P3, 2026-07-22): todos cerrados.** P3-1 (límite `max_spots` unificado en web **y** mobile), P3-3 (logging estructurado en rutas MP, sin volcar objetos completos de MP), P3-4 (salida accionable en el escáner QR ante pago pendiente), P3-6 (limpieza de huérfanos: media de posts, avatar por cambio de extensión, y **cron de purga de comprobantes a 90 días**). **P3-2** quedó resuelto como byproduct del batching de P2-3, y **P3-5** quedó cubierto por el índice único de P0-2 (no requirió cambio propio).

**Migraciones nuevas (pendientes de aplicar en Supabase producción):** `056_enrollment_integrity.sql`, `057_posts_visibility_rls.sql`, `058_teacher_financial_summary.sql`. Todas idempotentes/aditivas con rollback documentado en su header. **Hasta aplicar 056/057, las protecciones P0 no están activas en prod; hasta aplicar 058, el Panel Financiero sigue roto** (llama a un RPC que aún no existe en prod).

> ⚠️ **DEPENDENCIA DE ORDEN — `056` requiere `055` aplicada primero.** El trigger de capacidad referencia `enrollments.hold_expires_at` (columna que agrega `055_late_payment_holds_and_archive.sql`). Según el registro de la sesión 2026-07-19, **`055` todavía está pendiente de aplicar en producción.** Aplicar las migraciones **en orden** (055 → 056 → 057) lo resuelve automáticamente; nunca aplicar 056 sin 055. Se detectó justamente al validar contra el stack local (que estaba en 051).
>
> ✅ **Validado funcionalmente** contra el stack local de Supabase (Postgres real, no solo typecheck): probado que el trigger bloquea el sobrecupo (2º alumno con 1 cupo → `class_full`), el índice bloquea la inscripción duplicada (mismo alumno → `23505`), la reactivación respeta el cupo, confirmar un pago NO se bloquea aunque la clase esté llena, y un hold vencido libera el cupo. La primera versión del `RAISE` tenía un bug (`MESSAGE` duplicado) que la prueba detectó y se corrigió.

**Detalle por ítem:** ver cada sección abajo (bloque **✅ RESUELTO**).

---

## P0 — Bloqueadores (correctitud / integridad de datos)

### P0-1 · Race condition de sobrecupo en la inscripción

**Dónde:** `apps/web/src/app/api/class/enroll/route.ts:97-168`

**Qué pasa:** el flujo es (1) leer `spots_available` de la vista `class_spots`, (2) `if (spotsAvailable <= 0) return no_spots`, (3) `insert` de la inscripción. Entre (1) y (3) no hay candado ni transacción atómica. Dos alumnos que tocan "Reservar" en la misma ventana de ~100 ms leen ambos `spots_available = 1`, ambos pasan el check y ambos insertan → **la clase queda con más inscritos que `max_spots`.**

No existe red de seguridad a nivel de base de datos: `max_spots` es `NOT NULL` pero **nada impide** que la suma de inscripciones lo supere (no hay trigger ni constraint de conteo).

**Por qué importa:** el propósito declarado de DanzClass (CLAUDE.md) es resolver "problemas de sobrecupo". Este es el escenario más probable de sobrecupo: una clase codiciada con pocos cupos y un descuento recién publicado — justo cuando llegan varios alumnos a la vez.

**Recomendación:** mover el check+insert a una función Postgres (`RPC`) atómica que tome un lock por clase antes de contar e insertar. Opciones:
- `SELECT ... FROM classes WHERE id = ? FOR UPDATE` al inicio de la función, luego contar inscripciones activas y comparar contra `max_spots`, e insertar solo si hay cupo — todo en la misma transacción.
- O `pg_advisory_xact_lock(hashtext(class_id))` como lock ligero por clase.
- O un trigger `BEFORE INSERT` en `enrollments` que rechace si se supera `max_spots`.
La ruta llamaría al RPC en vez de hacer read-check-insert en tres round-trips. Como mobile y web usan **la misma** ruta (`${WEB_URL}/api/class/enroll`, ver `apps/mobile/app/(app)/class/[id]/index.tsx:720`), un solo fix cubre ambas plataformas.

**✅ RESUELTO (2026-07-22)** — `supabase/migrations/056_enrollment_integrity.sql`.
Se optó por la **variante trigger + lock** (no un RPC que refactorice la ruta) por ser la menos invasiva y la única que cubre **todos** los caminos de inserción sin duplicar la lógica de pre-chequeos de la ruta. Se creó `enforce_class_capacity()` como trigger `BEFORE INSERT OR UPDATE` sobre `enrollments`: toma `SELECT max_spots ... FOR UPDATE` sobre la fila de la clase (serializa las inscripciones concurrentes de esa clase), recuenta los cupos ocupados con la misma lógica que `class_spots` (excluye holds vencidos) y lanza `class_full` si se supera `max_spots`. Solo valida la **transición** hacia "ocupa cupo", así que confirmar/rechazar un pago sobre una fila ya contada nunca dispara el chequeo (ni siquiera en clases ya sobre-vendidas por datos previos). En `apps/web/src/app/api/class/enroll/route.ts` el insert y el update de reactivación ahora mapean el error `class_full` → `no_spots` (409). El pre-chequeo de cupos se mantiene como fast-path; el trigger es la red de seguridad real bajo carrera. Cubre web y mobile (misma ruta) y también paquetes/audiciones/2x (fallan cerrado = nunca sobre-venden). *Nota:* las rutas de paquetes/audiciones aceptadas ahora reciben `class_full` si la clase se llenó — su manejo de error genérico basta para no sobre-vender, pero se puede pulir el mensaje en una pasada futura.

---

### P0-2 · La `UNIQUE(student_id, class_id, session_id)` no previene inscripciones duplicadas

**Dónde:** `supabase/migrations/001_initial_schema.sql:121` (`UNIQUE (student_id, class_id, session_id)`)

**Qué pasa:** en el modelo actual **todas** las inscripciones usan `session_id = NULL` (documentado en CLAUDE.md, "Vista `class_spots` y modelo de enrollment"). En PostgreSQL, un `UNIQUE` trata cada `NULL` como distinto, así que dos filas `(alumno, clase, NULL)` y `(alumno, clase, NULL)` **no violan la restricción**. Es decir: la única barrera contra que un alumno se inscriba dos veces a la misma clase es el chequeo en código de `enroll/route.ts:107-131`, que también es vulnerable a race (doble clic / doble request → dos inscripciones).

**Impacto:** duplica el cupo consumido por una persona, ensucia el historial de pagos, y puede duplicar notificaciones. Combinado con P0-1, el modelo de cupos no tiene ninguna garantía a nivel de DB.

**Recomendación:** reemplazar por un índice único parcial que sí funcione con `NULL`:
```sql
CREATE UNIQUE INDEX enrollments_unique_active
  ON enrollments (student_id, class_id)
  WHERE session_id IS NULL AND status <> 'cancelled';
```
(Excluir `cancelled` permite re-inscribirse tras cancelar, que es el flujo actual de `enroll/route.ts`.) Con esto, el segundo insert concurrente falla con `23505` y la ruta lo puede tratar como `already_enrolled`.

**✅ RESUELTO (2026-07-22)** — misma migración `056_enrollment_integrity.sql`.
Se creó el índice único parcial `enrollments_unique_active ON enrollments (student_id, class_id) WHERE session_id IS NULL AND status <> 'cancelled'`, precedido de un **dedup defensivo** (si ya existieran inscripciones activas duplicadas, conserva la más avanzada — confirmed > payment_submitted > pending_payment, y la más reciente — y cancela el resto, para que el índice se pueda crear; en una DB limpia no toca nada). En `enroll/route.ts` el insert fresco ahora detecta `23505`, busca la inscripción existente y responde `already_enrolled` con su `id` (que P1-4 usa para llevar al pago).

---

### P0-3 · Los posts "seguidores"/"amigos" son invisibles para su audiencia (RLS obsoleta)

**Dónde:**
- Policy: `supabase/migrations/008_trust_posts.sql:36` → `posts_select USING (is_public = true OR auth.uid() = user_id)`
- Columna nueva no contemplada: `supabase/migrations/009_class_type_post_visibility.sql:5-7` agregó `visibility ('public'|'followers'|'friends')` **pero nunca reescribió la policy**.
- Inserción: `apps/web/src/components/feed/CreatePostModal.tsx:111-112` y `apps/mobile/app/(app)/class/create-post.tsx:128-129` guardan `is_public: visibility === 'public'`.

**Qué pasa:** un post con `visibility = 'followers'` o `'friends'` se guarda con `is_public = false`. La RLS solo deja leerlo si `is_public = true` **o** el lector es el autor. Resultado: **nadie salvo el autor ve jamás un post de seguidores o de amigos.**

Esto no es un leak (la RLS es *demasiado* restrictiva, no demasiado laxa), sino una **feature muerta**: el selector de visibilidad "Seguidores / Amigos" en el modal de publicar no tiene efecto útil — el post desaparece para todos. Se confirma en los dos caminos de lectura:
- Feed "Siguiendo": `apps/web/src/hooks/queries/useFeed.ts:132-135` pide `visibility IN ('public','followers','friends')` pero la RLS lo filtra a solo `public`.
- Perfil público: `apps/web/src/app/(app)/teacher/[username]/page.tsx:175-179` arma `visibilities` según la relación, pero usa el cliente con RLS (`createClient` server, línea 2) → mismo bloqueo.

**Recomendación:** reescribir la policy `posts_select` para que contemple `visibility` con subconsultas a `follows` y a la vista `accepted_friends`:
```sql
CREATE POLICY posts_select ON posts FOR SELECT USING (
  auth.uid() = user_id
  OR visibility = 'public'
  OR (visibility = 'followers' AND EXISTS (
        SELECT 1 FROM follows f WHERE f.following_id = posts.user_id AND f.follower_id = auth.uid()))
  OR (visibility = 'friends' AND EXISTS (
        SELECT 1 FROM accepted_friends af
        WHERE (af.user_a = auth.uid() AND af.user_b = posts.user_id)
           OR (af.user_b = auth.uid() AND af.user_a = posts.user_id)))
);
```
(Ajustar los nombres de columna de `accepted_friends`.) Verificar también que el feed público anónimo siga viendo solo `public`. Tras el fix, revisar que `is_public` ya no gobierne visibilidad en ningún lado (se puede dejar como columna legacy o migrar a solo `visibility`).

**✅ RESUELTO (2026-07-22)** — `supabase/migrations/057_posts_visibility_rls.sql`.
Se reescribió la policy `posts_select`: ahora gobierna `visibility` con subconsultas directas a `follows` (`follows_select_all` deja leerlas) y a `friendships` (`friendships_select_own` deja al usuario ver sus propias filas; se chequea la relación bidireccional aceptada). Público = todos (incluido el visitante anónimo del feed público, porque `auth.uid()` NULL solo falla las ramas follower/friend). `is_public` queda como columna legacy sin efecto en la lectura (para posts públicos el comportamiento es idéntico: `visibility='public' ⟺ is_public=true`). Con la RLS corregida, el filtrado `.in('visibility', ...)` que ya hacían el feed "Siguiendo" (`useFeed.ts`) y el perfil público (`teacher/[username]/page.tsx`) queda correctamente respaldado y **no requirió cambios de código de aplicación** — la feature revive sola.

---

## P1 — Importantes (funcionalidad / UX)

### P1-1 · Inscripciones pendientes sin pago ocupan el cupo para siempre (clases con pago diferido)

**Dónde:** vista `class_spots` en `supabase/migrations/055_late_payment_holds_and_archive.sql:54-76`; cron `apps/web/src/app/api/cron/cleanup-classes/route.ts`.

**Qué pasa:** la vista cuenta como cupo ocupado toda inscripción `status != 'cancelled'`, excluyendo **solo** los holds vencidos (`pending_payment` con `hold_expires_at` pasado). Pero los holds solo existen para clases con `allow_late_payment = false`. Para la clase **por defecto** (`allow_late_payment = true`), la inscripción entra como `pending_payment` **sin** `hold_expires_at`, así que cuenta como ocupada indefinidamente. El cron limpia holds vencidos, 2x abandonados y manda recordatorios, pero **nunca cancela una inscripción pending normal**. Un alumno que reserva y nunca paga bloquea el cupo hasta que el profesor lo elimina a mano.

**Impacto:** clases que aparecen "llenas" de gente que nunca pagó. Otra vez, roza el problema de sobrecupo/ocupación fantasma que la app busca evitar. La única salida hoy es manual (el profesor borra al alumno).

**Recomendación:** decidir la política y hacerla explícita. Opciones:
- Aplicar también un timeout suave a las inscripciones `pending_payment` sin hold (p. ej. auto-cancelar tras 48–72 h sin comprobante, avisando antes — ya existe el `payment_reminder` a 24 h como base). ✅
- O mostrar los pending como "reservado, pago pendiente" separado de los confirmados, y no contarlos al 100% del cupo.
- Como mínimo, dar al profesor un botón de "liberar cupos sin pago" por clase.

**✅ RESUELTO (2026-07-22)** — opción elegida por el usuario (timeout suave). En `apps/web/src/app/api/cron/cleanup-classes/route.ts` se agregó un barrido que cancela las inscripciones `pending_payment` **sin hold** (`hold_expires_at IS NULL`), **no 2x** (el 2x tiene su timeout propio de 7 días) y con más de **72 h** desde la reserva, solo en clases `active`. Anula sus pagos pendientes y notifica al alumno. El `payment_reminder` de 24 h que ya existía cumple el "avisando antes". Como al subir comprobante el estado pasa a `payment_submitted`, esto solo alcanza reservas nunca concretadas. El label de la notificación `class_cancelled` (web `NotificationsClient.tsx` + mobile `notifications.tsx`) ahora es consciente del `reason`: para `payment_timeout`/`2x_payment_timeout` dice *"Tu reserva en X se canceló por falta de pago"* (antes decía, engañosamente, "la clase fue cancelada") y enlaza a la clase para re-reservar. **Trade-off consciente:** esto acorta el caso "reservo hoy, pago en persona en 2 semanas" en clases con `allow_late_payment=true`; si se vuelve un problema real, se puede subir la ventana o hacerla configurable por clase.

---

<!-- ### P1-2 · Los descuentos espontáneos no expiran nunca

**Dónde:** `apps/web/src/app/api/class/discount/route.ts:62-69`; `packages/shared/src/lib/pricing.ts:24-28`.

**Qué pasa:** `discount_price` / `discount_price_monthly` se setean sin fecha de vencimiento. `effectiveClassPrice` los aplica mientras no sean `null`. Un "descuento de último minuto" queda vigente **para siempre** hasta que el profesor lo borre manualmente. La notificación dice "¡Descuento activo!" pero no hay ningún "hasta cuándo".

**Impacto:** el descuento deja de ser "de último minuto" y se vuelve el precio real; los alumnos que inscribieron a precio lleno ven después el mismo precio rebajado permanentemente. Además la política de precio "se cobra el vigente al momento de pagar" (CLAUDE.md) hace que el descaste sea silencioso.

**Recomendación:** agregar `discount_expires_at` a `classes` y que `effectiveClassPrice` (y el badge de descuento) lo respeten; el cron limpia descuentos vencidos. Mostrar la fecha de término en el banner de descuento. Alternativa mínima: recordatorio al profesor de que tiene un descuento activo desde hace X días. -->

---

### P1-3 · Webhook de marketplace: verificar firma real y monto pagado

**Dónde:** `apps/web/src/app/api/mercadopago/webhook/route.ts:162-166` (verificación de firma) y `:84-145` (`confirmClassPayment`).

**Dos puntos:**
1. **Firma de webhooks de split.** La firma se valida siempre contra `MERCADOPAGO_WEBHOOK_SECRET` (plataforma). Para los pagos de clase, el pago vive en la cuenta MP del **profesor** y se lee con su `access_token`. Falta confirmar en **sandbox** que MP firma esos webhooks con el secreto de la plataforma (dueña de la app/preferencia) y no con uno del vendedor — si no coincidiera, todos los pagos MP de clase serían rechazados en la verificación de firma. Ya está anotado como pendiente ("probar F1–F4 con sandbox"), pero conviene marcarlo como el riesgo #1 de ese testing.
2. **Sin verificación de monto.** `confirmClassPayment` confirma en cuanto `payment.status === 'approved'`, sin comparar `payment.transaction_amount` contra `base + commission` esperado. Con el flujo normal MP fija el monto (no explotable trivialmente), pero como defensa en profundidad conviene rechazar/loguear si el monto aprobado no coincide con el esperado del enrollment.

**Recomendación:** (1) primer caso a probar en el sandbox; si falla la firma para split, MP documenta un flujo alterno (webhooks configurados a nivel de la app y firmados con el secret de la app). (2) Agregar el chequeo de monto antes de `autoConfirmPayment`.

**✅ RESUELTO parcialmente (2026-07-22)** — punto (2) implementado en `webhook/route.ts`: `confirmClassPayment` ahora lee `amount` + `commission_amount` de la fila de pago y, cuando MP aprueba, compara contra `payment.transaction_amount`. Si no coincide, loguea `class_payment_amount_mismatch`, persiste el estado MP y **no auto-confirma** (queda para revisión manual del profesor). Punto (1) — validar que MP firma los webhooks de split con el secret de la plataforma — **sigue siendo un gate de testing con sandbox de MP**, no es resoluble en código; es el riesgo #1 de esa sesión de pruebas.

---

### P1-4 · `already_enrolled` en la inscripción no hace nada (UX muerta)

**Dónde:** `apps/web/src/components/class/ClassDetailClient.tsx:155` (`else if (json.error !== 'already_enrolled')`).

**Qué pasa:** si la API responde `already_enrolled` (409), el cliente no muestra error ni navega: el spinner se apaga y no pasa nada. El usuario queda mirando el botón sin feedback. Puede ocurrir por doble request, por estado desincronizado, o si volvió a la clase con una inscripción previa no reflejada.

**Recomendación:** ante `already_enrolled`, navegar a `/payment/<enrollmentId>` (o refrescar el estado de inscripción y mostrar el banner correspondiente). Requiere que la API devuelva el `enrollmentId` existente en ese 409. El equivalente mobile (`class/[id]/index.tsx:743`) tiene la misma lógica y merece el mismo trato.

**✅ RESUELTO (2026-07-22)** — la ruta `enroll/route.ts` ahora incluye `enrollmentId` + `status` en las respuestas `already_enrolled` (tanto en el 409 directo como en el que se deriva del `23505` de carrera). El cliente web (`ClassDetailClient.tsx`) y mobile (`class/[id]/index.tsx`) navegan a `/payment/<enrollmentId>` cuando el `status` no es `confirmed`; si ya estaba confirmado, refrescan el estado (web) o muestran "Ya inscrito" (mobile). Fin del botón sin feedback.

---

### P1-5 · Acceso anónimo inconsistente: feed y clase son públicos, pero el perfil del profesor no

**Dónde:** `apps/web/src/middleware.ts:7-15` — `PUBLIC_ROUTES` no incluye `/teacher/[username]`.

**Qué pasa:** desde la sesión 2026-07-18 el feed y el detalle de clase son públicos (visitante sin login). Pero al tocar el nombre/avatar del profesor en una card, el visitante es redirigido a `/auth/login`. Es un callejón inesperado dentro de un flujo público: puedo ver la clase pero no quién la dicta.

**Recomendación:** decidir la intención. Si el objetivo es que el visitante explore antes de registrarse, `/teacher/[username]` debería ser público (la página ya maneja `deleted_at → notFound` y no expone datos privados; hay que ocultar acciones que requieren sesión, como ya hace la clase). Si se prefiere gatear, entonces al menos no linkear el perfil desde cards en el feed anónimo (evita el dead-end).

**✅ RESUELTO (2026-07-22)** — se eligió hacerlo público (coherente con el feed público que ya deja explorar antes de registrarse). Se agregó `PUBLIC_TEACHER_PROFILE = /^\/teacher\/[^/]+\/?$/` a `middleware.ts`. **No hizo falta tocar la página ni el cliente:** `teacher/[username]/page.tsx` ya guarda toda query dependiente de identidad con `user && !isOwnProfile ? ... : ...` y pasa `currentUserId={user?.id}` (undefined); `TeacherProfileClient` ya oculta las acciones de seguir/amistad/valorar tras `!isOwnProfile && currentUserId`, y los posts los filtra ahora la RLS corregida de P0-3. El visitante anónimo ve clases, stats y posts públicos, sin acciones.

---

## P2 — Escalabilidad

### P2-1 · El feed embebe todas las inscripciones de cada clase para contar cupos

**Dónde:** `apps/web/src/app/(app)/feed/page.tsx:21` y `apps/web/src/hooks/queries/useFeed.ts:111` — `select('..., enrollments(id, status)')`.

**Qué pasa:** para calcular cupos, el feed trae **todas** las filas de `enrollments` de cada clase y las cuenta en el cliente. Una clase popular con cientos de inscripciones arrastra cientos de filas por card, ×20 clases por página. Con volumen real, el payload del feed crece sin control.

**Recomendación:** usar la vista `class_spots` (ya existe y ya está indexada) para traer `spots_taken`/`spots_available` en vez de la lista completa de enrollments. Idem en `fetchNearbyData` (`useFeed.ts:65`).

**✅ RESUELTO (2026-07-22)** — nuevo helper `apps/web/src/lib/feedSpots.ts` (`attachClassSpots`) que hace **un** query batch a `class_spots` para los ids de las clases y adjunta `spots_taken`/`spots_available`. Se quitó el join `enrollments(id, status)` de las queries del feed (web `feed/page.tsx` y `useFeed.ts` global + nearby; mobile `feed.tsx` con helper equivalente inline en las 3 ramas). `ClassCard` y `MobileClassCard` ahora prefieren `spots_available` de la vista, con fallback a contar enrollments (compat). **Bonus de correctitud:** `class_spots` excluye holds vencidos, así que el conteo es más preciso que el que hacía el cliente. Verificado que la vista tiene SELECT para anon/authenticated (funciona en el feed público). Typecheck limpio.

---

### P2-2 · Panel Financiero carga todos los pagos all-time sin límite ni agregación

**Dónde:** `apps/web/src/app/(app)/financiero/page.tsx:16-30`.

**Qué pasa:** trae **todos** los `payments` verified del profesor (sin `.limit`, sin corte por fecha) y calcula stats + gráfico de 6 meses en JS. Un profesor con un año de actividad carga miles de filas en cada visita a `/financiero`.

**Recomendación:** agregar en SQL (sum/count por mes vía RPC o vista materializada), o al menos acotar a la ventana que la UI realmente muestra (6 meses) y paginar el detalle. Mismo patrón a revisar en `agenda/page.tsx` y `my-classes/page.tsx` a medida que crezcan.

**✅ RESUELTO (2026-07-22)** — nueva migración `058_teacher_financial_summary.sql`: RPC `teacher_financial_summary()` (SECURITY DEFINER + `auth.uid()`, solo devuelve el resumen del propio profesor) que agrega en Postgres `total_income`, `unique_students`, `monthly_trend` (6 meses, hora Chile), `top_classes` (5), y stats de clases (`active_count`/`total_enrolled`/`total_confirmed`). La página (`financiero/page.tsx`) y el cliente (`FinancialDashboardClient.tsx`), más el equivalente mobile (`financiero.tsx`), ahora consumen el RPC + solo los pagos de detalle **acotados a 6 meses** (para la lista y el filtro por mes). RPC validado funcionalmente contra la DB local con fixtures.

> ⚠️ **Además corrigió DOS bugs latentes que el panel tenía y estaba mostrando 0 en todo:** las queries previas seleccionaban/ordenaban por **`payments.created_at`** y **`classes.price_monthly`**, **columnas que no existen** (las fechas de `payments` son `submitted_at`/`verified_at`/`confirmed_at`; no hay `price_monthly`). Ambas queries fallaban → el panel financiero (web **y** mobile) mostraba ingresos/alumnos/clases en 0. El RPC usa `verified_at` y calcula todo bien.

---

### P2-3 · El cron `cleanup-classes` carga colecciones completas y hace N updates secuenciales

**Dónde:** `apps/web/src/app/api/cron/cleanup-classes/route.ts` — p. ej. `:61-73` (todas las clases activas + su media), `:342-378` (todos los chats de clase y de ensayo), y varios loops con un `await` por fila (`:215-260`, `:276-284`).

**Qué pasa:** el cron itera todo en memoria y hace un round-trip por inscripción/chat. Con cientos de clases va bien; con miles, más el archivado + recordatorios + holds + 2x + chats en la misma corrida, puede acercarse al timeout de Vercel Cron y hacerse frágil.

**Recomendación:** batch de updates (`in(...)` en vez de loop), o dividir en varios crons por responsabilidad (archivar / recordar / limpiar), o procesar por lotes con cursor. No urgente, pero es el proceso que primero se romperá al escalar.

**✅ RESUELTO (2026-07-22)** — se convirtieron a batch (`.in(ids)`) los loops de mayor volumen y con id-list simple: liberación de **holds vencidos**, cancelación de **reservas impagas** (P1-1) y **borrado de chats** vencidos. Antes hacían un round-trip por fila; ahora un update/insert/delete por lote. Se dejaron sin tocar los loops con lógica por-fila compleja (archivado con Storage/Cloudinary, 2x con partner+notificaciones) porque batchearlos es riesgoso y su volumen es menor. **Bonus:** el batch de chats con un `Set` de ids **corrige de paso el P3-2** (doble-conteo/doble-delete por los `if` sin `else`).

---

### P2-4 · Feed sin paginación real (ya conocido)

**Dónde:** `.limit(20)` en `feed/page.tsx` y `useFeed.ts`; documentado en resumen.md ("Sin scroll infinito con cursor").

**Qué pasa:** el feed muestra 20 y no hay forma de ver más. Funcionalmente, contenido más antiguo que el top-20 es inalcanzable desde el feed.

**Recomendación:** paginación por cursor (`created_at` + id) con "cargar más" o scroll infinito. React Query ya está montado, así que `useInfiniteQuery` encaja.

**✅ RESUELTO (2026-07-22)** — se implementó **"Cargar más"** con tamaño de página incremental (web `FeedClient`/`useFeed`; mobile `feed.tsx` con footer en el `FlatList`). **Nota de diseño:** se descartó el cursor puro `useInfiniteQuery` porque el feed **fusiona 4 fuentes heterogéneas** y los eventos se ordenan por `event_date` (no `created_at`), así que un cursor único por `created_at` paginaría mal los eventos. El enfoque elegido (subir el `limit` y refetchear con `keepPreviousData`) reutiliza **toda** la lógica de filtros/visibilidad existente, hace reachable el contenido más antiguo, y mantiene el payload acotado — el costo real de escalabilidad (la lista de enrollments por card) ya se resolvió en P2-1. `hasMore` se deriva de si alguna fuente devolvió la página completa. Limitación menor: los ensayos (acotados, propios) no se paginan.

---

### P2-5 · `middleware` ejecuta `getUser()` (round-trip a Supabase Auth) en cada request

**Dónde:** `apps/web/src/middleware.ts:39`.

**Qué pasa:** cada navegación no estática valida el JWT contra Supabase (latencia de red por request). Es el patrón oficial de `@supabase/ssr` y es seguro, pero suma latencia perceptible en cada click bajo carga.

**Recomendación:** aceptable para alpha. Si la latencia molesta, evaluar validar la sesión localmente (getSession) para rutas públicas y reservar `getUser()` para rutas protegidas, o cachear. No tocar sin medir.

**⏸️ DEJADO INTENCIONALMENTE COMO ESTÁ (2026-07-22)** — la recomendación original era explícitamente "no tocar sin medir". Además, el `getUser()` del middleware **no es solo un check de auth: es lo que refresca el token de sesión de `@supabase/ssr` en cada request** (escribe las cookies rotadas en la respuesta). Quitarlo o cambiarlo a `getSession()` rompería la renovación de sesión y podría desloguear usuarios. Es el patrón oficial de Supabase y la latencia es aceptable para alpha. No se cambió a propósito; revisar solo con métricas reales de latencia en producción.

---

## P3 — Detalles y pulido

### P3-1 · Inconsistencia en el límite de `max_spots` ✅ RESUELTO (2026-07-22)

`CreateClassForm.tsx:43` valida `.max(100)` con Zod, pero el `<input>` decía `max={1000}`. Zod gana, así que un valor entre 101 y 1000 se escribía pero se rechazaba al enviar — confuso. **Corregido:** los `<input>` de `CreateClassForm` y `EditClassForm` ahora usan `max={100}`, alineados con la validación real. **Además**, los forms **mobile** (`class/create.tsx` y `class/[id]/edit.tsx`) no tenían **ningún** tope (solo `Number(maxSpots) < 1`), así que podían crear clases con cupos arbitrarios saltándose el límite del web: se les agregó `Máximo 100 cupos` para que las tres superficies validen el mismo rango.

### P3-2 · Limpieza de chats en el cron: doble conteo / doble delete ✅ RESUELTO (2026-07-22)

`cleanup-classes/route.ts`: para una clase se evaluaban dos `if` sin `else` (suelta por `date`, periódica por `ends_at`). Una clase que matcheara ambas se borraba/contaba dos veces. **Corregido como byproduct de P2-3:** ahora los ids de chats a borrar se juntan en un `Set` (con `continue` tras cada match) y se borran en un solo batch, lo que elimina el doble-conteo por construcción.

### P3-3 · `console.log` en rutas de Mercado Pago ✅ RESUELTO (2026-07-22)

Las tres rutas (`create-preference`, `create-subscription`, `subscriptions/cancel`) usaban `console.*` en vez del `logger` estructurado. **Corregido:** todas migradas a `logger.info/warn/error` (Vercel las indexa como JSON). **Lo relevante no era solo el ruido:** `create-subscription` hacía `JSON.stringify(err?.cause ?? err)` y `JSON.stringify(anyResult)` — volcaba el **objeto completo** de error/respuesta de MP, que puede arrastrar datos del `payer` y de la request. Ahora solo se loguean campos acotados (`message`, `status`, `plan`, `preapproval_id`). Verificado que no queda ningún `console.*` en `api/mercadopago/**` ni `api/subscriptions/**`.

### P3-4 · Asistencia QR exige pago confirmado — fricción antes de clase ✅ RESUELTO (2026-07-22)

`attendance/scan/route.ts` rechaza con `payment_not_confirmed` si el enrollment no está `confirmed`. Un alumno que pagó por transferencia y cuyo profesor aún no confirmó no podía marcar asistencia al llegar, y el escáner solo mostraba un flash rojo de 2 s. **Corregido en ambos escáneres** (`ScanAttendanceClient.tsx` web + `class/[id]/scan-attendance.tsx` mobile): el motivo `payment_not_confirmed` ahora **no se auto-cierra** (los demás rechazos mantienen el flash de 2 s) y ofrece dos salidas explícitas — **"Revisar pagos"** (lleva a `/my-classes`, donde el profesor confirma) y **"Seguir escaneando"** (descarta y libera el lock para no trancar la fila). La validación del backend no se relajó: sigue exigiendo pago confirmado.

### P3-5 · Doble clic en "Reservar" (web) ✅ CUBIERTO POR P0-2 (2026-07-22)

El botón ya se deshabilitaba con `disabled={enrolling}`, lo que cubre el doble clic en la misma sesión; dos pestañas / dos dispositivos seguían pudiendo emitir dos requests. **No requirió cambio propio:** el fix real es el índice único parcial `enrollments_unique_active` de P0-2, que hace imposible la inscripción duplicada a nivel de base de datos (verificado con la prueba de concurrencia: el segundo insert falla con `23505`), y la ruta ahora traduce ese `23505` a `already_enrolled` llevando al alumno a su pago (P1-4).

### P3-6 · Retención de comprobantes y archivos huérfanos ✅ RESUELTO (2026-07-22)

Documentado en CLAUDE.md ("Storage — archivos huérfanos"). Al investigarlo, los tres casos resultaron **muy distintos en gravedad**, y se atacó cada uno donde corresponde:

1. **Media de posts eliminados — la fuga real.** `/api/post/delete` ya borraba de Cloudinary, pero cuando Cloudinary **no** está configurado el video cae al bucket `posts-media` con path `{userId}/{timestamp}.{ext}`: **cada post borrado dejaba su archivo huérfano para siempre**. Ahora la ruta extrae el path de la URL y hace `storage.remove()` (best-effort, no bloquea el borrado del post).
2. **Avatar anterior — fuga acotada.** Web y mobile suben a `{id}/avatar.{ext}` con `upsert`, así que **repetir el mismo formato sobrescribe** (no había fuga). Solo fugaba al **cambiar de formato** (jpg → png dejaba el jpg). Ahora, tras subir, ambos borran los hermanos `avatar.*` de otra extensión.
3. **Comprobantes de pago — el cron de purga que faltaba.** Nuevo bloque en `cleanup-classes`: purga los `receipt_url` de pagos `void`/`rejected` con más de **90 días** (borra del bucket + pone `receipt_url = null`). Los `verified` **no se tocan** (son el respaldo del pago). Ojo: `payments` no tiene `created_at`, así que la antigüedad se mide con `submitted_at`.

> Con el cron ya existente, **ahora sí se puede fijar el plazo de retención (90 días) en `/privacy`** — que era la condición que el propio plan ponía ("no fijar plazos sin el proceso que los cumpla"). **No modifiqué el texto legal**: queda como decisión tuya, idealmente junto a la revisión de abogado ya pendiente.

---

## Verificaciones pendientes del lado del usuario (no son bugs, son gates de release)

Recolectadas de CLAUDE.md / resumen.md, relevantes para el testing con usuarios reales:
- Probar F1–F4 de pagos marketplace contra **sandbox de Mercado Pago** (firma del webhook de split es el riesgo #1 — ver P1-3).
- Aplicar en producción las migraciones pendientes: **041** (storage path validation), **042** (accepted_friends security_invoker), **048** (admin_actions settings), **049** (grants), **055** (holds/archive) — confirmar cuáles siguen sin aplicar.
- `ANTHROPIC_API_KEY` en Vercel (escaneo IA) — no estaba configurada.
- Registrar el Redirect URI de OAuth de MP (`https://danzclass.com/api/mercadopago/oauth/callback`) en el panel de la app MP.
- `QR_TOKEN_SECRET` configurado en producción (asistencia QR lo exige; sin él, `verifyAttendanceToken` siempre devuelve false y ningún QR valida).
- Revisión legal chilena del ToS/tributario del marketplace (borrador).

---

## Orden sugerido de ataque

**Actualización 2026-07-22:** todos los P0 y P1 están resueltos en código (ver los bloques ✅ RESUELTO). Queda pendiente **del lado del despliegue/producto**:

1. **Aplicar `055 → 056 → 057 → 058` en Supabase producción, en orden.** Hasta entonces: las protecciones de sobrecupo/duplicados/visibilidad de posts **no están activas en prod**, y el Panel Financiero sigue mostrando 0 (le falta el RPC de `058`). `056` **requiere `055` aplicada primero** (ver dependencia arriba). Todas idempotentes y con rollback documentado. `058` debe desplegarse junto con el código nuevo del panel financiero (aunque, como el panel ya estaba roto, no hay regresión si se aplica después).
2. **P1-3 punto (1):** validar la firma del webhook de split con el **sandbox de MP** (único gate que no es código).
3. **Opcional:** ahora que existe el cron de purga de comprobantes (P3-6), se puede fijar el plazo de **90 días** en `/privacy` — junto a la revisión legal ya pendiente. El texto legal **no** se tocó.
4. **P1-2 (expiración de descuentos)** y **P2-5 (getUser del middleware)** — dejados como decisiones intencionales; reconsiderar solo con datos reales.

**Todo lo demás (P0, P1, P2, P3) está resuelto en código.** Lo único que falta para que surta efecto en producción es aplicar las migraciones y desplegar.
