# Segunda auditoría integral — DanzClass

**Fecha:** 2026-07-29
**Alcance:** monorepo completo (`apps/web`, `apps/mobile`, `packages/shared`, `supabase/migrations`), con foco en lo que **`audit.md` no cubrió**: no repite ningún hallazgo de ese documento (S1–S7 cerraron los suyos; S8 sigue como checklist pendiente de ejecutar).
**Baseline verificado en esta sesión:** typecheck web limpio · typecheck mobile limpio (0 errores) · **242** unit tests verdes · **21/21** de integración verdes · **5/5** smoke E2E de las 4 features verdes · stack local de Supabase corriendo con las **72** migraciones aplicadas.

**Método.** Igual que `audit.md`: nada de lectura especulativa. Cada hallazgo de RLS se **probó empíricamente** contra el Postgres local (`docker exec supabase_db_DanzClass psql`, con `SET ROLE authenticated` + `request.jwt.claim.sub` para que las policies se evalúen exactamente como las evaluaría PostgREST para ese usuario atacante — mismo método que usó la primera auditoría). Cada prueba corrió dentro de una transacción con `ROLLBACK` al final: no quedó ningún dato de prueba en el stack local. Los hallazgos de código citan `archivo:línea`. Donde no verifiqué algo lo digo explícitamente.

**Relación con `audit.md`.** Esa auditoría encontró y cerró (S1–S7) el defecto más grave del proyecto: policies `FOR UPDATE` sin `WITH CHECK`, que permitían fabricar pagos, confirmar inscripciones sin pagar y forzar meses de plan gratis. El fix (migración `065`) fue exactamente correcto para las **6 tablas** que cubrió (`enrollments`, `profiles`, `event_enrollments`, `event_payments`, `package_enrollments`, `class_2x_requests` — verifiqué sus triggers y son completos). **Esta segunda auditoría encontró el mismo defecto, sin cerrar, en 5 tablas más** que quedaron fuera de esa pasada porque no participan del dinero directamente — son tablas de "invitación/relación" (auditions, friendships, event_invites, chat_participants, rehearsal_invites) y por eso nadie las miró con la misma lupa. Es el hallazgo central de este documento.

---

## 0. Resumen ejecutivo

Ocho sesiones de auditoría (`audit.md` S1–S7, más S8 en preparación) dejaron la plataforma sustancialmente más sólida: la superficie de escritura RLS de las tablas de dinero está cerrada, el chat entrega mensajes, los entrenamientos cobran, y hay pruebas de integración que fijan cada uno de esos fixes. Esta segunda pasada buscó deliberadamente en los rincones que esa lupa no alcanzó, y encontró:

1. **El mismo patrón de `audit.md` P0-1 (policy `FOR UPDATE` sin `WITH CHECK`, en una columna que no es la que la policy protege) sigue abierto en 5 tablas**: un usuario puede secuestrar su propia fila de participación en un chat para leer y escribir en **cualquier otro chat** de la plataforma; forjar una amistad "aceptada" con cualquier persona sin su consentimiento (y con eso, ver sus publicaciones privadas); auto-adjuntarse como "aceptado" a la invitación de **cualquier** evento ajeno; colarse en un ensayo privado al que nunca fue invitado; y un profesor puede reasignar la identidad del postulante de una audición ya decidida. Los 5 se reprodujeron empíricamente. **Es tan grave como el P0-1 original — mismo mecanismo, distintas tablas.**
2. **Un alumno de entrenamiento que se va y vuelve a ser aceptado hereda una deuda que no le corresponde**: el motor de cobro mensual (`generate_monthly_charges`, migración `068`) ancla en la fecha de inscripción original, que la reactivación no cambia, así que factura retroactivamente los meses en que el alumno **no estaba inscrito**. Verificado empíricamente contra la función SQL real.
3. **Una función auxiliar de auditions, no cubierta por ninguna policy**, deja roto (silenciosamente, sin error) el modo de edición de postulación pendiente que `CLAUDE.md` documenta como feature entregada.
4. Dos hallazgos menores de la misma familia que cosas que `audit.md` ya cerró en otro archivo: un cron nuevo repite el bug de paginación que `P2-5` acababa de corregir en su vecino, y la suite de integración que prueba que el RLS de dinero sigue cerrado **no corre en CI** — nada avisaría si una migración futura reabre el agujero.

No encontré nada del calibre de lo anterior en: la matemática de comisión/gross-up de Mercado Pago, el refresh de tokens OAuth (maneja bien la condición de carrera documentada), la idempotencia del webhook, ni en la paridad web/mobile de las features de S6/S7 (los fixes de `Avatar`, `WEB_URL` y rate-limit siguen sosteniéndose). El detalle de qué revisé sin encontrar nada está en **§4**.

**Semáforo:**

| | Estado |
|---|---|
| 🔴 **Bloqueadores reales** | 3 (P0-1 a P0-3) — **los 3 cerrados** (P0-1/P0-3 sesión 1, P0-2 sesión 2) |
| 🟠 **Importantes antes de invitar usuarios** | 1 (P1-1) — **cerrado en la sesión 1** |
| ⚪ **Deuda acotada** | 1 (P2-1) — **cerrado en la sesión 1** |

> **Estado al 2026-07-29 (después de la sesión 2): todos los hallazgos de este documento están cerrados.** Ver §7 para el registro de sesiones.

---

## 1. 🔴 P0 — Bloqueadores

### P0-1 · El guard de escritura de `065` no llegó a las tablas de invitación/relación — 5 vectores confirmados

> **✅ CERRADO — sesión 1 (2026-07-29), migración `073_invite_write_guards_rls.sql`.** Los 5 vectores están bloqueados y fijados como regresión en `tests/integration/rls-guards.spec.ts`. La sesión encontró además **3 vectores nuevos por INSERT** que este hallazgo no cubría (no hacía falta ni el UPDATE) — detalle en §7. **Pendiente aplicar `073` en prod.**

**El patrón, en una frase.** Una policy `FOR UPDATE ... USING (X)` sin `WITH CHECK` deja que Postgres reutilice `X` como `WITH CHECK`. Si `X` solo verifica "esta fila es mía" (p.ej. `auth.uid() = user_id`) pero la fila tiene **otra** columna que apunta al recurso relacionado (`chat_id`, `rehearsal_id`, `event_id`, `class_id`, `requester_id`), esa segunda columna queda **libre**: el dueño de la fila puede redirigirla hacia cualquier recurso ajeno sin que ninguna policy lo note. Es exactamente el mecanismo de `audit.md` P0-1 — que se cerró para 6 tablas de dinero (`065_write_guards_rls.sql`, verificado: sus 6 triggers bloquean explícitamente cada columna ajena, incluida la que en cada caso haría falta) pero nunca se extendió a estas 5, porque no mueven dinero directamente y por eso no entraron en el barrido original.

**Verificación empírica.** Las cinco corridas siguientes se ejecutaron con `SET ROLE authenticated` + `request.jwt.claim.sub` = el atacante, contra el stack local, dentro de una transacción con `ROLLBACK` (sin dejar datos):

```
(a) chat_participants — el atacante es participante legítimo del Chat A (su propia
    clase). UPDATE chat_participants SET chat_id = <Chat B ajeno> WHERE user_id = atacante:
    UPDATE 1. Consecuencia inmediata: is_chat_participant(ChatB) pasa a TRUE para el
    atacante → SELECT sobre chat_messages de Chat B devuelve el mensaje privado entre
    dos desconocidos, e INSERT de un mensaje nuevo en ese chat también se acepta.
    Antes del secuestro: 0 filas visibles. Después: 1 (el mensaje real) + el propio
    insertado. Full read/write takeover de un chat ajeno con una sola fila propia.

(b) friendships — UPDATE friendships SET requester_id = <víctima>, status='accepted'
    WHERE addressee_id = atacante: UPDATE 1. La vista accepted_friends (symmetric)
    ahora reporta a víctima y atacante como amigos mutuos, sin que la víctima haya
    hecho nada. posts_select ya usa exactamente esa tabla para el gate 'friends' —
    confirmado leyendo la policy: EXISTS friendships WHERE status='accepted' AND
    ((requester=auth.uid() AND addressee=posts.user_id) OR (addressee=auth.uid() AND
    requester=posts.user_id)) — la fila forjada satisface esa condición. El atacante
    ve las publicaciones "solo amigos" de cualquiera.

(c) event_invites — un usuario crea su propio evento-señuelo, se auto-invita
    (event_invites_insert_creator no impide invitarse a sí mismo) y luego:
    UPDATE event_invites SET event_id = <evento AJENO>, status='accepted' WHERE
    teacher_id = atacante: UPDATE 1. Queda "invitado y aceptado" a un evento que
    nunca lo invitó — visible al organizador real como aceptado, y a sus propios
    seguidores en el tab "Siguiendo" (CLAUDE.md: "los seguidores de un profe que
    aceptó una invitación ven el evento").

(d) rehearsal_invites — mismo mecanismo: UPDATE rehearsal_invites SET rehearsal_id =
    <ensayo privado ajeno>, status='accepted' WHERE user_id = atacante: UPDATE 1.
    Antes: 0 filas visibles de ese ensayo (rehearsals_invitees_select lo oculta
    correctamente). Después del secuestro: 1 fila visible — el atacante ve un
    ensayo privado al que nunca fue invitado, con status 'accepted'.

(e) auditions — el profesor de una clase puede, sobre CUALQUIER postulación de su
    propia clase: UPDATE auditions SET applicant_id = <otro usuario>, status=
    'accepted' WHERE id = <audition ajena>: UPDATE 1. La policy solo verifica que
    el profesor sea dueño de class_id (y eso SÍ queda protegido, correctamente,
    porque la propia condición referencia class_id); pero applicant_id no forma
    parte de esa condición. Un profesor puede reescribir de quién es una
    postulación ya decidida — vector de "inscripción forzada" si luego se dispara
    el flujo de aceptación sobre ese id.
```

**Dónde se define cada policy hoy (todas activas, confirmado contra `pg_policies`):**

| Tabla | Policy | Definida en | Columna NO protegida |
|---|---|---|---|
| `chat_participants` | `chat_participants_update_own` | `037_chat.sql:63`, **re-creada sin cambios en `059_fix_chat_rls_recursion.sql:79-81`** (la migración dedicada a cerrar RLS del chat) | `chat_id` |
| `friendships` | `friendships_update_addressee` | `002_subscriptions_friends_2x.sql:146` | `requester_id` |
| `event_invites` | `invites_update_teacher` | `038_events.sql:109` | `event_id` |
| `rehearsal_invites` | `rehearsal_invites_own` | `023_rehearsals.sql:80` | `rehearsal_id` |
| `auditions` | "Teachers can update audition status" | `015_entrenamiento.sql:43` | `applicant_id` |

El dato de `chat_participants` es el que más pesa: la migración `059` — escrita específicamente para cerrar la recursión y la fuga de lectura del chat (`audit.md` la documenta como uno de sus casos ejemplares) — **recreó esta misma policy sin agregarle protección**, con el mismo texto que ya traía desde `037`. La revisión de RLS de `059` fue exhaustiva para SELECT/INSERT y no miró UPDATE.

**Por qué es P0 y no P1.** Igual que el original: explotable hoy con la anon key del bundle, sin cuenta especial (solo hace falta ser dueño de *alguna* fila en la tabla — algo trivial de conseguir: inscribirse a una clase con chat, pedir o recibir cualquier amistad, ser invitado a cualquier evento/ensayo, o postular a cualquier audición), y ninguna de las protecciones de la app (rate limit, `requireUser`, validación de rutas) interviene porque el ataque no pasa por ninguna ruta.

**Recomendación.** Mismo patrón que `065`: un trigger `BEFORE UPDATE` por tabla (o uno genérico parametrizado) que rechace cualquier intento de cambiar la columna que identifica el recurso relacionado (`chat_id`, `requester_id`+`addressee_id`, `event_id`, `rehearsal_id`, `class_id`+`applicant_id`) a menos que sea `service_role`. Extender `tests/integration/rls-guards.spec.ts` con los 5 ataques de arriba como regresión — sin eso, el próximo refactor de cualquiera de estas tablas puede reabrir el agujero sin que nada lo note (ver también **P1-1**, sobre por qué esa suite no alcanza si no corre en CI).

---

### P0-2 · Un alumno de entrenamiento que se va y vuelve hereda deuda de meses en que no estaba inscrito

> **✅ CERRADO — sesión 2 (2026-07-29), migración `074_training_billing_since.sql`.** Nueva columna `enrollments.billing_since` (mismo mecanismo derivado-por-trigger que `pending_since` de `066`): se fija al inscribirse y se **reinicia sin excepción en cada reactivación** (salir de `cancelled`). `generate_monthly_charges` pasa de leer `created_at` a leer `billing_since`. `/api/class/leave` corregido para anular también los cargos `due`/`rejected` al salir (nota menor de abajo). Los dos, fijados como regresión en `tests/integration/monthly-charges.spec.ts`. Detalle en §7.

**Dónde:** `supabase/migrations/068_training_monthly_charges.sql:185-273` (función `generate_monthly_charges`), cruzado con `apps/web/src/app/api/class/auditions/enroll-accepted/route.ts:57-67`.

**Qué pasa.** Cuando un alumno de entrenamiento se va (`/api/class/leave`), su `enrollment.status` pasa a `cancelled` pero la fila **no se borra**. Si el profesor lo vuelve a aceptar después de una nueva postulación, `enroll-accepted` **reactiva la misma fila** (`UPDATE enrollments SET status='pending_payment' WHERE id = existing.id`, línea 65) — no crea una nueva. El problema es que `generate_monthly_charges` calcula desde cuándo se debe cobrar usando `enrollments.created_at` (línea 203, `enrolled_at`), que **la reactivación no toca**. La función no tiene ningún concepto de "estuvo cancelado entre tal y tal fecha": solo mira el estado actual (`e.status <> 'cancelled'`) y la fecha de creación original.

**Verificado empíricamente** (transacción con `ROLLBACK`, usando fechas reales dentro del rango del sistema):

```
1. Alumno se inscribe en abril (created_at = 2026-04-05). generate_monthly_charges()
   → crea el cargo de abril ('due', $20.000).
2. Se va en abril (nunca pagó). enrollment.status = 'cancelled'.
   [mayo y junio pasan — en producción el cron real NUNCA llama a esta función
   para esta fila mientras está cancelada, porque el WHERE la excluye: no se
   simuló nada, es el comportamiento real]
3. En julio el profesor lo vuelve a aceptar → UPDATE de la MISMA fila a
   'pending_payment' (enroll-accepted, línea 65).
4. generate_monthly_charges(enrollment_id) → created_count: 3.
   Resultado: payments ahora tiene filas 'due' para 2026-04, 2026-05, 2026-06 Y
   2026-07 — MAYO Y JUNIO son meses en los que el alumno NO estuvo inscrito en
   absoluto, y aun así quedan como deuda.
```

**Consecuencia.** El alumno reingresa y se encuentra debiendo meses en los que nunca asistió ni estuvo matriculado — un cargo objetivamente incorrecto, que además **bloquea su QR** vía `hasOverdue` en `summarizeCharges` (una vez vencidos los 3 días de gracia). Es dinero real pedido de más a un usuario real, sin que medie ningún atacante — la misma clase de severidad que `audit.md` P0-4 (un reloj que mide lo que no debe).

**Nota relacionada, menor:** `apps/web/src/app/api/class/leave/route.ts:56` — al salir, el código intenta anular pagos pendientes con `.in('status', ['pending', 'payment_submitted'])`. `'payment_submitted'` **no es, y nunca fue, un valor válido de `payments.status`** (el CHECK vigente solo admite `due|pending|verified|rejected|void|refunded` — ese string pertenece al enum de `enrollments.status`, no al de `payments.status`; mismo tipo de confusión que `audit.md` ya corrigió una vez en la migración `064`). En la práctica esta mitad del filtro es un no-op silencioso. Más importante: **`'due'` no está en la lista**, así que los cargos mensuales impagos (el caso que más importa acá) nunca se anulan al salir — quedan flotando adjuntos al `enrollment_id`, listos para resucitar en el escenario de arriba.

**Recomendación.** Dos piezas, complementarias: (1) que `generate_monthly_charges` no cruce un período en que la inscripción estuvo `cancelled` — la forma más simple es que la reactivación en `enroll-accepted` reinicie el ancla de facturación (una columna dedicada, p.ej. `enrollments.billing_since`, distinta de `created_at`, que sí se actualice en cada reactivación); (2) que `/api/class/leave` anule también los cargos `due` pendientes al salir (con el string correcto), para no dejar deuda fantasma adjunta a una fila que puede reactivarse meses después.

---

### P0-3 · El modo de edición de postulación pendiente de auditions está roto — nunca tuvo policy

> **✅ CERRADO — sesión 1 (2026-07-29), migración `073`** (policy `auditions_update_own_pending` + trigger que reparte columnas entre postulante y profesor) **+ código**: `AuditionModal` (web y mobile) ahora hace `.select('id')` y trata 0 filas como error, que es lo que hacía el fallo invisible.

**Dónde:** `apps/web/src/components/class/AuditionModal.tsx:79-94` (y su gemelo `apps/mobile/app/(app)/class/[id]/index.tsx:339` según el mismo patrón), cruzado con las policies de `auditions` (§ tabla de P0-1).

**Qué pasa.** `CLAUDE.md` documenta la feature explícitamente: *"Audiciones — modo edición de postulación pendiente... el modal hace UPDATE en lugar de INSERT"*. El código hace exactamente eso: si `existing.status === 'pending'`, llama a `supabase.from('auditions').update(...).eq('id', existing.id).eq('status','pending')`. El problema es que **nunca existió una policy de UPDATE para el postulante** — las únicas policies de `auditions` son: el propio postulante puede *ver* su postulación, el profesor puede *ver y actualizar* las de su clase, y cualquiera puede *insertar* la propia. No hay ninguna que permita al postulante actualizar la suya.

**Verificado empíricamente:** como postulante (`SET request.jwt.claim.sub` = el mismo `applicant_id` de la fila), `UPDATE auditions SET phone='999-forged-by-applicant' WHERE id = <su propia audición> AND status='pending'` devuelve **`UPDATE 0`** — RLS no rechaza con error, simplemente no encuentra ninguna fila que la policy le permita tocar. El código del modal solo revisa `if (updateErr) setError(...)`; como PostgREST no devuelve error cuando el `WHERE` no matchea ninguna fila visible, `updateErr` es `null` y el modal llama a `onSubmitted()` como si hubiera funcionado. **El alumno cree haber actualizado su teléfono/edad/video y no pasó nada — sin ningún mensaje de error.**

**Recomendación.** Agregar la policy que falta: `CREATE POLICY "auditions_update_own_pending" ON auditions FOR UPDATE USING (auth.uid() = applicant_id AND status = 'pending')` — y, dado que esto habilita una nueva vía de escritura del lado del alumno, conviene resolverla en la misma migración que cierre **P0-1(e)**: un trigger que permita al postulante tocar solo `full_name`/`age`/`phone`/`video_url` (nunca `status`/`class_id`/`applicant_id`), y al profesor solo `status`/`notes` (nunca `applicant_id`/`class_id`) — un único trigger por tabla que distinga el camino según quién escribe, igual que ya hace `event_enrollments_write_guard` para organizador vs. alumno.

---

## 2. 🟠 P1 — Importantes

### P1-1 · Los tests de integración (incluidos los que prueban que el RLS de dinero sigue cerrado) no corren en CI

> **✅ CERRADO — sesión 1 (2026-07-29).** Job `test-integration` en `.github/workflows/ci.yml`: levanta el stack de Supabase en el runner (`npx supabase start`, replayeando todas las migraciones desde cero) y corre `npm run test:integration`. **Límite conocido, documentado en el propio workflow:** los 7 casos que hablan por HTTP con la app se **saltan** en CI (levantar `dev:web` exigiría los secretos de Mercado Pago/Cloudinary); aparecen como "skipped", no como verdes. Todo lo que toca RLS —`rls-guards.spec.ts` completa— sí corre. Verificado localmente que las suites no necesitan más que las 3 variables que el job genera.

**Dónde:** `.github/workflows/ci.yml` — jobs `typecheck`, `typecheck-mobile`, `test-unit`, `smoke-prod`. No hay ningún job que corra `npm run test:integration`.

**Qué pasa.** `tests/integration/rls-guards.spec.ts` es la suite que prueba, con un JWT de usuario real contra PostgREST, que los 13 ataques de `audit.md` P0-1 siguen rechazados — es la única razón por la que se puede afirmar con confianza que ese agujero sigue cerrado. Lo mismo vale para `payment-hardening.spec.ts` (S5), `periodica-migration.spec.ts` (S3) y `features-qa.spec.ts` (S7, incluida la prueba que verifica que Realtime entrega mensajes de chat). Ninguna de las cuatro corre automáticamente: dependen de que quien haga el próximo cambio se acuerde de levantar el stack local (`npm run db:start`) y correrlas a mano. Si una migración futura toca una de estas policies o triggers y nadie corre la suite manualmente, **CI queda en verde con un agujero de seguridad reabierto**.

**Por qué no es solo "sería lindo tener más CI".** Es exactamente el mecanismo que dejó pasar `P0-1` original (nadie miró las policies de `001` con la misma atención que las rutas de API) y ahora esta segunda pasada (nadie miró las 5 tablas de este documento con la misma atención que las 6 de `065`). Un gate automático es la única defensa contra que un **tercer** grupo de tablas quede afuera la próxima vez.

**Recomendación.** Agregar un job de CI que levante el stack de Supabase (hay acciones de GitHub para levantar Postgres/Docker Compose, o usar la CLI de Supabase con `supabase start` en el runner) y corra `npm run test:integration` en cada PR contra `main`. Es más costoso que los jobs actuales (necesita Docker), pero es exactamente la inversión que un proyecto con dinero real en juego necesita antes de escalar.

---

## 3. ⚪ P2 — Deuda acotada

| # | Hallazgo | Dónde |
|---|---|---|
| **P2-1** ✅ **CERRADO (sesión 1)** | **`/api/cron/monthly-charges` repite el bug de paginación que `audit.md` P2-5 acababa de cerrar en su vecino `cleanup-classes`.** La query de cargos impagos (para mandar los recordatorios `payment_reminder`) no tiene `.range()` ni `.limit()`: PostgREST corta en 1000 filas por defecto, **en silencio**. Con menos de 1000 cargos impagos en toda la plataforma (el caso de hoy) no pasa nada; el día que se superen, los alumnos con cargos "al final" de la lista simplemente dejan de recibir el recordatorio de mensualidad vencida — sin error, sin log. La emisión de los cargos en sí (`generate_monthly_charges`, un cursor SQL) no tiene este problema; es solo la query de notificación la que lo hereda.<br><br>**Fix:** `.range()` en loop (helper `fetchAllPages`, mismo patrón que P2-5). **Y había una segunda query sin paginar en la misma ruta**, que el hallazgo no mencionaba: la de deduplicación de avisos ya enviados. Ahí el corte silencioso falla **al revés** — creer que un aviso nunca se mandó y **volver a mandarlo** — y su `.in()` además reventaría el largo de la URL con miles de alumnos, así que se trocea. Si esa query falla, la corrida no avisa nada en vez de arriesgar avisos de dinero duplicados. | `apps/web/src/app/api/cron/monthly-charges/route.ts:70-81` |

---

## 4. Áreas revisadas sin hallazgos nuevos

Para que quede explícito qué se miró y no produjo nada — la ausencia de una sección larga de hallazgos no es falta de búsqueda:

- **Todas las policies RLS restantes de `public`** (91 policies, 40 tablas) se inventariaron contra `pg_policies` y se revisaron una por una buscando el patrón de P0-1. Las únicas 5 con el defecto son las de este documento; el resto, o no tiene policy de UPDATE, o la condición de propiedad referencia exactamente la columna que haría falta proteger (`class_sessions`, `class_package_items`, `event_payments`, `teacher_payment_info`, `classes` — verificado explícitamente para `event_payments`, que a primera vista parecía sospechoso y resultó estar bien cerrado).
- **Los 6 triggers de escritura de la migración `065`** (`enrollments`, `profiles`, `event_enrollments`, `event_payments`, `package_enrollments`, `class_2x_requests`): se leyó el cuerpo completo de cada función y los 6 bloquean explícitamente cada columna ajena relevante, incluidas las que en las otras 5 tablas quedaron libres. No hay regresión ahí.
- **La matemática de comisión y gross-up de Mercado Pago** (`packages/shared/src/lib/commission.ts`): el cálculo, el redondeo y la reconstrucción del total en el webhook (`grossUpForMp`) son consistentes entre sí; no encontré un caso donde el profesor reciba menos de su precio.
- **El refresh de tokens OAuth de Mercado Pago** (`apps/web/src/lib/mercadopago/token.ts`): maneja correctamente la condición de carrera que su propio comentario advierte (dos requests refrescando a la vez con un `refresh_token` de un solo uso) releyendo la fila antes de dar el refresh por fallido.
- **La idempotencia del webhook de Mercado Pago** (pagos de clase, suscripciones, renovaciones, reembolsos): las cuatro ramas verifican el estado ya persistido antes de escribir de nuevo.
- **Paridad web/mobile de los fixes de S6/S7**: `Avatar size` en el detalle de evento mobile (`event/[id]/index.tsx:292,310`) sigue usando `'md'`/`'sm'` con la prop `url`; no hay literales `dc-project-web.vercel.app` sueltos fuera de `webUrl.ts`; las rutas de dinero más sensibles (`create-payment`, `submit-transfer`, `payment/confirm`, `attendance/scan`) tienen rate limit.
- **Los otros crons** (`plan-content`, `mp-connections`) sí paginan o tienen `.limit()` explícito; solo `monthly-charges` se quedó sin (P2-1).

---

## 5. Lo que no pude verificar

- **Mercado Pago real**, App Store, y el estado de producción: mismas limitaciones que `audit.md` §9 — nada de esto cambió en esta sesión, todo lo de acá se verificó contra el stack local.
- **El impacto exacto de P0-2 en producción**: no hay forma de saber desde este entorno cuántos alumnos de entrenamiento ya se fueron y volvieron desde que existe el cobro mensual (S4, esta misma semana) — es plausible que el escenario todavía no se haya dado con datos reales, lo que es la razón exacta por la que nadie lo había notado.

---

## 6. Recomendación de secuencia

A diferencia de `audit.md`, el alcance acá es acotado — no hace falta un plan de 8 sesiones. Sugerido:

1. ✅ **HECHO (sesión 1).** **Una sesión `opus high`** para P0-1 + P0-3 juntas: son el mismo tipo de trabajo (triggers de guarda + una policy nueva) sobre 5 tablas relacionadas, con la misma disciplina que `065` — construir primero los 5+1 ataques como suite de regresión (extendiendo `rls-guards.spec.ts`), confirmar que fallan hoy, escribir los triggers, confirmar que pasan.
2. ✅ **HECHO (sesión 2).** **`sonnet high`** para P0-2: requiere decidir el diseño de la nueva ancla de facturación (`billing_since` u otra) sin romper `generate_monthly_charges` para los alumnos que nunca se fueron.
3. ✅ **HECHO (sesión 1).** **P1-1** (CI de integración) y **P2-1** (paginar el cron) son mecánicos, cualquier esfuerzo los resuelve en la misma sesión que lo anterior o en una aparte de limpieza.

Con estas 3 sesiones cerradas, valdría la pena una **tercera auditoría** enfocada específicamente en las tablas de invitación/relación que quedan (`follows`, `waitlist`, `dismissed_debts`, `push_tokens` ya se revisaron acá y están bien) y en repetir el ejercicio de "¿qué policy nueva se agregó desde la última vez que no pasó por este escrutinio?" — es, en definitiva, el mismo proceso que produjo este documento.

**Con la sesión 2, los 5 hallazgos de este documento están cerrados.** No queda ningún P0/P1/P2 abierto en `audit2.md`.

---

## 7. Registro de sesiones

### Sesión 1 — 2026-07-29 · P0-1 + P0-3 + P1-1 + P2-1

**Cerrados:** P0-1, P0-3, P1-1, P2-1. **Abierto:** P0-2 (único que queda). **Migración nueva: `073_invite_write_guards_rls.sql`.**

**Método, igual que S1 de `audit.md`: primero el ataque, después el fix.** Se extendió `tests/integration/rls-guards.spec.ts` con dos tests nuevos (uno de ataques, uno de caminos legítimos) y se midió el baseline **antes** de tocar nada: **10 escrituras ilegítimas pasaban**. El veredicto no puede salir del error de PostgREST — un UPDATE que RLS filtra devuelve 0 filas **sin error** — así que cada ataque relee la fila con service role y compara contra lo que el atacante quería dejar escrito.

**Los 5 vectores del hallazgo, confirmados y cerrados.** Además de reproducirlos, se midió la **consecuencia** con el JWT del atacante, no con service role: tras el secuestro de `chat_participants` el mensaje privado ajeno **se lee** (`chat_messages` de un chat de dos desconocidos), y tras colarse en `rehearsal_invites` el **ensayo privado pasa a ser legible**. Las dos consecuencias entraron a la suite como casos propios.

**Tres vectores nuevos que el hallazgo no cubría: no hacía falta el UPDATE, bastaba el INSERT.** Es la parte más importante de la sesión, porque un fix que solo hubiera mirado UPDATE (lo que pedía el hallazgo) habría dejado los tres abiertos:

1. **`friendships`** — `friendships_insert_requester` solo exige `requester_id = auth.uid()` y **no mira `status`**: se inserta la amistad ya `'accepted'` de una sola vez, sin necesidad de recibir ninguna solicitud previa. Mismo efecto que el vector (b) pero en un paso.
2. **`rehearsal_invites`** — su policy es `FOR ALL` y su `WITH CHECK` solo mira `user_id`: se **inserta** la invitación propia a cualquier ensayo privado, sin necesitar una legítima que redirigir.
3. **`auditions`** — un alumno puede insertar su propia postulación con `status='accepted'`, y eso es exactamente lo que `/api/class/enroll:80-89` exige para dejar entrar a un entrenamiento (`audition_required`). **La audición pasa de ser un filtro a un trámite auto-firmado**: el alumno se salta la selección del profesor por completo. Es el vector nuevo de mayor impacto de producto.

**Una trampa del propio seed que casi enmascaró el vector (e).** El ataque del profesor sobre `auditions.applicant_id` aparecía como "bloqueado" en la primera corrida: no lo bloqueaba ninguna policy, rebotaba con 23505 porque la postulación del atacante y la de la víctima vivían en la **misma clase** y el `UNIQUE(class_id, applicant_id)` las chocaba. Se separaron en tres entrenamientos distintos y el vector apareció. Es la misma trampa que el seed original de esta suite ya documentaba para `classId3`, y vale como recordatorio: en una suite de ataques, **un error de integridad se ve igual que una defensa**.

**Decisiones del fix (`073`), donde no se copió el hallazgo al pie de la letra:**

- **`chat_participants`: se elimina la policy, no se le pone un guard.** Los **dos** puntos que escriben `last_read_at` (la page de chat y `/api/chat/[id]/messages`, que es la vía de mobile) usan `createAdminClient()`, así que `chat_participants_update_own` **no tenía ningún llamador legítimo**: era superficie de ataque pura, igual que `payments_insert_student` en `065`. Se elimina, y **además** queda el trigger como cinturón: si algún día se agrega una policy para marcar leído desde el cliente, el secuestro de `chat_id` sigue cerrado sin que nadie tenga que recordar este documento.
- **`rehearsal_invites`: INSERT y UPDATE cerrados por completo al cliente**, porque sus cuatro escrituras viven en rutas de servidor. Se dejaron intactos el SELECT (agenda y my-classes leen con el cliente normal) y el DELETE (borrar la propia invitación equivale a rechazarla). **No se tocó ninguna de las dos policies**: `072` acaba de reescribir sus condiciones para cortar la recursión mutua, y volver a redefinirlas acá sería repetir el error de `059`, que recreó la policy del chat sin mirar UPDATE.
- **`friendships` y `event_invites`: se preserva el flujo cliente-a-cliente.** Enviar y aceptar solicitudes, e invitar profesores a un evento propio, siguen saliendo del navegador exactamente como hoy. Lo que se cierra es que la relación **nazca aceptada** y que se pueda cambiar **con quién/con qué** es (`requester_id`/`addressee_id`, `event_id`/`teacher_id`).
- **`auditions`: un solo trigger que reparte columnas según quién escribe** (patrón de `event_enrollments_write_guard`): el postulante declara `full_name`/`age`/`phone`/`video_url` y nada más; el profesor decide `status`/`notes` y no puede editar lo que declaró el postulante. Ninguno de los dos puede reescribir `class_id` ni `applicant_id`.

**P0-3 necesitaba dos arreglos, no uno.** La policy que faltaba (`auditions_update_own_pending`, con `status = 'pending'` en `USING` **y** en `WITH CHECK`) arregla la base. Pero lo que hizo el fallo **invisible** durante meses fue el código: `AuditionModal` (web y mobile) trataba un UPDATE de 0 filas como éxito y llamaba a `onSubmitted()`. Ahora hace `.select('id')` y trata la lista vacía como error — sin eso, el mismo bug volvería a ser silencioso la próxima vez que una policy filtre esa fila.

**P1-1 (CI de integración), con un límite que conviene tener presente.** El job `test-integration` levanta el stack completo en el runner y replaya **todas** las migraciones desde cero — que además es lo único que destapa migraciones no reproducibles (así aparecieron los bugs de `006`, `035` y `049`–`051`). Los 7 casos que hablan por HTTP con la app **se saltan** en CI, porque levantar `dev:web` exigiría los secretos de Mercado Pago/Cloudinary: aparecen como "skipped", no como verdes, y quien mire el resumen debe saberlo. Todo lo que toca RLS sí corre. Se verificó de verdad, no por suposición: se apuntó la suite a un `.env.development.local` con **solo las 3 variables que el job genera** y los 16 casos que no dependen de HTTP pasaron igual.

**P2-1 tenía una segunda mitad no documentada.** Además de la query de cargos impagos que el hallazgo señalaba, la query de **deduplicación de avisos** de la misma ruta tampoco paginaba. Ahí el corte de 1000 filas falla **al revés** — creer que un aviso nunca se mandó y volver a mandarlo — y su `.in()` además reventaría el largo de la URL con miles de alumnos. Se paginan las dos y se trocea el `.in()`; si la query de deduplicación falla, la corrida **no avisa nada** en vez de arriesgar avisos de dinero duplicados.

**Verificación.** `npm run db:reset` (replay de las **73** migraciones desde cero) → typecheck web **y** mobile en cero → **242** unit tests verdes → integración **23/23** (con `dev:web` arriba, así que también corrieron los 7 casos de paquetes/eventos/ensayos que normalmente se saltan — el de responder invitación de ensayo confirma que la ruta con service role sigue funcionando con el trigger nuevo puesto) → smoke E2E **5/5**. **Todo contra el stack local — producción no se tocó.**

**Un flake que había que arreglar, no documentar — porque el job de CI nuevo lo iba a heredar.** El caso "Realtime entrega el mensaje nuevo" (de S7) fallaba justo después de un `db:reset` y pasaba al reintentar a mano. La causa: `SUBSCRIBED` confirma que el cliente **se unió al canal por websocket**, no que el servidor de Realtime ya tenga andando la **replicación de la publicación** — recién arrancado el stack hay unos segundos en que un INSERT se pierde con el canal ya en SUBSCRIBED. Como el job de CI corre exactamente en ese escenario (`supabase start` y a correr), habría entrado flaky desde el primer día. El fix es reintentar el insert dentro del `expect.poll` (mismo contenido, así la aserción vale igual). Se verificó que **no vació el valor de regresión**: quitando `chat_messages` de la publicación a mano el test vuelve a fallar, y al reponerla pasa. Ahora `db:reset` + suite inmediata da **16 verdes + 7 skipped** sin reintentos.

**Pendiente:**

- **Aplicar `073` en producción**, junto con el deploy del código de esta sesión. Aditiva, no toca datos. **Ojo con el orden:** si se aplica la migración **sin** deployar, la edición de postulación pendiente empieza a funcionar (la policy es lo que faltaba) pero el modal viejo sigue cantando éxito en los casos que fallen — inofensivo. Al revés (deployar sin la migración) tampoco rompe nada: el `.select()` nuevo simplemente muestra el error que hoy se oculta. No hay orden obligatorio, a diferencia de `065`/`069`.
- Verificación en **dispositivo real** del cambio de `AuditionModal` mobile: sigue sin haber simulador en este entorno (misma limitación heredada de S2/S7).

### Sesión 2 — 2026-07-29 · P0-2

**Cerrado: P0-2. Con esto, `audit2.md` queda sin hallazgos abiertos.** Migración nueva: `074_training_billing_since.sql`. Código: `apps/web/src/app/api/class/leave/route.ts`.

**El diseño, siguiendo el patrón de `pending_since` (066) con una diferencia deliberada.** Nueva columna `enrollments.billing_since`, mantenida por el mismo trigger `enrollments_write_guard` que ya gobierna `pending_since`: se recalcula ANTES de cualquier otra verificación, para todo caller. `generate_monthly_charges()` pasa de leer `e.created_at` a leer `COALESCE(e.billing_since, e.created_at)` (renombrado internamente a `billed_since` para que el nombre refleje lo que representa ahora). La diferencia con `pending_since`: esa columna es 100% derivada sin ninguna excepción, porque no hay ningún caso legítimo en que valga otra cosa que su fórmula. `billing_since` sí necesita un margen — los propios tests de este archivo retrodatan un valor para simular "se inscribió hace 3 meses" sin esperar 3 meses reales, el mismo margen que ya existe hoy, sin protección alguna, para `created_at`. Por eso el trigger honra un valor explícito de un caller **privilegiado** cuando **no** es una reactivación (INSERT, o UPDATE que no sale de `cancelled`). Lo que no tiene excepción para nadie, ni siquiera el service role, es la reactivación en sí: salir de `cancelled` siempre reinicia `billing_since` a `now()` — es exactamente el momento que el hallazgo dice que se perdía, y dejarlo overridable habría dejado la puerta abierta a que un caller futuro (o una corrección manual apurada) lo vuelva a perder. Un cliente no privilegiado nunca puede tocarla, en ningún caso.

**Un error real cometido y corregido en la misma sesión, que vale como advertencia.** Al escribir el `CREATE OR REPLACE FUNCTION enrollments_write_guard()` de la migración 074, reproduje el cuerpo de la función **tal como lo dejó `066`** (la migración que originalmente introdujo `pending_since`, y la que leí primero para entender el patrón) — pero la versión REALMENTE vigente en el esquema era la de `069`, que endureció más la transición de estado del profesor (de "puede poner `confirmed` o `cancelled`" a "solo `cancelled`", cerrando P1-8: confirmar desde el cliente dejaba al alumno sin QR). Un `CREATE OR REPLACE` reemplaza la función **completa**, así que mi primera versión de `074` **revirtió silenciosamente el fix de P1-8** sin ningún error de sintaxis ni de aplicación — la migración corrió limpia. Lo detectó `tests/integration/rls-guards.spec.ts` (`la superficie de escritura RLS rechaza los ataques de P0-1` — específicamente el caso "profesor confirmando desde el cliente debe fallar", que dejó de fallar) al correr la suite completa después del `db:reset`. Es la razón exacta por la que el método de esta sesión —y de toda la serie audit/audit2— es "aplicar, y correr TODA la suite, no sólo el test nuevo": un cambio correcto para el hallazgo que se está cerrando puede regresar silenciosamente uno ya cerrado si la migración no parte de la última versión real de la función. Corregido: `074` ahora parte explícitamente del cuerpo de `069`, con un comentario en el propio archivo señalando la trampa para la próxima migración que toque este trigger.

**La mitad complementaria: `/api/class/leave`.** El filtro `.in('status', ['pending', 'payment_submitted'])` tenía un string (`'payment_submitted'`) que nunca fue válido en `payments.status` — pertenece a `enrollments.status`, la misma confusión que `audit.md` ya había corregido una vez en la migración `064`. Ese medio filtro era un no-op silencioso. Más importante: `'due'` no estaba en la lista, así que los cargos mensuales impagos —el caso que más importa— nunca se anulaban al salir. Corregido a `.in('status', ['pending', 'due', 'rejected'])`: todo cargo sin resolver queda `void` al salir, así que ninguno sobrevive para "resucitar" si la fila se reactiva más adelante. `'verified'` (pagado) y `'refunded'` (ya revertido, se conserva como registro) quedan afuera a propósito.

**Verificado empíricamente, primero el ataque.** Baseline medido contra el código sin tocar: un alumno inscrito hace 4 meses, cancelado, y reactivado hoy, terminaba debiendo **4 meses** — marzo, abril, mayo y junio en la corrida real, de los cuales sólo el último (el de la reactivación) correspondía a tiempo efectivamente inscrito. El test nuevo lo reproduce con el mismo truco que el test 1 preexistente de este archivo ya usaba (retrodatar `created_at` tras el INSERT): antes de la migración, sólo hace falta eso porque `generate_monthly_charges` leía `created_at` directo. Después de aplicar `074`, el mismo escenario factura únicamente el mes en curso.

**Dos tests nuevos en `tests/integration/monthly-charges.spec.ts`** (sobre el DB puro para la reactivación; HTTP real, con el patrón `serverUp`/`test.skip` ya establecido en `features-qa.spec.ts`, para `/api/class/leave` — no había precedente de llamar una ruta HTTP desde este archivo, así que se agregó la infraestructura mínima: un `mkSignedUser` que además firma sesión, porque los `mkUser` existentes del archivo sólo devolvían el id). El test 1 preexistente ("cobro mensual de entrenamiento…") necesitó un ajuste de una línea: además de retrodatar `created_at` (que ya no lee la función), retrodata `billing_since` en el mismo UPDATE — el trigger lo honra porque el caller es privilegiado y no es una reactivación.

**Verificación.** `npm run db:reset` (replay de las **74** migraciones desde cero, con la versión CORREGIDA de `074`) → typecheck web y mobile en cero → **242** unit tests → integración **25/25** (con `dev:web` arriba, incluidos los 2 tests nuevos de P0-2 y los 4 que ya cubrían la sesión 1) → smoke E2E **5/5**. **Todo contra el stack local — producción no se tocó.**

**Pendiente:**

- **Aplicar `073` y `074` en producción**, en cualquier orden entre sí y junto con el deploy del código de ambas sesiones. Ninguna de las dos exige una secuencia particular respecto del código (a diferencia de `065`/`069`): los dos sentidos (migración antes o después del deploy) son inofensivos.
- **`074` no es retroactiva** (documentado en su propio header): si algún alumno de entrenamiento ya fue facturado de más en producción por este bug desde que existe el cobro mensual (`068`, 2026-07-28), la migración no revierte los cargos ya emitidos. Diagnóstico manual con la query del header de `074`; el remedio es anular a mano los cargos `due`/`rejected` de los meses en que el alumno no estuvo inscrito.
- Verificación en **dispositivo real** del cambio de `AuditionModal` mobile (heredado de la sesión 1): sigue sin haber simulador en este entorno.
