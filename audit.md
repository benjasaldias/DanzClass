yyyy# Auditoría integral pre-lanzamiento — DanzClass

**Fecha:** 2026-07-28
**Alcance:** monorepo completo (`apps/web`, `apps/mobile`, `packages/shared`, `supabase/migrations`), con foco en integridad de datos, dinero, seguridad, paridad web↔mobile y cabos sueltos.
**Baseline verificado en esta sesión:** typecheck web limpio · typecheck mobile con 21 errores (analizados uno por uno, **3 de ellos son bugs reales en producción**, ver P0-3) · 182 unit tests verdes · stack local de Supabase corriendo con las 64 migraciones aplicadas.

**Método.** No es un escaneo de lectura. Los hallazgos de RLS se **probaron empíricamente** contra el Postgres local (`docker exec supabase_db_DanzClass psql`, con `SET ROLE authenticated` + `request.jwt.claims` para que las policies se evalúen como el usuario atacante). Los hallazgos de código citan `archivo:línea`. Donde no pude verificar (Mercado Pago real, App Store) lo digo explícitamente en vez de afirmarlo.

**Relación con los documentos previos.** `plan-auditoria-pre-release.md` (2026-07-22) cerró P0-1 a P3-6 y `marketplace-payments-v2-plan.md` cerró las sesiones 1–4. **Este audit no los repite**: todo lo que hay acá es nuevo o quedó fuera de esos barridos. Los dos anteriores auditaron rutas de API y lógica de aplicación; ninguno auditó las **policies RLS heredadas de la migración 001**, que es donde está el hallazgo más grave.

---

## 0. Decisiones de producto tomadas en esta sesión

Consultadas y respondidas por el usuario antes de escribir este plan. Condicionan todo lo que sigue.

| Tema | Decisión |
|---|---|
| **Plataformas v1** | **Web + Android + iOS.** iOS entra al lanzamiento → suma el gate de revisión de App Store (ver **D-1**, es un riesgo de negocio real, no un trámite). |
| **Clases periódicas** | **No pueden extenderse más de un mes.** Se elimina la recurrencia `weekly` y `biweekly`; el **único** modo de definir fechas pasa a ser `custom` (calendario), acotado a un mes. |
| **Entrenamientos** | **Cobro mensual manual, con deuda acumulada.** El alumno queda inscrito de forma permanente tras la audición; la única consecuencia de no pagar es **perder el QR de acceso**, y el profesor ve la deuda acumulada. La deuda se puede pagar atrasada (subiendo comprobante), la IA la escanea si está habilitada, y **el profesor puede confirmar un pago sin comprobante**. |
| **Features grandes** | **Eventos, Ensayos, Paquetes y Chat entran al lanzamiento, con QA dedicado por feature.** Ninguna se apaga tras un flag. |

Estas decisiones convierten dos ítems del audit en features nuevas de tamaño real (S3 y S4 del plan). Están dimensionadas abajo con su costo honesto, no minimizado.

---

## 1. Resumen ejecutivo

La app está funcionalmente completa y bien documentada. Los problemas graves **no son features faltantes**, son tres clases de defecto:

1. **La capa RLS heredada de la migración 001 nunca se revisó.** Un alumno puede confirmar su propia inscripción sin pagar, fabricar un pago `verified` y farmear meses de plan Pro — todo con un `PATCH` directo a PostgREST, sin tocar la app. **Verificado ejecutándolo.** Cinco sesiones de auditoría previas no lo vieron porque todas auditaron *rutas de API*, y el ataque no pasa por ninguna ruta.

2. **Los 21 errores de typecheck de mobile, catalogados como "ruido preexistente del shim de lucide", esconden 3 bugs visibles**, incluido un **crash total de la pantalla de detalle de evento**. Se normalizó ignorarlos y eso los volvió invisibles.

3. **Hay piezas que se guardan, se muestran y no hacen nada.** `billing_day` se pide en el formulario, se muestra en tres pantallas y no dispara ningún cobro *(cerrado en S4: hoy emite los cargos mensuales)*. `refresh_token`/`expires_at` de Mercado Pago se guardan y nunca se leen *(sigue abierto, P1-1 → S5)*. `/dashboard` existe, escribe en `payments` desde el cliente y no está enlazada desde ninguna parte *(borrada en S2)*.

**Semáforo de lanzamiento:**

| | Estado |
|---|---|
| 🔴 **Bloqueadores reales** | 4 (P0-1 a P0-4) — **los 4 cerrados (S1, S2)** |
| 🟠 **Importantes antes de invitar usuarios** | 8 (P1-1 a P1-8) — **P1-5 y P1-6 cerrados en S1; P1-8 cerrado en S4; P1-1 en S5; P1-2, P1-3 y P1-4 en S6** |
| 🟡 **Decisiones de diseño con mejor alternativa** | 6 (D-1 a D-6) — **D-5 cerrado en S3; D-2 y D-4 en S5; D-3 y D-6 en S6** |
| ⚪ **Deuda acotada / pulido** | 8 (P2-1 a P2-8) — **P2-3 cerrado en S4; P2-1, P2-2, P2-4 y P2-6 en S5; P2-5, P2-7 y P2-8 en S6** |
| 🧾 **Gates que no son código** | 6 (G-1 a G-6) |

**Progreso de las sesiones del plan (§7):** S1 ✅ · S2 ✅ · S3 ✅ · S4 ✅ · S5 ✅ · S6 ✅ · S7 ✅ · S8 pendiente. Registro detallado en **§10**.

**S7 no cerró hallazgos de este documento: encontró 18 nuevos** (el QA exploratorio era, justamente, lo que ninguna sesión previa había hecho). Dos son del mismo calibre que los P0 de arriba y estaban en producción hoy: **el chat no entregaba ningún mensaje** (la tabla nunca se agregó a la publicación de Realtime y ningún cliente hacía append optimista) y **`rehearsals`/`rehearsal_invites` tenían recursión mutua de RLS** (42P17), lo que rompía toda lectura de cliente — el detalle de ensayo en mobile era inabrible. Los 18 están listados en §10 con su estado; todos quedaron cerrados en la misma sesión salvo los que se registran ahí como alcance de producto.

---

## 2. 🔴 P0 — Bloqueadores

### P0-1 · Un alumno puede confirmar su propia inscripción y fabricar pagos (RLS)

> ✅ **CERRADO en S1 (2026-07-28)** — migración `065_write_guards_rls.sql` + suite `tests/integration/rls-guards.spec.ts`. Al auditarlo para el fix aparecieron **4 vectores más** que este texto no listaba; están anotados abajo. Detalle en §10.

**Dónde:** `supabase/migrations/001_initial_schema.sql:241` (`enrollments_update_own`), `:257` (`payments_insert_student`), `:183` (`profiles_update_own`).

**Qué pasa.** Las tres policies son `FOR UPDATE ... USING (...)` **sin cláusula `WITH CHECK`**. Postgres, en ese caso, reutiliza la expresión `USING` como `WITH CHECK`: valida *qué filas* puedes tocar, pero **no valida qué valores puedes escribir en ellas**. Como la fila sigue siendo tuya después del cambio, cualquier columna es escribible.

**Verificado empíricamente** contra el stack local (transacción con `SET ROLE authenticated` y `request.jwt.claims.sub` = el alumno):

```
=== ATTEMPT 1: student self-confirms own enrollment (no payment) ===
UPDATE 1        →  status = confirmed          ✅ el ataque funciona
=== ATTEMPT 2: student inserts a fabricated VERIFIED payment of $1 ===
INSERT 0 1      →  amount=1, status=verified, confirmed_by=teacher   ✅ funciona
=== ATTEMPT 3: student clears its own hold_expires_at ===
UPDATE 1        →  hold_expires_at = NULL      ✅ funciona
=== ATTEMPT 4: student reassigns enrollment to ANOTHER student ===
ERROR: new row violates row-level security policy   ❌ (esto sí está cubierto)
```

**Consecuencias concretas:**

- **Clase gratis.** `UPDATE enrollments SET status='confirmed'` → el alumno figura confirmado, ocupa cupo legítimo, sale de la lista de deudores del profesor y desaparece de los recordatorios de pago. *No* obtiene QR de asistencia (el token se emite server-side en `autoConfirmPayment`), que es la única barrera residual — y justo por eso el modelo de entrenamientos que definiste (QR como única consecuencia del impago) **depende** de tapar esto.
- **Contabilidad envenenada.** `INSERT INTO payments (status:'verified', amount:1, confirmed_by:'teacher')` entra al Panel Financiero del profesor y al panel de conciliación de `/admin?tab=reconciliation`. Un alumno puede inflar o ensuciar los ingresos declarados de un profesor. Con `payment_method:'mp'` y un `commission_amount` inventado, ensucia también la base tributable de DanzClass.
- **Reserva perpetua.** `hold_expires_at = NULL` anula el lock de 10 minutos de la migración 055 y el barrido de holds vencidos del cron: el cupo queda tomado para siempre.
- **Meses Pro gratis.** `profiles.referral_rewarded` es escribible por su dueño. `rewardReferralIfNeeded` (`apps/web/src/lib/referral.ts:23`) es idempotente *solo* por ese flag, y `/plans/success` lo vuelve a invocar en cada carga con `subscriptionActivated=true` — que sigue siendo `true` aunque `activateIfNew` no haga nada por ser idempotente (`plans/success/page.tsx`, rama `if (existing) return`). Ciclo: poner `referral_rewarded=false` y `referred_by=<propio id>` → recargar `/plans/success?payment_id=<un pago real propio, ya usado>&status=approved` → **+30 días al "referidor" y +30 al "referido", ambos el mismo usuario**. Repetible sin límite tras un único pago real. Si el usuario no tiene suscripción, la rama `else` de `referral.ts:52` le **crea un mes Pro gratis**.
- **Otras columnas expuestas:** `is_confirmed` (aparecer en Explorar sin confirmar el correo), `mp_connected` (habilitar el botón de pago MP sin conexión OAuth real → alumnos que reservan y no pueden pagar), `deleted_at`.

**Alcance del mismo patrón en otras tablas** (verificado con una consulta a `pg_policy` sobre todas las policies `UPDATE` con `polwithcheck IS NULL`): `event_enrollments.enrollments_update` (entrada gratis a eventos pagados), `package_enrollments.pkg_enrollments_update_student` (paquete confirmado sin pagar), `class_2x_requests.2x_update_own` (cualquiera de los dos del par puede reescribir `payment_assignee`, `status` y `matched_with` → forzar el turno de pago al compañero, o forzar un emparejamiento con un desconocido). Las demás (`posts`, `profiles`, `ratings`, `classes`, `events`…) son dueño-sobre-lo-suyo y no cruzan un límite de privilegio — salvo las columnas de `profiles` listadas arriba.

**Vectores adicionales encontrados en S1** (no estaban en la primera pasada; los cuatro se reprodujeron y hoy están cerrados):

- **No hace falta ningún `UPDATE`.** `enrollments_insert_student` es un `WITH CHECK (auth.uid() = student_id)` sin nada más: un `INSERT` directo con `status:'confirmed'` crea la inscripción **ya confirmada**, sin pasar por el hold, por el cupo ni por ningún pago.
- **Mudar la inscripción de clase.** El `WITH CHECK` implícito solo mira `student_id`, así que `class_id` queda libre: se paga la clase de $10.000, se cambia `class_id` a la de $120.000 y se conserva el `confirmed`. (En la primera medición este ataque parecía bloqueado; lo estaba solo por un choque con el índice único de `056`, efecto colateral de otro ataque de la misma tanda — no por diseño.)
- **Pagos de evento fabricados.** El equivalente exacto de `payments_insert_student` para eventos: `event_payments_insert_self` deja insertar la fila con `status:'verified'` de entrada.
- **El profesor también podía reescribir la contabilidad.** `payments_update_teacher` (también sin `WITH CHECK`) permitía a un profesor poner `commission_amount` en cero sobre pagos MP ya verificados, o inflar `amount`: ensucia la conciliación tributaria de `/admin` en la dirección contraria a la del alumno.

**Ya estaba cerrado (y conviene no re-abrirlo):** la variante del 2x en la que el atacante es el `matched_with` y no el dueño de la fila. La migración `063` ajustó la policy de SELECT de `class_2x_requests`, y como un `UPDATE ... WHERE` necesita poder **leer** la fila bajo RLS, el ataque muere ahí. Es una protección indirecta: si esa policy de lectura se relaja, el agujero vuelve — por eso el guard de columna se agregó igual.

**Recomendación.** Dos capas, ambas necesarias:

1. **Guardas por columna con triggers `BEFORE UPDATE`** (patrón ya usado con éxito en `060_post_plan_visibility.sql` para blindar `plan_hidden_at`): si la sesión no es `service_role`, rechazar cambios en `enrollments.status`/`hold_expires_at`/`is_2x`/`partner_enrollment_id`, en `profiles.referral_rewarded`/`referred_by`/`is_confirmed`/`mp_connected`/`deleted_at`, y en `event_enrollments.status`/`package_enrollments.status`. Se eligen triggers y no `WITH CHECK` porque hay que comparar `NEW` vs `OLD` columna a columna, cosa que una expresión de policy no puede hacer.
2. **`payments`: quitar `payments_insert_student` por completo.** Desde que existe `POST /api/payment/submit-transfer` (esta misma semana) **ningún cliente inserta pagos**; la policy es superficie de ataque pura. Confirmado con `grep`: los únicos `from('payments')` en componentes son `SELECT` (`apps/mobile/.../payment/review/[paymentId].tsx:45`, `apps/mobile/app/(app)/financiero.tsx:56`) más el `/dashboard` zombi de P0-2.
3. **`referral.ts`: no confiar solo en el flag.** Además del guard de columna, `rewardReferralIfNeeded` debe verificar que exista una suscripción pagada real y no premiar auto-referidos (`referred_by === referredUserId`).

**Por qué es P0 y no P1.** Es explotable hoy, desde el navegador, con la anon key que está en el bundle, sin cuenta especial, y toca dinero en las dos direcciones (servicio gratis + contabilidad falsa). Ninguna de las tres protecciones existentes (rate limit, `requireUser`, validación en rutas) interviene, porque el ataque **no pasa por ninguna ruta de la app**.

---

### P0-2 · `/dashboard` es una ruta zombi que corrompe el estado de pagos

> ✅ **CERRADO en S2 (2026-07-28)** — `apps/web/src/app/(app)/dashboard/` y `DashboardClient.tsx` eliminados. Confirmado por `grep` que no quedaba ningún link ni referencia antes de borrar. Detalle en §10.

**Dónde:** `apps/web/src/components/class/DashboardClient.tsx:23-34`, página `apps/web/src/app/(app)/dashboard/page.tsx`.

**Qué pasa.** `grep` sobre todo `apps/web` y `apps/mobile` no encuentra **ni un solo enlace** a `/dashboard`. Pero la ruta existe, está detrás del middleware autenticado y sigue viva. Su botón "Confirmar" escribe directo desde el cliente:

```ts
await supabase.from('payments').update({ status: action, verified_at: ... }).eq('id', paymentId)
await supabase.from('enrollments').update({ status: 'confirmed' }).eq('id', enrollmentId)
```

Ese camino **se saltó todo lo que se construyó después**: no emite el token QR de asistencia (054), no envía la notificación `payment_confirmed` ni el push, no setea `confirmed_by`/`confirmed_at` (el pago queda indistinguible de uno confirmado por IA), no limpia `hold_expires_at`, y no confirma al compañero de un 2x. Es la versión de julio de un flujo que hoy vive centralizado en `/api/payment/confirm` + `lib/payments.ts`.

**Cómo se llega.** Escribiendo la URL. Un profesor que la tenga en el historial del navegador, o un enlace viejo compartido, confirma pagos por el camino roto sin saberlo — y el alumno queda "confirmado" sin QR ni aviso, en un estado que el resto de la app trata como válido.

**Recomendación.** **Borrar** `apps/web/src/app/(app)/dashboard/` y `DashboardClient.tsx`. `MyClassesClient` (tab "Dicto") + `/payment/review/[paymentId]` ya cubren la funcionalidad completa y correcta. No hay nada que preservar. Es el único cambio de este audit con costo cero y beneficio inmediato.

> ⚠️ **Se volvió más urgente después de S1.** Al eliminar `payments_update_teacher` (P0-1), la mitad de ese botón que escribe en `payments` pasó a ser un **no-op silencioso** (RLS filtra la fila, PostgREST no devuelve error y el componente tampoco lo mira), mientras que la mitad que escribe en `enrollments` sí sigue surtiendo efecto porque el guard nuevo permite al profesor confirmar/cancelar. O sea: hoy esa ruta deja al alumno `confirmed` con el pago intacto en `pending`. Sigue siendo una ruta a la que solo se llega escribiendo la URL, pero ya no hay ninguna razón para conservarla ni un día más.

---

### P0-3 · Tres bugs reales escondidos entre los "21 errores preexistentes" de typecheck mobile

> ✅ **CERRADO en S2 (2026-07-28)** — los 3 bugs corregidos y los 18 errores de ruido restantes también resueltos (no silenciados): `tsc --noEmit` de mobile queda en **0 errores**. Detalle en §10.

Los 21 errores de `tsc` en `apps/mobile` están documentados como ruido tolerable del shim de lucide. Los revisé uno por uno: **18 son ruido real, 3 son bugs que se ven en la app**.

#### (a) La pantalla de detalle de evento **crashea siempre** en mobile 🔴

**Dónde:** `apps/mobile/app/(app)/event/[id]/index.tsx:199` y `:217` — `<Avatar ... size={40} />` y `size={36}`.

`apps/mobile/components/ui/Avatar.tsx:3-14` declara `type AvatarSize = 'xs' | 'sm' | 'md'` y hace `const { container, text } = SIZE_MAP[size]`. Con `size={40}`, `SIZE_MAP[40]` es `undefined` → **`TypeError: Cannot destructure property 'container' of undefined`** en el render.

La línea 199 está en el bloque "Organizador", que se renderiza **siempre** para cualquier evento. Resultado: **abrir cualquier evento desde la app móvil muestra la pantalla de error del `ErrorBoundary`.** La feature Eventos está inutilizable en mobile, y tú decidiste lanzarla. Es un P0 directo.

#### (b) Los avatares de Chat, Lista de chats y Panel Financiero nunca cargan la foto

**Dónde:** `apps/mobile/app/(app)/chat/[id].tsx:146` y `:173`, `apps/mobile/app/(app)/chats.tsx:118`, `apps/mobile/app/(app)/financiero.tsx:211` — todos pasan `src={...}`.

La prop se llama `url`, no `src` (`Avatar.tsx:12`). `url` llega `undefined` → el componente cae siempre al fallback de iniciales. **Ningún usuario ve jamás una foto de perfil en el chat de mobile.** No crashea, por eso pasó desapercibido, pero es visible en las tres pantallas más sociales de la app.

#### (c) El promedio de estrellas no se muestra en el perfil público mobile

**Dónde:** `apps/mobile/app/(app)/teacher/[username].tsx:380` — `<StarRating value={avgStars} readOnly size="sm" />`.

`StarRating` (`apps/mobile/components/ui/StarRating.tsx:6-12`) no tiene prop `readOnly`. Sin `interactive` ni `onChange`, entra a la rama de display, y ahí `if (!count || count === 0) return null` — `count` nunca se pasa → **renderiza `null`**. La fila de estrellas bajo el número de valoración simplemente no existe.

**Recomendación transversal.** Corregir los 3, y **eliminar los 18 errores restantes** (tipos `any` implícitos, `style` en íconos lucide) para dejar `tsc` de mobile en cero. Mientras haya errores tolerados, el typecheck de mobile no sirve como red de seguridad — este hallazgo es la prueba: un crash de pantalla completa estuvo señalizado por el compilador durante semanas y se leyó como ruido.

---

### P0-4 · Rechazar un pago cancela la inscripción del alumno al día siguiente

> ✅ **CERRADO en S2 (2026-07-28)** — migración `066_enrollments_pending_since.sql`. Implementado como trigger (extiende `enrollments_write_guard` de `065`) en vez de setearlo a mano en los "4 puntos" que proponía la recomendación original — ver §10 para el razonamiento. Los 3 barridos del cron ahora filtran por `pending_since`.

**Dónde:** `apps/web/src/app/api/cron/cleanup-classes/route.ts:296-303` cruzado con `apps/web/src/app/api/payment/confirm/route.ts:77`.

**Qué pasa.** Cuando el profesor rechaza un comprobante, la ruta devuelve la inscripción a `pending_payment` (correcto: el alumno debe resubir). El cron diario luego busca:

```ts
.eq('status', 'pending_payment')
.is('hold_expires_at', null)
.lt('created_at', stalePendingCutoff)   // ← created_at del ENROLLMENT, no del rechazo
```

`created_at` es la fecha de **inscripción original**, que nadie toca nunca. Si el profesor rechaza el comprobante más de 72 h después de que el alumno se inscribió — el caso normal, no el excepcional —, el siguiente cron a las 03:00 UTC **cancela la inscripción, libera el cupo y le manda una notificación de "clase cancelada por falta de pago"** al alumno que acaba de subir un comprobante y está esperando una segunda oportunidad.

El mismo defecto afecta al timeout de 7 días del 2x (`:205`, también sobre `created_at`).

**Recomendación.** El reloj tiene que medir *cuánto lleva la inscripción esperando pago*, no *cuánto lleva existiendo*. Agregar `enrollments.pending_since TIMESTAMPTZ`, seteado cada vez que la fila entra a `pending_payment` (inscripción, reactivación, rechazo, revert de IA), y usar esa columna en los tres barridos del cron. Como red de seguridad adicional, excluir del barrido las inscripciones cuyo pago asociado esté en `rejected` con `confirmed_at` reciente.

---

## 3. 🟠 P1 — Importantes

### P1-1 · El token OAuth de Mercado Pago del profesor nunca se renueva

> ✅ **CERRADO en S5 (2026-07-28)** — `getTeacherMpToken()` (`lib/mercadopago/token.ts`)
> refresca cuando quedan menos de 30 días y es el único camino al token para
> `create-payment` y el webhook. El cron nuevo `/api/cron/mp-connections` (07:00 UTC)
> lo hace además de forma proactiva y avisa al profesor (in-app + push) cuando el
> refresh falla. No verificable contra MP real (G-2). Detalle en §10.

**Dónde:** `apps/web/src/app/api/mercadopago/oauth/callback/route.ts:57,61` guardan `refresh_token` y `expires_at`. `grep` sobre todo el repo: **ninguna línea los lee jamás.** Los únicos consumidores de `teacher_mp_connections` (`create-payment/route.ts:56`, `webhook/route.ts:218`) leen solo `access_token`.

**Qué pasa.** Los access tokens de Mercado Pago Connect expiran (180 días en el estándar de MP). Al vencer, `create-payment` responde `mp_error` (502) y el webhook no puede leer el pago del vendedor. **Todos los pagos in-app de ese profesor dejan de funcionar en silencio**, sin aviso a nadie, y el único remedio es que el profesor descubra el problema y reconecte a mano.

Es una bomba de tiempo con mecha larga: no se manifiesta en el sandbox ni en las primeras semanas, aparece medio año después del lanzamiento, cuando ya hay dinero real en juego y nadie recuerda esta parte del código.

**Recomendación.** Helper `getTeacherMpToken(teacherId)` que, si `expires_at` está a menos de N días, llame a `POST /oauth/token` con `grant_type=refresh_token`, persista el par nuevo y devuelva el token vigente. Ambos consumidores pasan por ahí. Complementar con un chequeo diario en el cron que avise (notificación + email) a los profesores cuya conexión esté por vencer y no se haya podido refrescar.

### P1-2 · El tier de suscripción en mobile ignora la fecha de expiración

> ✅ **CERRADO en S6 (2026-07-28).** `getActiveTier`/`getActiveSubscription`/`getCancelledPendingExpiry`
> se movieron a `packages/shared/src/lib/subscriptionTier.ts` (misma lógica, ya
> respetaba `expires_at` + 7 días de gracia). `apps/web/src/lib/subscription.ts`
> quedó como re-export para no tocar los 15 importadores web. Los 9 puntos de
> mobile listados abajo —más un 10° encontrado de paso, `plans/success.tsx`, con
> el mismo patrón— ahora llaman a `getActiveTier(userId, supabase)` en vez de un
> `.eq('status','active').single()` crudo. Detalle en §10.

**Dónde:** 9 lugares en `apps/mobile` resuelven el plan con `subscriptions.select('tier').eq('status','active')` y nada más: `(tabs)/feed.tsx:99`, `(tabs)/profile.tsx:105`, `(tabs)/create.tsx:20`, `(tabs)/agenda.tsx:85`, `class/[id]/index.tsx:528`, `class/create.tsx:107`, `plans/index.tsx:56` y `:105`, `payment/[enrollmentId].tsx:58`, `plans/success.tsx:26`.

Web usa `getActiveTier` (`apps/web/src/lib/subscription.ts:47`), que además de `status` verifica `expires_at` con una ventana de gracia de 7 días.

**Qué pasa.** Nada en la app pasa una suscripción de `active` a `expired` por el simple paso del tiempo — solo se marca `expired` cuando se inserta una suscripción nueva. Y el webhook, ante un `paused` de MP (cobro fallido), **explícitamente decide no tocar la fila**: *"No tocamos el estado en BD: el expires_at natural actúa de grace period"* (`webhook/route.ts:305`). Ese `expires_at` natural es exactamente lo que mobile no mira.

**Consecuencia:** un usuario cuyo plan venció hace meses sigue con **plan Pro completo en la app móvil** (publica clases, sube videos, ve el FAB), mientras la web se lo niega correctamente. Es una fuga de ingresos y una inconsistencia visible entre plataformas.

**Recomendación.** Mover `getActiveTier` a `packages/shared` (es lógica pura sobre una fila, no depende del cliente de Supabase) y usarla desde los 9 puntos de mobile. De paso, cambiar los `.single()` por `.maybeSingle()`: hoy un usuario sin suscripción produce un error que se descarta silenciosamente.

### P1-3 · `/api/rehearsal/invite` permite spamear a toda la plataforma

> ✅ **CERRADO en S6 (2026-07-28)**, parcialmente respecto a la recomendación
> original. Se agregó Zod (`user_ids` como UUIDs, tope 100 — el mismo que ya
> tenía `create`, no 60 como decía el texto original) + `checkRateLimit(...,
> 'social')`. **No** se agregó el filtro "solo amigos/seguidores": se verificó
> que la UI (`CreateRehearsalModal`) invita por búsqueda libre sobre `profiles`
> (igual que `create`, que tampoco lo restringe) — la premisa "es lo que la UI
> ya hace de todos modos" no era correcta. Agregar esa restricción solo acá
> habría roto una función que hoy funciona así en ambas rutas a propósito, sin
> arreglar la inconsistencia (quedaría distinta de `create`). Detalle en §10.

**Dónde:** `apps/web/src/app/api/rehearsal/invite/route.ts:23`.

`const validIds = (user_ids ?? []).filter(id => id && id !== user.id)` — **sin límite de cantidad, sin validación de formato UUID y sin rate limit**. `profiles_select_all` es `USING (true)`, así que cualquier usuario puede enumerar todos los ids de la plataforma desde Explorar. Crear un ensayo y postear los N mil ids inserta N mil notificaciones de golpe.

`/api/rehearsal/create` sí valida `invite_ids` con Zod (documentado en `CLAUDE.md`); la ruta de invitar aparte quedó fuera de esa pasada.

**Recomendación.** Zod con `max(60)` e `.uuid()` (mismo límite que `create`), más `checkRateLimit(..., 'social')`. Y verificar que los invitados sean amigos o seguidores del creador, que es lo que la UI ya hace de todos modos.

### P1-4 · 39 de ~52 rutas de API no tienen rate limit

> ✅ **CERRADO en S6 (2026-07-28)** para las 9 rutas listadas en la tabla de abajo
> (incluye los dos server actions reales detrás de `ratings/upsert` y `reports`
> — ver nota). El resto de las ~30 rutas sin límite queda fuera de esta pasada
> (no estaban nombradas explícitamente). También se endureció el fail-open de
> `checkRateLimit`: si Upstash no está configurado **en producción**, ahora
> loguea una vez por proceso vía `logger.error` (nivel que Vercel/Sentry
> indexan) en vez de un `console.warn` silencioso — sigue sin bloquear tráfico
> (fail-open se mantiene a propósito, ver razón en S1). Detalle en §10.
>
> **Nota de S6:** `ratings/upsert` y `reports` tienen API routes (usadas por
> mobile) **y** server actions (`actions/ratings.ts`/`actions/reports.ts`, las
> que realmente llama la UI web — `RatingModal`/`ReportModal`). Las dos vías de
> cada feature quedaron limitadas; solo se detectó al verificar qué llamaba a
> cada ruta antes de tocarla.

`checkRateLimit` existe y está bien hecho (`apps/web/src/lib/rateLimit.ts`, 9 limitadores), pero solo 13 rutas lo llaman. Las ausencias con efecto secundario real, en orden de riesgo:

| Ruta | Qué permite abusar |
|---|---|
| `rehearsal/invite`, `rehearsal/create` | Spam masivo de notificaciones (ver P1-3) |
| `mercadopago/create-preference`, `create-subscription` | Crear preferencias en MP sin tope — llamadas a un tercero con cuota |
| `ratings/upsert` | Manipulación de reputación en volumen |
| `reports` | Inundar al superadmin de denuncias |
| `class-2x/match`, `packages/[id]/enroll` | Crear inscripciones en cadena |
| `chat/get-or-create` | Crear chats en volumen |

**Recomendación.** Una pasada aplicando el limitador que corresponda por familia. Es trabajo mecánico y de bajo riesgo. **Recordar que Upstash falla abierto por diseño** (`rateLimit.ts:70`): si las env vars faltan en Vercel, *ninguna* ruta está limitada y solo queda un `console.warn`. Vale la pena que el arranque en producción falle ruidosamente si Upstash no está configurado, en vez de degradar en silencio.

### P1-5 · Ratings falsificables por PostgREST directo

> ✅ **CERRADO en S1 (2026-07-28)** — se eligió la segunda opción de la recomendación: `ratings_insert_own` y `ratings_update_own` eliminadas, `/api/ratings/upsert` como único camino. Los dos puntos de **mobile** que escribían directo (`RatingPopup` y el perfil público) ahora llaman a esa ruta. `ratings_update_own` resultó ser el agujero más silencioso de los dos: sin `WITH CHECK`, permitía mover una valoración legítima a **otro** profesor.

**Dónde:** policy `ratings_insert_own` con `WITH CHECK (auth.uid() = rater_id)` — verificado en el stack local.

`POST /api/ratings/upsert` verifica que exista una inscripción confirmada con ese profesor antes de permitir la valoración. Pero la policy no exige nada de eso: un `INSERT` directo a `ratings` con cualquier `rated_user_id` pasa. Cualquier usuario puede poner 5 estrellas a quien quiera o hundir a un profesor con el que nunca tomó clases. El `UNIQUE(rater, rated)` limita a una por cuenta, no impide el ataque.

Las valoraciones son la señal de confianza principal del marketplace y se muestran en feed, perfil público y tarjetas. Una vez que se sepa que son falsificables, el dato deja de significar algo.

**Recomendación.** Endurecer `ratings_insert_own` para que exija `EXISTS (SELECT 1 FROM enrollments WHERE student_id = auth.uid() AND status='confirmed' AND class_id IN (SELECT id FROM classes WHERE teacher_id = rated_user_id))`, o bien quitar la policy de INSERT y dejar `/api/ratings/upsert` como único camino (más simple y consistente con lo que ya se hizo en `payments`).

### P1-6 · La toma de sesión OAuth de MP no exige sesión iniciada

> ✅ **CERRADO en S1 (2026-07-28)** — `if (!user || user.id !== userId)` en `callback/route.ts`. No verificable contra MP real (G-2), pero la ventana de 10 minutos sin sesión ya no existe.

**Dónde:** `apps/web/src/app/api/mercadopago/oauth/callback/route.ts:35` — `if (user && user.id !== userId)`.

Si **no hay** cookie de sesión, la comparación se salta y el callback vincula la cuenta MP del `code` al `userId` que venga en el `state`. El `state` es HMAC-firmado con TTL de 10 minutos (`lib/mercadopago/oauth.ts:43-57`), lo que hace el ataque estrecho, pero no imposible: quien obtenga el `state` de un profesor (queda en la URL de redirección, historial, referrer, un enlace compartido) tiene 10 minutos para completar el flujo desde un navegador sin sesión y **quedarse con los cobros de las clases de ese profesor**.

**Recomendación.** Exigir sesión: `if (!user || user.id !== userId) → error`. El flujo legítimo siempre viene del navegador del profesor, que tiene su cookie. Es un cambio de una línea que elimina la ventana completa.

### P1-7 · `deletion_date` no existe en mobile: banner mudo y deudores mal calculados

> ✅ **CERRADO en S6 (2026-07-28).** La consolidación de D-5 (S3) ya había
> movido `getClassDeletionDate` a `packages/shared` y la web ya la usaba —
> solo faltaba mobile. `my-classes.tsx` ahora calcula `getClassDeletionDate(cls)`
> por fila (la query ya trae `select('*')`, así que no hizo falta tocarla) en
> vez de leer `cls.deletion_date`, que nunca existió como columna. El aviso de
> archivos y el cálculo de deudores por profesor ya excluyen clases archivadas
> en mobile, a la par de web. Detalle en §10.

**Dónde:** `apps/mobile/app/(app)/(tabs)/my-classes.tsx:137,255,287`.

Mobile lee `cls.deletion_date`, pero ese campo es **derivado en el servidor web** (`apps/web/src/app/(app)/my-classes/page.tsx:115`, función `getClassDeletionDate`) y no es una columna de la base. Mobile consulta Supabase directo → el campo llega siempre `undefined`.

Efectos: (1) el aviso "Archivos serán eliminados el DD/MM" **nunca aparece** en mobile — el profesor no tiene forma de saber que perderá su material; (2) `isDeleted(...)` siempre devuelve `false`, así que `activeClasses` incluye clases archivadas y el **cálculo de deudores del profesor mezcla clases ya archivadas**, que web sí excluye.

**Recomendación.** Mover `getClassDeletionDate` a `packages/shared` (es la misma lógica que `lastSessionEnd` del cron, hoy triplicada en tres archivos) y calcularla en mobile al cargar. Unificar las tres copias en una sola función compartida y testeada.

### P1-8 · El profesor confirma alumnos desde el cliente, por fuera del flujo de pago (hallado en S1)

> ✅ **CERRADO en S4 (2026-07-28)** — migración `069_teacher_confirm_via_route.sql` + acción
> `confirm_offline` en `/api/payment/confirm`. El guard de `enrollments` quedó endurecido a
> "el profesor sólo puede `cancelled`", tal como lo dejaba anotado S1. Detalle en §10.

**Dónde:** `apps/web/src/components/class/MyClassesClient.tsx:772` (botón "Confirmar" del tab Historial) y `:227` / `apps/mobile/app/(app)/(tabs)/my-classes.tsx:166` (eliminar alumno).

**Qué pasa.** Son escrituras directas a `enrollments.status` desde el navegador. La de confirmar sí manda la notificación `payment_confirmed`, pero **no emite el token QR de asistencia** (054), no toca `payments` (no hay `confirmed_by`/`confirmed_at`, el pago queda como estaba) y no confirma al compañero de un 2x. Es la misma familia del `/dashboard` de **P0-2**, con la diferencia de que esta pantalla **sí está enlazada y se usa**: un alumno confirmado por ahí llega a la clase y el escaneo del QR lo rechaza.

**Por qué no se cerró en S1.** El guard de la migración `065` deja pasar al profesor a propósito (`confirmed`/`cancelled` y nada más): bloquearlo habría roto dos pantallas en producción sin dar una alternativa. La alternativa es justamente **S4-5** ("confirmación sin comprobante": ruta de servidor que registra el pago recibido fuera de la app, con `confirmed_by='teacher'` y rastro auditable). Cuando esa ruta exista, estas tres llamadas deben migrar a ella y el guard debe endurecerse a "solo `cancelled`" para el profesor.

**Mientras tanto:** el alumno queda `confirmed` sin QR. Es un defecto de producto visible, no un agujero de seguridad.

---

## 4. 🟡 Decisiones de diseño con mejor alternativa

Esta sección responde a tu pedido explícito de señalar decisiones ya tomadas donde veo una opción mejor. Cada una incluye por qué la actual es defendible y por qué creo que la alternativa gana.

### D-1 · iOS + suscripciones propias = riesgo real de rechazo en App Store 🔴

**Decisión actual:** lanzar en iOS con los planes Básico ($1.500) y Pro ($3.500) cobrados por Mercado Pago.

**El problema.** Apple distingue dos cosas y las trata de forma opuesta:

- **Pagar una clase de baile a un profesor** es un servicio del mundo real prestado fuera de la app. Está **permitido** cobrarlo con un procesador externo (Mercado Pago). Sin problema.
- **Los planes Básico/Pro de DanzClass desbloquean funcionalidad digital dentro de la app** (cupo de videos, publicar clases, features). Eso es contenido digital y Apple exige **In-App Purchase con su comisión (15–30%)**. Cobrarlo por Mercado Pago dentro de una app de iOS es exactamente lo que la guía 3.1.1 prohíbe, y es una de las causas de rechazo más frecuentes.

Con $1.500 CLP mensuales y 30% de comisión de Apple, el plan Básico deja ~$1.050. El modelo de negocio cambia.

**No puedo verificar esto por ti** — depende de cómo el revisor de Apple clasifique la app y no hay forma de saberlo sin someterla. Pero es un riesgo de negocio, no un detalle técnico, y merece una decisión consciente **antes** de invertir en el build de iOS.

**Alternativas, de menor a mayor costo:**
1. **Lanzar iOS después de web+Android** y usar ese tiempo para resolverlo con datos reales. Es lo que recomiendo: no bloquea nada y quita un gate incierto del camino crítico.
2. **Implementar IAP solo para los planes en iOS** (mantener MP en web y Android). Es la solución conforme, y es una sesión de trabajo grande más el flujo de validación de recibos de Apple.
3. **Que los planes no desbloqueen nada digital en iOS** y sean puro beneficio económico ("sin comisión de servicio al pagar clases"). Encaja mejor con la excepción de servicios reales, pero cambia la propuesta de valor del plan.

### D-2 · La comisión de MP se fija al tramo más caro para todos los profesores

> ✅ **RESUELTO en S5 (2026-07-28) por la opción (c), que además habilita (a) y (b).**
> El webhook lee el costo **real** que MP cobró (`fee_details` del pago aprobado,
> excluida la `application_fee`, que es la comisión de DanzClass) y lo persiste en
> `payments.mp_fee_amount` (migración 070). El panel de conciliación de `/admin`
> muestra ahora *cobrado al alumno* vs *cobrado por MP* vs **excedente retenido**, y
> `/terms` §6 (ES+EN) lo declara explícitamente en vez de callarlo. Elegir (a)
> devolver el excedente o (b) declararlo como comisión sigue siendo decisión del
> usuario — pero ahora hay dato real para tomarla en vez de una estimación.
> **Vigilancia extra:** si el excedente sale **negativo**, MP está cobrando más que
> el tramo estimado y el profesor no está recibiendo el 100%; el panel lo señala en
> coral con la constante que hay que revisar.

**Decisión actual:** `MP_FEE_RATE = 0.0319` (`packages/shared/src/lib/commission.ts:32`), el tramo de disponibilidad inmediata, aplicado a todos.

**Está bien razonado** y el comentario lo justifica con honestidad: la API de MP no expone el plazo de liberación por cuenta, y errar hacia arriba protege al profesor. Pero tiene una consecuencia que no está dicha en ninguna parte: **si el profesor tiene liberación a 10 o 30 días, MP le cobra menos que lo que se le cobró al alumno, y la diferencia se la queda DanzClass** — un ingreso no declarado como comisión, encima de la comisión que sí se declara.

Con $15.000 y liberación a 30 días (2,99% vs 3,19%), la diferencia es ~$36 por pago. Poco por transacción, pero es **dinero de terceros retenido por un margen de cálculo**, y `/terms` no lo menciona.

**Recomendación.** Decidir explícitamente y documentarlo: (a) devolver el excedente al profesor, (b) declararlo en `/terms` como parte de la comisión de servicio, o (c) mantenerlo pero registrarlo en la conciliación de `/admin` para que sea visible y contabilizable. Cualquiera sirve; lo que no sirve es que exista sin nombre.

### D-3 · `WEB_URL` hardcodeado 19 veces, con el dominio viejo

> ✅ **CERRADO en S6 (2026-07-28).** `packages/shared/src/lib/webUrl.ts` exporta
> `WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://dc-project-web.vercel.app'`
> — un solo literal en todo el repo. Reemplazado en los 17 archivos de mobile +
> `profile/page.tsx` + el widget embebible (los 19 originales), más 2
> encontrados de paso: `class/[id]/edit.tsx` tenía el literal inline (sin
> pasar por un `const WEB_URL`, por eso no apareció en el conteo original) y
> `event/[id]/index.tsx` ya intentaba leer `EXPO_PUBLIC_WEB_URL` pero con
> fallback `''` — como esa env var nunca se configuró, **aceptar/rechazar una
> invitación a evento desde mobile estaba roto** (fetch a una URL relativa sin
> origen, que React Native no resuelve). Los 7 route handlers de web con el
> patrón `APP_URL || NEXT_PUBLIC_APP_URL || 'https://dc-project-web...'`
> **no se tocaron** — ya priorizan env vars configuradas, quedan fuera del
> alcance que nombraba el audit. Detalle en §10.

**Decisión actual:** `const WEB_URL = 'https://dc-project-web.vercel.app'` copiado en **19 archivos** (17 de mobile + `apps/web/src/app/(app)/profile/page.tsx` + el widget embebible).

Ya compraste `danzclass.com` y el enlace de referido apunta ahí, pero las 19 constantes no. El día que apuntes el dominio, migrar esto es tocar 19 archivos a mano — y **basta olvidar uno para que una pantalla de mobile llame a un host que ya no sirve el backend**, con un fallo que solo se ve en producción y solo en esa pantalla.

**Recomendación.** Una constante en `packages/shared` (`WEB_URL`, leyendo `process.env.EXPO_PUBLIC_WEB_URL` con fallback). Migración mecánica, 30 minutos, elimina una clase entera de bug futuro.

### D-4 · La extensión del comprobante sale del nombre del archivo, no del contenido validado

> ✅ **CERRADO en S5 (2026-07-28)** — `detectReceiptType()` en
> `packages/shared/src/lib/receipts.ts`: la extensión y el `contentType` salen del
> tipo validado por magic bytes, en los **tres** puntos de subida (pantalla de pago
> web, pantalla de pago mobile —que no validaba nada— y paquetes). De paso, un
> RIFF que no es WEBP (un WAV, un AVI) dejó de pasar: la comprobación anterior sólo
> miraba 4 bytes. Detalle en §10.

**Dónde:** `apps/web/src/components/payment/PaymentClient.tsx:158-160`.

El código valida los *magic bytes* del archivo con rigor (JPEG/PNG/PDF/WEBP) y luego construye el nombre con `receipt.name.split('.').pop()`. Un archivo PNG válido llamado `comprobante.svg` se guarda como `.svg`: pasa la validación de contenido, pero queda con una extensión que `isPdfPath()` no reconoce y que el navegador puede interpretar como SVG al abrir la URL firmada en pestaña nueva (SVG ejecuta script en el origen de Supabase Storage).

Riesgo bajo y acotado, pero es gratis cerrarlo: **derivar la extensión del tipo ya validado**, no del input del usuario. De paso, el `upsert: true` con extensión variable deja huérfanos en Storage cada vez que el alumno cambia de formato (deuda ya conocida, esto la agrava).

### D-5 · La lógica de "última sesión de una clase" está triplicada

> ✅ **CERRADO en S3 (2026-07-28)** — todo el motor de fechas vive ahora en
> `packages/shared/src/lib/classSchedule.ts` con tests. Al consolidarlo apareció que
> **las copias ya habían divergido**: la rama `monthly` de mobile avanzaba con
> `setMonth`, que desborda cuando el día del mes es 29–31 (31 de enero + 1 mes = 3 de
> marzo), mientras la de web llevaba año/mes como enteros y lo evitaba. Detalle en §10.

La misma función existe tres veces con implementaciones independientes: `lastSessionEnd` (`cron/cleanup-classes/route.ts:490`), `getClassDeletionDate` (`my-classes/page.tsx:10`) y `getClassSessions` (`apps/web/src/lib/utils.ts`, con un gemelo en `apps/mobile/lib/utils.ts`).

Hoy las tres coinciden. La próxima vez que cambie la regla de fechas — y con la decisión de eliminar `weekly`/`biweekly` **va a cambiar en esta misma tanda** — hay cuatro sitios que actualizar y ninguna prueba que detecte si uno se quedó atrás. El síntoma sería el peor posible: clases archivadas y borradas antes de tiempo.

**Recomendación.** Consolidar en `packages/shared/src/lib/classSchedule.ts` (que ya existe y ya tiene tests) antes de tocar la recurrencia, no después.

### D-6 · Los recordatorios de clase y de pago no llegan como push

> ✅ **CERRADO en S6 (2026-07-28)** para las 12 rutas que insertaban notificaciones
> directo sin push (11 nombradas en el audit + `actions/reports.ts`, la vía real
> del `ReportModal` web, que no estaba en el grep original). Nuevo
> `apps/web/src/lib/notifyUsers.ts`: inserta y dispara push best-effort,
> agrupando por `(type, JSON(data))` — no solo por `type` — porque algunos
> llamadores (el cron) insertan en una sola llamada notificaciones de varias
> clases distintas a la vez; agrupar solo por tipo les habría mandado a todos
> el texto de la primera. `PUSH_LABELS` (antes solo en `/api/notifications/send`
> para los tipos que un cliente puede disparar) se centralizó ahí como fuente
> única. Los 5 sitios que **ya** empujaban push con texto dinámico propio
> (`lib/payments.ts`, `payment/confirm`, `cron/plan-content`,
> `cron/mp-connections`, `cron/monthly-charges`) se dejaron intactos —fuera del
> alcance que pedía el audit, y tocarlos habría sido riesgo sin necesidad sobre
> código de S4/S5 ya probado. Detalle en §10.

`sendPushToUsers` solo se invoca desde `/api/notifications/send`, `lib/payments.ts`, `payment/confirm` y `cron/plan-content`. Las 11 rutas que insertan notificaciones directo en la tabla **no envían push**: recordatorio de clase 24 h antes, recordatorio de pago, `2x_match`, `debt_warning`, invitación a ensayo, aviso de descuento, cancelación por timeout.

Push está construido, desplegado y con tokens registrados — y las notificaciones **más urgentes por naturaleza** (tu clase es mañana; te queda un día para pagar) son justamente las que no lo usan. El usuario tiene que abrir la app para enterarse de algo que existe precisamente para que no tenga que abrirla.

**Recomendación.** Extraer `notifyUsers(rows)` en `lib/notifications.ts` que inserte **y** dispare push (best-effort), y reemplazar los 11 `admin.from('notifications').insert(...)` por esa función. Cambio pequeño, mejora de producto grande.

---

## 5. ⚪ P2 — Deuda acotada y pulido

| # | Hallazgo | Dónde |
|---|---|---|
| ~~**P2-1**~~ | ✅ **Cerrado en S5.** `/api/payment/confirm` rechaza `confirm` y `reject` sobre un pago `payment_method='mp'` (409 `mp_payment_not_reviewable`): ese dinero lo resuelve MP, no el profesor. Si cobró en efectivo, el camino es `confirm_offline`, que además convierte la fila a `transfer` con `commission_amount = 0` (si no, la conciliación tributaria contaría una comisión que nadie cobró). ~~`/api/payment/confirm` no verifica `payment_method`: un profesor puede confirmar por API un pago MP que está `pending` porque el alumno nunca completó el checkout. La UI no lo expone (el botón exige `enrollment.status === 'payment_submitted'`), así que es hardening, no explotación.~~ | `api/payment/confirm/route.ts:54` |
| ~~**P2-2**~~ | ✅ **Cerrado en S5.** `create-payment` borra el comprobante huérfano del bucket y devuelve la inscripción a `pending_payment`; de paso rechaza (409) sobrescribir un pago ya `verified`. ~~Si el alumno sube comprobante (enrollment → `payment_submitted`) y después elige Mercado Pago, `create-payment` sobrescribe la fila de pago con `receipt_url: null` pero **no revierte el estado del enrollment**. El profesor queda viendo "Revisar pago" sobre un pago sin comprobante, y el archivo queda huérfano en Storage.~~ | `api/mercadopago/create-payment/route.ts:160-183` |
| ~~**P2-3**~~ | ✅ **Cerrado en S4.** `submit-transfer` no seteaba `recipient_teacher_id` al insertar, así que el índice antiduplicado `payments_op_dedup` **sólo protegía si el escaneo IA estaba activo**. Ahora lo setea en los tres caminos (alta, reenvío tras rechazo y cargo mensual). | `api/payment/submit-transfer/route.ts` |
| ~~**P2-4**~~ | ✅ **Cerrado en S5.** `markMpDisconnected()` activa la transferencia en las clases que quedarían impagables y devuelve el resumen; la UI avisa si además faltan los datos bancarios (lo único que no se puede reparar solo). Lo usan la desconexión manual y el cron cuando la conexión vence. ~~Desconectar Mercado Pago deja clases con `accepts_mp=true, accepts_transfer=false`. `/api/class/enroll` bloquea inscripciones nuevas (`no_payment_method`, correcto), pero **los alumnos ya inscritos con pago pendiente quedan sin ninguna vía de pago**.~~ | `api/mercadopago/oauth/disconnect/route.ts:15` |
| ~~**P2-5**~~ | ✅ **Cerrado en S6.** `.range()` en loop (páginas de 500) reemplaza la query sin paginar. Sin esto, PostgREST cortaba en 1000 filas por defecto: con más de 1000 clases activas, las siguientes ni se archivaban ni se procesaban, **en silencio, sin error** — peor que "lento con miles", directamente incorrecto. ~~El cron carga **todas** las clases activas con su media en una sola query sin paginar, en cada corrida. Va bien con cientos; con miles es un problema de memoria y timeout de función.~~ | `cron/cleanup-classes/route.ts:64` |
| ~~**P2-6**~~ | ✅ **Cerrado en S5.** `reverseClassPayment()` deja el pago en `refunded`, devuelve la inscripción a `pending_payment`, revoca el QR, des-confirma al compañero de un 2x y avisa a alumno y profesor. En una mensualidad de entrenamiento el mes vuelve a ser deuda sin tocar la inscripción. ~~Reembolsos y contracargos de Mercado Pago no revierten la inscripción: el webhook, tras `approved`, solo persiste `mp_status` en cambios posteriores. Un alumno puede pagar, obtener el QR, y pedir reembolso conservando el acceso.~~ | `mercadopago/webhook/route.ts:112-116` |
| ~~**P2-7**~~ | ✅ **Cerrado en S6.** Se eliminó por completo el bloque de purga de comprobantes de `archiveClass` — el bloque "P3-6" (S del 22-jul, más arriba en el mismo cron) ya purga `void`/`rejected`/`refunded` a los 90 días y deja los `verified` intactos a propósito; los dos convivían mal, y el de `archiveClass` **ganaba de mano** borrando evidencia de pagos verificados a las 24h. Archivar una clase ya no toca `payments` en absoluto — ese ciclo de vida vive solo en el bloque P3-6. ~~`archiveClass` borra los comprobantes de **todos** los pagos de la clase 24 h después de la última sesión, incluidos los `verified`. Convive mal con la retención de 90 días de P3-6 y con lo que `/privacy` promete sobre datos de pago.~~ | `cron/cleanup-classes/route.ts:522-535` |
| ~~**P2-8**~~ | ✅ **Cerrado en S6.** Los 8 `console.log`/`console.error` de `plans/success/page.tsx` (server component — sí corren en Vercel) migrados a `logger.info`/`logger.error` con evento + metadata estructurada. ~~5 `console.log` sobrevivientes en `plans/success/page.tsx` fuera del `logger` estructurado; salen sin nivel ni evento y no son filtrables en Vercel.~~ | `plans/success/page.tsx` |

---

## 6. 🧾 Gates que no son código

| # | Gate | Estado |
|---|---|---|
| **G-1** | **Aplicar las migraciones pendientes en producción, en orden.** Según los registros de sesión, `048`, `049` y `055`→**`072`** no están aplicadas. **`071`** (publicación de Realtime) y **`072`** (recursión RLS de ensayos) salieron de S7: la primera puede estar ya cubierta en prod si alguien activó Realtime a mano en el dashboard (la migración es idempotente y lo detecta); la segunda es la que hace que el detalle de ensayo funcione en mobile. `056` **requiere `055` primero** (usa `enrollments.hold_expires_at`). `061`/`062` deben ir **antes** de desplegar el código de marketplace v2, o la inscripción responde "clase no encontrada". Verificar en prod si `062` ya existe (query en el header del archivo). **`065` (guards de escritura RLS) es la que cierra P0-1: es la más urgente de todas, y va acompañada del deploy del código de S1** — sin el deploy, mobile seguiría escribiendo `ratings` directo y las valoraciones fallarían en silencio. | ⛔ Bloqueante |
| **G-2** | **QA con sandbox de Mercado Pago** (Sesión 5 de `marketplace-payments-v2-plan.md`): tokens, firma del webhook, split real, gross-up. Nunca se ha ejecutado contra MP real. No es automatizable — requiere tus cuentas de prueba. | ⛔ Bloqueante |
| **G-3** | **Revisión legal chilena** de `/terms` §6-7 y `/privacy` §5. Es borrador escrito por un modelo, con encuadre tributario del split y responsabilidad por fraude. | ⛔ Bloqueante |
| **G-4** | **`ANTHROPIC_API_KEY` en Vercel.** Sin ella, el escaneo IA de comprobantes cae a `scan_status='failed'` en silencio y todo va a revisión manual. `QR_TOKEN_SECRET` también es obligatoria (sin ella no se emite ningún QR). | ⚠️ Verificar |
| **G-5** | **Backups de base de datos.** Sigue siendo el único hueco de seguridad de datos abierto desde 2026-05-27: Supabase free no tiene backups automáticos. Con pagos reales entrando, es indefendible. Pro ($25/mes, PITR diario) o `supabase db dump` programado. | ⛔ Bloqueante |
| **G-6** | **Dominio `danzclass.com`.** ✅ **Verificado en vivo el 2026-07-29** (`curl` contra `https://www.danzclass.com`): apunta a Vercel (`server: Vercel`), sirve la app real (CSP idéntica a la documentada, redirige la raíz a `/feed` correctamente) — el apex sin `www` redirige a `www`. **Queda pendiente solo lo que no es verificable desde afuera:** confirmar que `APP_URL`/`NEXT_PUBLIC_APP_URL` en Vercel ya apunta a `https://www.danzclass.com` (si no, el embed widget y otros usos de `APP_URL` siguen generando el dominio de Vercel) y que Site URL + Redirect URLs de Supabase incluyen `https://www.danzclass.com` (si no, reset de contraseña/magic link fallarían ahí, aunque el login normal no se ve afectado). Con el dominio confirmado, ya tiene sentido setear `EXPO_PUBLIC_WEB_URL=https://www.danzclass.com` en la config de EAS para el próximo build mobile. | 🟡 Dominio listo, verificar las 2 env vars restantes |

---

## 7. Plan de acción — sesión a sesión

Cada sesión es autónoma, entrega algo verificable y deja el repo en verde (typecheck + tests). El orden **no** es por severidad pura: está ordenado para que cada sesión desbloquee a la siguiente y para que lo irreversible (dinero, esquema) se haga antes de lo cosmético.

Los modelos y esfuerzos van justificados por el tipo de trabajo, no por el tamaño: razonamiento alto para lo que exige mantener muchas invariantes en la cabeza a la vez (RLS, dinero, migraciones de datos); esfuerzo bajo para lo mecánico y verificable.

---

### S1 · Cerrar la superficie RLS · `opus high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué primero.** Es el único hallazgo explotable hoy, desde el navegador, sin cuenta especial. Todo lo demás puede esperar una semana; esto no debería estar abierto ni un día más de lo necesario. Y es un cambio de esquema: cuanto antes se aplique, menos datos escritos por el camino viejo hay que reconciliar.

**Por qué `opus high`.** Escribir policies y triggers de RLS es donde un error no se ve: una policy demasiado laxa deja el agujero abierto, una demasiado estricta rompe una escritura legítima en una pantalla que nadie prueba hasta producción. Exige razonar sobre *todos* los caminos de escritura simultáneamente. Ya hay dos precedentes en este repo de policies mal escritas que pasaron revisión y vivieron meses (la recursión de `chat_participants` en `037`, la tautología `cp.chat_id = chat_id` en la misma migración).

**Objetivos:**
1. Migración `065`: triggers `BEFORE UPDATE` que blindan columnas de decisión ajena en `enrollments` (`status`, `hold_expires_at`, `is_2x`, `partner_enrollment_id`), `profiles` (`referral_rewarded`, `referred_by`, `is_confirmed`, `mp_connected`, `deleted_at`), `event_enrollments.status`, `package_enrollments.status` y `class_2x_requests` (`status`, `matched_with`, `payment_assignee`). Patrón: exceptuar `service_role`, igual que `060`.
2. Eliminar `payments_insert_student` (ya no hay cliente que inserte pagos).
3. Endurecer `ratings_insert_own` con verificación de inscripción confirmada (P1-5).
4. `rewardReferralIfNeeded`: rechazar auto-referidos y exigir suscripción pagada verificable.
5. Callback OAuth de MP: exigir sesión iniciada que coincida con el `state` (P1-6).
6. **Suite de pruebas de RLS** en `tests/integration/` que reproduzca los 4 ataques de P0-1 y afirme que ahora fallan. Sin esto, el fix no tiene red de seguridad y la próxima migración puede reabrirlo.

**Verificación:** los 4 ataques rechazados contra el stack local; los flujos legítimos (inscribirse, salirse, pagar, confirmar, valorar) siguen funcionando end-to-end.

---

### S2 · Bugs P0 restantes + limpieza de typecheck mobile · `sonnet high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué segundo.** Son defectos aislados, de diagnóstico ya cerrado y arreglo evidente. Sacarlos temprano deja el resto del trabajo sobre una base sin crashes conocidos.

**Por qué `sonnet high`.** El trabajo de diagnóstico ya está hecho en este documento — queda ejecución cuidadosa sobre archivos independientes. `high` y no `medium` porque los 18 errores de tipo restantes hay que resolverlos *entendiendo* cada uno, no silenciándolos con `any`: silenciarlos reintroduce exactamente el problema que P0-3 acaba de demostrar.

**Objetivos:**
1. **P0-2:** borrar `app/(app)/dashboard/` y `DashboardClient.tsx`.
2. **P0-3(a):** `Avatar size` en `event/[id]/index.tsx` → `'md'`/`'sm'`. **Verificar abriendo un evento en mobile**, no solo con typecheck.
3. **P0-3(b):** `src` → `url` en chat, chats y financiero.
4. **P0-3(c):** pasar `count` a `StarRating` en el perfil público mobile.
5. **P0-4:** columna `enrollments.pending_since` (migración `066`), seteada en los 4 puntos que llevan a `pending_payment`, y usada por los 3 barridos del cron.
6. **Dejar `tsc` de mobile en 0 errores** y agregar el typecheck de mobile a `.github/workflows/ci.yml`, que hoy solo corre el de web. Sin el gate de CI, la deuda vuelve.

**Verificación:** typecheck mobile en 0; recorrido manual de evento, chat y perfil público en el simulador; prueba de integración de que rechazar un pago no cancela la inscripción.

---

### S3 · Clases periódicas: solo fechas personalizadas, acotadas a un mes · `opus high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué acá.** Es tu decisión de producto y **debe ir antes de S4**: el modelo de cobro de entrenamientos se apoya en cómo quedan definidas las fechas.

**Por qué `opus high`.** No es solo borrar dos opciones de un `<select>`. `weekly`/`biweekly` aparecen en **18 archivos y 45 referencias**, incluidos `getClassSessions` (cálculo de sesiones), el cron de recordatorios (rama de periódicas, `cleanup-classes:133-157`), `lastSessionEnd`, `lib/ics.ts`, la agenda y `resolveClassStartDate`. Y hay **datos existentes**: las clases `weekly`/`biweekly` ya publicadas necesitan convertirse a `custom_dates` sin perder sesiones ni romper inscripciones pagadas. Eso es una migración de datos con dinero detrás — el escenario donde un error es caro y silencioso.

**Objetivos:**
1. Consolidar primero la lógica de fechas triplicada en `packages/shared` (**D-5**), con tests, y recién después cambiar la regla. Hacerlo al revés multiplica por cuatro la superficie de error.
2. Migración `067`: convertir clases `weekly`/`biweekly` existentes a `custom_dates` (expandiendo sus ocurrencias), restringir el CHECK de `recurrence` y documentar el rollback.
3. Formularios (4: web crear/editar, mobile crear/editar): eliminar las opciones, dejar el calendario como único modo, y **validar que las fechas caigan dentro de un mismo mes calendario**.
4. Actualizar consumidores: cron de recordatorios, `lastSessionEnd`, ICS, agenda, `ClassCard`, detalle de clase.
5. Tests unitarios de las fechas nuevas + prueba de integración de la migración de datos (crear una `weekly`, migrar, verificar que las sesiones coinciden).

**Verificación:** contra el stack local con clases `weekly`/`biweekly` sembradas; comparar la lista de sesiones antes y después de migrar.

---

### S4 · Entrenamientos: cobro mensual con deuda acumulada · `opus high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué acá.** Es la feature más grande del plan y toca dinero real. Va después de S1 (para no construir sobre RLS agujereada), de S2 (base sin crashes) y de S3 (fechas ya estabilizadas).

**Por qué `opus high`.** Hay que **quitar `payments_enrollment_id_key UNIQUE(enrollment_id)`**, que es un supuesto grabado en toda la app: `PaymentClient`, `MyClassesClient`, el Panel Financiero, la conciliación de admin, el escaneo IA, el webhook y `autoConfirmPayment` asumen "un enrollment ↔ un pago". Cambiar esa cardinalidad sin romper el historial existente ni la contabilidad ya registrada exige sostener muchas invariantes a la vez. Es exactamente el perfil de trabajo donde un modelo con menos razonamiento produce código que compila y pierde plata.

**Objetivos, según tu especificación:**
1. **Esquema (migración `068`):** `payments.billing_period` (`YYYY-MM`), `UNIQUE(enrollment_id, billing_period)` reemplazando el unique actual, backfill de los pagos existentes al mes de `submitted_at`.
2. **Generación de deuda:** para cada entrenamiento activo, generar el cargo del mes en `billing_day`. Deuda **acumulativa**: los meses impagos se suman y ninguno se cancela ni se borra.
3. **El QR es la única consecuencia.** Cambiar el gate de `/api/attendance/scan` (`route.ts:137`) de `enrollment.status === 'confirmed'` a "sin deuda vencida". La inscripción **nunca se cancela por impago** — los alumnos de un entrenamiento son fijos tras la audición, tal como lo definiste.
4. **Pago atrasado:** la pantalla de pago deja de redirigir cuando el enrollment está `confirmed` (`payment/[enrollmentId]/page.tsx:37`) y pasa a mostrar la deuda acumulada, permitiendo pagar uno o varios meses. El comprobante entra por `submit-transfer` con su `billing_period`, y el escaneo IA funciona igual.
5. **Confirmación sin comprobante:** acción nueva en `/api/payment/confirm` para que el profesor registre un pago recibido fuera de la app (efectivo, transferencia directa). Debe quedar auditable: `confirmed_by='teacher'`, `receipt_url=null`, y marcado como tal en el historial — es la ruta más fácil de abusar y la que más necesita rastro.
6. **UI del profesor:** deuda acumulada por alumno en el tab "Dicto" y en el Panel Financiero, con el mes al que corresponde cada cargo.
7. **Paridad mobile completa** de todo lo anterior.

**Verificación:** pruebas de integración contra el stack local cubriendo el ciclo completo — generar cargo, no pagar, perder QR, acumular dos meses, pagar atrasado, confirmar sin comprobante, verificar que el Panel Financiero suma cada mes por separado.

**Nota honesta de alcance:** esta sesión puede necesitar partirse en dos (esquema + backend / UI web + mobile). Es preferible partirla que apurarla.

---

### S5 · Endurecimiento de la plataforma de pagos · `opus high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué acá.** Cierra los riesgos de dinero que no son explotables *hoy* pero sí en 3–6 meses de operación. Va antes del QA porque son cambios de comportamiento que el QA debe cubrir.

**Por qué `opus high`.** El refresh de tokens OAuth y la reversión por reembolso son lógica de estado distribuida entre la app y un tercero, con reintentos, idempotencia y consecuencias irreversibles sobre acceso ya otorgado.

**Objetivos:**
1. **P1-1:** helper `getTeacherMpToken()` con refresh automático + aviso al profesor si la conexión está por vencer y no se pudo refrescar.
2. **P2-6:** el webhook revierte la inscripción y revoca el QR ante `refunded` / `charged_back`.
3. **P2-1, P2-2, P2-3, P2-4:** los cuatro huecos de coherencia entre vías de pago.
4. **D-2:** decidir y documentar qué pasa con el excedente del tramo de comisión de MP.
5. **D-4:** derivar la extensión del comprobante del tipo validado.

---

### S6 · Paridad, notificaciones y limpieza transversal · `sonnet high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué `sonnet high`.** Es trabajo amplio pero de criterio ya fijado en este documento: extraer helpers compartidos y reemplazar llamadas. Cada cambio es local y verificable por separado; no hay invariantes globales que sostener.

**Objetivos:**
1. **P1-2:** `getActiveTier` a `packages/shared`, aplicada en los 9 puntos de mobile, `.single()` → `.maybeSingle()`.
2. **P1-7:** `getClassDeletionDate` a `packages/shared` y usada en mobile.
3. **D-3:** `WEB_URL` como constante compartida (19 archivos).
4. **D-6:** `notifyUsers()` que inserta **y** manda push; migrar las 11 rutas.
5. **P1-4:** rate limit en las rutas que faltan; hacer que la ausencia de Upstash falle ruidosamente en producción.
6. **P1-3:** Zod + cap + rate limit en `rehearsal/invite`.
7. **P2-5, P2-7, P2-8:** paginar el cron, revisar la purga de comprobantes a 24 h, migrar los `console.log` al logger.

---

### S7 · QA dedicado: Eventos, Ensayos, Paquetes, Chat · `opus high` — ✅ COMPLETA (2026-07-28, ver §10)

**Por qué `opus high`.** QA exploratorio sobre features poco ejercitadas es de los trabajos donde más rinde el razonamiento: hay que *inventar* los caminos que nadie recorrió, no seguir una lista. P0-3(a) es la prueba de lo que se acumula ahí — una feature completa inutilizable en mobile sin que nadie lo notara.

**Objetivos:** recorrer cada feature end-to-end en web y mobile, con dos cuentas reales, en claro y oscuro, cubriendo: eventos con y sin entrada pagada, invitaciones a profesores, ensayos con coordinación de disponibilidad, paquetes de 2+ clases con su pago, y chats de clase y de ensayo (incluida la verificación de que `059` cerró de verdad la recursión y la fuga de lectura). Cada bug encontrado se arregla en la misma sesión si es acotado, o se registra con evidencia si no.

---

### S8 · Gates finales y despliegue · `sonnet medium` + trabajo tuyo — 🔶 EN PREPARACIÓN (2026-07-29, ver §10 y §11)

**Por qué `sonnet medium`.** A esta altura solo queda ejecutar una checklist y verificar. El razonamiento pesado ya se gastó.

**Objetivos:**
1. Aplicar las migraciones en producción **en orden** (G-1), verificando el estado real de cada una antes.
2. Verificar env vars (G-4), configurar backups (G-5), apuntar el dominio (G-6).
3. **Tuyo:** QA con sandbox de Mercado Pago (G-2) y revisión legal (G-3).
4. **Tuyo:** decisión sobre iOS + IAP (D-1) — idealmente resuelta mucho antes de esta sesión.
5. Tag `v1.0.0`, build EAS de Android, y submit a las tiendas según lo que se decida en D-1.

**Estado real al 2026-07-29 (confirmado por el usuario al iniciar S8):** nada de S1–S7 se ha desplegado a producción todavía — ni las 24 migraciones pendientes (`048`, `055`→`072`) ni el código. El plan del usuario siempre fue terminar todas las sesiones de auditoría primero, aplicar las migraciones después, y recién entonces hacer push/deploy del código. `git status` muestra `origin/main == HEAD` en el commit `30a185e` (ya incluye el trabajo de S1–S7 mergeado a `main`) — **verificar en el dashboard de Vercel si ese commit ya se autodeployó** antes de asumir que producción sigue en el código viejo; si Vercel autodeploya desde `main` sin un paso de promoción manual, esto ya podría estar sirviendo código que espera columnas que la DB de prod no tiene todavía.

**Esta sesión (la 8ª de trabajo sobre `audit.md`) no ejecutó nada contra producción** — ni migraciones ni deploy — porque el usuario pidió específicamente preparar el checklist y ejecutarlo él mismo (aplicar migraciones y hacer push es una acción de alto riesgo/irreversible que corresponde confirmar y ejecutar directamente a quien tiene las credenciales). El entregable de esta sesión es el **§11 · Checklist de despliegue a producción**, con el orden exacto de las 24 migraciones, qué va acoplado a qué deploy de código, qué necesita respaldo antes de correr, y un hueco de documentación nuevo encontrado en G-4 (`QR_TOKEN_SECRET`, ver abajo).

---

## 8. Orden sugerido y dependencias

```
S1 (RLS) ✅ ───────┬─→ S4 (cobro mensual) ✅ ─→ S5 (pagos) ✅ ─→ S7 (QA) ─→ S8 (deploy)
                  │
S2 (P0 + tsc) ✅ ─┤
                  │
S3 (periódicas) ✅ ┘

S6 (paridad) ✅ — sin dependencias fuertes, se intercaló después de S5
D-1 (iOS/IAP) — decisión tuya, cuanto antes mejor: puede cambiar S8 por completo
```

**Camino crítico:** S1 → S3 → S4 → S5 → S7 → S8. S2 y S6 son paralelizables. **Completo hasta S6; solo quedan S7 y S8.**

**Si hubiera que recortar** para lanzar antes: S1, S2 y S8 son irrenunciables. S3 y S4 son tu decisión de producto y podrían diferirse documentando el límite actual en la UI. S5 puede diferirse **solo si el lanzamiento es acotado en el tiempo** — sus riesgos maduran en meses, no en días. S6 y S7 son los que más cuesta justificar recortar, porque son los que el usuario final ve.

---

## 9. Lo que no pude verificar

Para que quede explícito y no se lea como validado:

- **Mercado Pago real.** El split, la firma del webhook, el `marketplace_fee` y el gross-up nunca corrieron contra MP. Todo lo que digo sobre ellos es lectura de código y aritmética, no observación.
- **Comportamiento de App Store.** D-1 es una lectura de las guías de Apple, no una predicción de lo que hará un revisor concreto.
- **Estado real de producción.** No tengo acceso a la base de producción. Todo lo verificado empíricamente lo fue contra el stack local de Docker. *(Actualización S1: el `db:reset` de esa sesión replayeó el historial completo desde cero, así que el registro `schema_migrations` local ya muestra las 65 filas y vuelve a ser confiable **en local**. En producción sigue valiendo lo dicho: verificar columna por columna antes de aplicar nada, G-1.)*
- **Renderizado real.** No corrí la app. Los bugs de mobile de P0-3 están deducidos del código y del tipo del componente, con la cadena de razonamiento completa en cada caso; el de eventos (`SIZE_MAP[40]` → `undefined` → destructuring) es determinista, pero conviene confirmarlo abriendo la pantalla antes de dar el fix por cerrado.

---

## 10. Registro de sesiones

### S1 · Cerrar la superficie RLS — ✅ completa (2026-07-28)

**Entregable:** migración `065_write_guards_rls.sql` + suite `tests/integration/rls-guards.spec.ts` + 3 cambios de código. Todo verificado contra el stack local; **producción no se tocó**.

**Método.** Antes de escribir una sola línea de fix se construyó la suite de ataques y se corrió como *baseline*, con JWT de usuario real contra PostgREST (no con `psql`): es el mismo camino que usaría un atacante desde el navegador. Resultado del baseline: **13 de 13 escrituras ilegítimas pasaron**. Después del fix: 13 de 13 rechazadas, con los flujos legítimos intactos.

**1. Guards por columna (6 triggers `BEFORE INSERT/UPDATE`).** `enrollments`, `profiles`, `event_enrollments`, `event_payments`, `package_enrollments`, `class_2x_requests`. Se blindan solo las columnas que representan **una decisión ajena** (estado de inscripción/pago, turno de pago 2x, hold de cupo, flags de identidad y del programa de referidos), no todo lo que el dueño puede tocar. El rol privilegiado (service role) queda exento: todas las rutas de servidor usan `createAdminClient()`.

**2. Dos tablas se cerraron por completo al cliente.**
- `payments`: eliminadas `payments_insert_student` y `payments_update_teacher`. Desde `submit-transfer` ningún cliente inserta pagos, y el único que los actualizaba es el `/dashboard` zombi de P0-2.
- `ratings`: eliminadas `ratings_insert_own` y `ratings_update_own`; `/api/ratings/upsert` queda como puerta única, porque la regla real de elegibilidad (inscripción confirmada **y** clase ya ocurrida) no se puede expresar razonablemente en una policy.

**3. Cambios de código.**
- `apps/mobile/lib/ratings.ts` (nuevo) + `RatingPopup` + perfil público mobile: las dos escrituras directas a `ratings` pasan por la ruta, con mensaje de error visible cuando no hay elegibilidad (antes fallaban en silencio).
- `lib/referral.ts`: rechaza auto-referidos y exige que el referido tenga una suscripción **pagada** de verdad (`mp_subscription_id` sin el prefijo `referral_`, vigente). Con el guard de `profiles` el ciclo de P0-1 ya estaba roto; esto es la segunda capa, en el lado que decide plata.
- `mercadopago/oauth/callback`: `if (!user || user.id !== userId)` — se exige sesión, no solo coincidencia cuando la hay (P1-6).

**Decisiones tomadas (y por qué), para no re-litigarlas en sesiones futuras:**

- **El profesor sigue pudiendo cambiar `enrollments.status` desde el cliente** (solo a `confirmed` o `cancelled`). Bloquearlo habría roto dos pantallas vivas — "Confirmar" del Historial y "Eliminar alumno", web y mobile — sin ofrecer alternativa. La alternativa es **S4-5**; ver el hallazgo nuevo **P1-8**.
- **Se usaron triggers y no `WITH CHECK`** porque hay que comparar `NEW` vs `OLD` columna a columna, cosa que una expresión de policy no puede hacer. Mismo patrón que `060`.
- **`enrollments_insert_student` se conservó** (con el guard neutralizando `status`/`hold_expires_at`/`is_2x`/`partner_enrollment_id`) en vez de eliminarla como en `payments`: hoy ningún cliente inserta inscripciones, pero si mañana alguno lo hace, es preferible que nazca inofensiva a que la pantalla falle.
- **La suite prueba las dos mitades.** La segunda mitad (flujos legítimos) no es decorativa: es lo que evita que el próximo guard rompa una pantalla que nadie abre hasta producción.

**Trampa que costó una vuelta y conviene recordar:** las funciones de trigger necesitan `SET search_path = public` **aunque no sean `SECURITY DEFINER`**. Sin eso, el trigger `handle_email_confirmed` de `018` — que corre como `supabase_auth_admin` en **todo** signup, con `search_path` = solo `auth` — no resuelve la llamada al helper y **rompe el registro de usuarios entero** ("Database error creating new user"). Es exactamente el bug que `050` tuvo que corregir en `handle_new_user`, repetido. Toda función nueva que un trigger pueda invocar debe llevar `SET search_path`.

**Verificación:** `npm run db:reset` (replay de las 65 migraciones desde cero, para no depender del orden incremental) → suite de integración 3/3 verde → `tsc` web limpio → mobile en los mismos **21** errores preexistentes, ninguno nuevo → 182 unit tests verdes.

**Hallazgos nuevos registrados en este documento:** 4 vectores extra en **P0-1** (insert de inscripción ya confirmada, mudanza de `class_id`, `event_payments` verificado desde el cliente, profesor poniendo la comisión en cero), el agravante de **P0-2** (su escritura a `payments` ahora es un no-op silencioso) y **P1-8** (confirmación de alumnos por fuera del flujo de pago, sin QR).

**Bug corregido de paso:** el `RatingPopup` de mobile filtraba `enrollments` por `user_id`, columna que no existe (es `student_id`) — la consulta fallaba y **el popup no aparecía nunca**. Se corrigió al reescribir su envío.

**Pendiente que deja S1:**
1. **Aplicar `065` en producción** (ver G-1) junto con el deploy del código de esta sesión — el orden importa: si se deploya el código sin la migración, nada se rompe; si se aplica la migración sin el código, las valoraciones desde mobile fallan hasta el deploy.
2. **S2 debe borrar `/dashboard`** (P0-2): hoy quedó a medio camino.
3. **S4 debe cerrar P1-8** y endurecer el guard de `enrollments` a "solo `cancelled`" para el profesor.

---

### S2 · Bugs P0 restantes + limpieza de typecheck mobile — ✅ completa (2026-07-28)

**Entregable:** borrado de `/dashboard`, 3 fixes de UI mobile + los 18 errores de `tsc` restantes resueltos (no silenciados), migración `066_enrollments_pending_since.sql`, job `typecheck-mobile` en CI. Todo verificado contra el stack local (`db:reset`); **producción no se tocó**.

**1. P0-2 — `/dashboard` eliminado.** `grep` confirmó cero referencias (ni links, ni imports) antes de borrar `apps/web/src/app/(app)/dashboard/` y `DashboardClient.tsx`. No había nada que preservar — `MyClassesClient` + `/payment/review/[paymentId]` ya cubren el flujo completo y correcto.

**2. P0-3 — los 3 bugs de mobile, más los 18 "de ruido" que en realidad tapaban el patrón.**

- **(a) Evento crasheaba siempre:** `Avatar size={40}`/`size={36}` en `event/[id]/index.tsx` → `AvatarSize` solo acepta `'xs'|'sm'|'md'`, así que `SIZE_MAP[40]` era `undefined` y el destructuring reventaba en cada render. Cambiado a `size="md"`/`size="sm"`. **No se pudo confirmar abriendo la pantalla en simulador** (el entorno de esta sesión no tiene uno disponible; correr Expo Go requiere el flujo de tunnel ngrok + teléfono real documentado en `CLAUDE.md`) — la corrección se apoya en la misma lectura de tipos determinista que el propio hallazgo del audit, no en observación. Pendiente confirmarlo visualmente en la próxima sesión con dispositivo a mano.
- **(b) Avatares nunca cargaban en Chat/Chats/Financiero:** 4 sitios (`financiero.tsx`, `chats.tsx`, `chat/[id].tsx` ×2) pasaban `src={...}` en vez de `url={...}` (la prop real de `Avatar`). Corregido, con `?? null` donde el valor podía ser `undefined` (la prop es `string | null`).
- **(c) Estrellas ausentes en perfil público:** `<StarRating value={avgStars} readOnly size="sm" instanceId="profile-stats" />` — ni `readOnly` ni `instanceId` son props reales del componente, y sin `count` la rama de display siempre retornaba `null`. Cambiado a `<StarRating value={avgStars} count={ratingCount} size="sm" />` (`ratingCount` ya estaba en scope). Se corrigió el mismo patrón de prop inexistente (`instanceId`) en otros dos usos interactivos (`teacher/[username].tsx` línea 291, `RatingPopup.tsx`) que no rompían nada en runtime pero sí el typecheck.
- **Los 18 restantes eran reales, no ruido:** 2 íconos Lucide con `style={{ transform: ... }}` para rotar un chevron (`agenda.tsx`, `rehearsal/[id]/index.tsx` ×2) — el shim `types/lucide.d.ts` declaraba `color`/`stroke` pero no `style`; se agregó `style?: StyleProp<ViewStyle>` al shim. El resto (`agenda.tsx`, `chats.tsx`, `class/[id]/edit.tsx`, `class/create.tsx`, `class/create-post.tsx`, `chat/[id].tsx`) eran parámetros de callback sin tipo inferible — la causa raíz es el shim de compatibilidad React 19/RN 0.81 (`react-component-compat.d.ts`, documentado en `CLAUDE.md`) que fuerza el genérico de `FlatList` a perderse en varios call sites. Se anotaron explícitamente (tipo real donde se conocía la forma exacta — `Message`, `{id,title}` — y `any` donde ya era la convención establecida del archivo, como en `chats.tsx:97`). **`tsc --noEmit` de mobile: 0 errores.**

**3. P0-4 — `enrollments.pending_since` (migración `066`), pero no como proponía la recomendación original.** El plan de sesión (y la recomendación original del hallazgo) proponían setear la columna a mano en "los 4 puntos que llevan a `pending_payment`" (inscripción, reactivación, rechazo, revert de IA). Se descartó ese diseño y se implementó como parte del trigger `enrollments_write_guard` (el mismo de `065`) por dos razones:

- Es exactamente la misma clase de bug que P0-4 demuestra: una actualización de estado olvidada en un rincón del código. Confiar en que un 5º punto futuro (o uno de los 4 actuales, en una futura refactorización) se acuerde de tocar `pending_since` es reproducir el problema, no cerrarlo.
- Dejarla escribible desde la app reabriría el patrón de fondo de P0-1: cualquier columna que un caller pueda setear libremente es superficie de ataque hasta que se demuestre lo contrario.

La función recalcula `pending_since` **para todo caller, privilegiado o no**, antes de cualquier otra verificación: `now()` si `status` entra a `pending_payment` (INSERT o transición), `NULL` si sale, y `OLD.pending_since` sin cambios en cualquier otro caso — así que cualquier valor que un cliente intente escribir en esa columna directamente (sin tocar `status`) se descarta silenciosamente. Los 3 barridos del cron que medían con `created_at` (timeout 2x de 7 días, reserva impaga de 72h, recordatorio de pago de 24h) ahora filtran por `pending_since`; el barrido de holds vencidos (que usa `hold_expires_at`) no necesitaba cambios. Backfill: las filas ya `pending_payment` heredan `pending_since = created_at` (mismo comportamiento impreciso que tenían hasta ahora, no lo empeora; el trigger corrige el reloj hacia adelante desde la migración).

**No se agregó la "red de seguridad adicional"** que sugería la recomendación (excluir del barrido pagos `rejected` con `confirmed_at` reciente) — con `pending_since` correctamente mantenido por trigger, esa capa extra es redundante, no una segunda defensa necesaria.

**4. CI — typecheck de mobile ahora es un gate real.** Nuevo script `"typecheck": "tsc --noEmit"` en `apps/mobile/package.json` (no existía) + job `typecheck-mobile` en `.github/workflows/ci.yml`, paralelo al de web. Antes de esta sesión, nada impedía que el conteo de errores "tolerados" creciera sin que nadie lo notara — que es exactamente cómo un crash de pantalla completa (P0-3a) pasó semanas invisible.

**Verificación:** `npm run db:reset` (replay de las 66 migraciones desde cero) → suite de integración 3/3 verde (incluye `twox-payment.spec.ts`, que ejercita en un escenario real — vía `unconfirmTwoxPartner` — exactamente la transición "vuelve a `pending_payment`" que `pending_since` tiene que capturar) → `tsc --noEmit` web limpio → `tsc --noEmit` mobile **0 errores** (antes 21) → 182 unit tests verdes. La verificación de `pending_since` es por lectura de código + por el comportamiento observado indirectamente en `twox-payment.spec.ts`; un intento de verificación directa por `psql` con filas sintéticas se abandonó por la complejidad de satisfacer el FK `profiles.id → auth.users` a mano — no aporta nada que la integración ya no cubriera.

**Pendiente que deja S2:**

1. **Confirmar visualmente el fix de `event/[id]/index.tsx`** abriendo la pantalla en un dispositivo/simulador real (no disponible en este entorno) — la corrección es sólida por tipos, pero el propio audit pedía esa confirmación antes de darla por cerrada del todo.
2. **Aplicar `066` en producción junto con `065`** (mismo capítulo de G-1: ambas migraciones tocan `enrollments` y conviene desplegarlas juntas con el código que ya asume `pending_since`).
3. **S3 y S4 siguen pendientes** tal como estaban planificadas; nada de esta sesión las bloquea ni las adelanta.

---

### S3 · Clases periódicas: solo fechas personalizadas, acotadas a un mes — ✅ completa (2026-07-28)

**Entregable:** consolidación del motor de fechas en `packages/shared` (**D-5**), migración `067_periodica_custom_dates_only.sql`, los 4 formularios de clase reescritos, 23 tests unitarios nuevos y 2 pruebas de integración de la migración de datos. Verificado contra el stack local con `db:reset` (replay de las 67 migraciones desde cero); **producción no se tocó**.

**Dos decisiones de producto que el plan dejaba abiertas, resueltas con el usuario antes de escribir código.** El plan original decía "se elimina weekly/biweekly; el único modo pasa a ser el calendario, acotado a un mes", pero no resolvía qué pasa con los **entrenamientos** —que en S4 son de inscripción permanente y cobro mensual acumulativo, es decir, programas que viven a lo largo de varios meses— ni qué significa exactamente "un mes". Respuestas:

1. **El entrenamiento CONSERVA weekly/biweekly.** Solo `type='periodica'` pasa a calendario. Esto cambia el alcance real de la sesión: `weekly`/`biweekly` **no se eliminan del código** (siguen vivos en `getClassSessions`, el cron, el ICS y la agenda), se eliminan de un solo tipo de clase. La consolidación de D-5 pasa de ser una preparación a ser el entregable más valioso de la sesión, porque esas ramas van a seguir ejecutándose.
2. **"Un mes" = mismo mes calendario**, no una ventana de 31 días corridos. Es lo que dice el plan textualmente, es explicable en una línea al profesor, y hace que "las fechas del mes" y "el cargo del mes" de S4 coincidan sin aritmética de bordes.

**1. D-5 cerrado primero, y no fue solo mover código.** `getClassSessions` (web + su gemelo de mobile), `lastSessionEnd` (cron) y `getClassDeletionDate` (`my-classes/page.tsx`) viven ahora en `packages/shared/src/lib/classSchedule.ts`; los cuatro sitios originales re-exportan o importan de ahí, así que ningún import existente se rompió. **Las copias ya habían divergido**: la rama `monthly` de mobile avanzaba el cursor con `setMonth`, que desborda cuando el día del mes es 29–31 (31 de enero + 1 mes = **3 de marzo**, no 28 de febrero), mientras que la de web llevaba año y mes como enteros y lo evitaba. Es exactamente el fallo silencioso que D-5 predecía, ya materializado y sin ninguna prueba que lo detectara. `lastSessionEnd` y `getClassDeletionDate` **no tenían ni un solo test** pese a decidir cuándo se borran los archivos de una clase; ahora tienen 8.

**2. Migración `067`.** Convierte cada `type='periodica'` a `recurrence='custom'` **expandiendo todas sus ocurrencias reales** a `custom_dates`, con una función PL/pgSQL que reproduce el mismo ancla, el mismo paso y el mismo tope que `getClassSessions` venía mostrando (incluido el recorte del día 29–31 y el tope de 3 meses para las indefinidas). Después agrega el CHECK `classes_periodica_custom_only` (`type <> 'periodica' OR recurrence = 'custom'`), sincroniza `start_date` con la primera fecha y `ends_at` con la última. Aditiva e idempotente; el header trae el rollback y **la query de respaldo que hay que correr antes de aplicarla en producción**.

**Lo que la migración NO hace, a propósito:** el CHECK **no** exige que las fechas caigan en un mismo mes. Una weekly de tres meses ya publicada se convierte con sus tres meses de fechas intactos, porque truncarla le robaría sesiones a alumnos que ya pagaron. La regla del mes se aplica en los formularios, y solo cuando el profesor **toca** el calendario (`validatePeriodicaDates(dates, { allowMultiMonth })`): sin ese matiz, un profesor no podría ni cambiarle el precio a una clase heredada sin antes rehacerle las fechas.

**3. Formularios (4).** En periódica desaparecen el selector de periodicidad, el día de la semana, la fecha de inicio y la **fecha de término** — las cuatro las define ahora el calendario (`start_date` = primera fecha, `ends_at` = última). El entrenamiento queda **exactamente como estaba**. Los formularios de editar fuerzan a calendario al montar una periódica heredada, porque si no el selector ya no existiría y no habría ningún modo de definir fechas. El `recurrence: 'custom'` de la periódica se escribe además explícito en el payload, no solo vía `setValue`, para que no dependa de que el efecto haya corrido antes del submit (una violación del CHECK le llegaría al profesor como un error crudo de Postgres).

**Encontrado y corregido de paso:**
- **El validador de fechas heredado aceptaba fechas imposibles.** El chequeo `isNaN(new Date(d + 'T00:00:00'))` que estaba copiado en los 4 formularios da por buena `2026-02-31`, porque el motor la corre al 3 de marzo en lugar de rechazarla. `validatePeriodicaDates` ahora hace round-trip (parsear y volver a formatear debe dar la misma cadena). Lo destapó un test que escribí esperando lo contrario.
- **Ramas muertas eliminadas.** El popup "usa el tipo Entrenamiento" y su checkbox tachado quedaron inalcanzables al desaparecer la fecha de término de la periódica, y el bloque "Fecha de inicio" conservaba copy de periódica ("opcional", "parte en la próxima ocurrencia del día elegido") que ya no puede renderizarse nunca. Se borraron en los 4 formularios en vez de dejarlos como piezas que se muestran y no hacen nada — el patrón que el §1 de este audit señala como tercera clase de defecto.
- **`tests/e2e/attendance-qr.spec.ts` sembraba una periódica `weekly`** que el CHECK nuevo habría rechazado. Migrada a calendario. (No corre en `test:unit`/`test:integration`, así que habría fallado recién en el próximo e2e.)

**Consumidores revisados, cero cambios necesarios:** `ClassCard`, `ClassDetailClient`, `TeacherProfileClient`, `/profile`, detalle mobile, `RatingPopup` (web+mobile), `ExploreClient`, el feed (web+mobile), `availability.ts`, `attendance/scan`, `AttendanceQr` y el ICS de ambas plataformas ya ramificaban por `recurrence === 'custom'` antes que por la recurrencia periódica. En el cron, la rama 3 de recordatorios (`.eq('recurrence','custom')`, sin filtro de tipo) recoge ahora las periódicas que antes atendía la rama 4. Efecto lateral favorable: con `ends_at` sincronizado, el filtro del feed descarta periódicas vencidas **en el servidor**, no solo en el cliente.

**Verificación:** `npm run db:reset` (replay de las 67 migraciones desde cero) → integración **5/5** verde → `tsc --noEmit` web y mobile ambos limpios → **205** unit tests verdes (antes 182). La prueba de integración clave no verifica "que la migración corra", sino que **no pierda sesiones**: siembra weekly, biweekly, weekly multi-mes y monthly-día-31, guarda lo que `getClassSessions` mostraba antes, corre la migración real y exige que `custom_dates` sea idéntico. La segunda prueba confirma que el CHECK rechaza una periódica weekly desde PostgREST y que **no toca los entrenamientos**.

**Pendiente que deja S3:**

1. **Aplicar `067` en producción** (G-1), **después de tomar el respaldo** que indica el header de la migración, y **antes** de desplegar el código de esta sesión: si se despliega el código sin la migración, el formulario guardaría periódicas `custom` sin que el CHECK exista (inofensivo); al revés también es seguro, porque la migración convierte los datos y el código viejo sigue leyendo `custom` correctamente. El orden peligroso no existe acá, pero conviene migración primero para que ninguna periódica heredada llegue al formulario nuevo sin `custom_dates`.
2. **Verificación visual pendiente de dispositivo/navegador** (misma limitación que S2): los 4 formularios y el detalle de clase no se abrieron en pantalla real, ni en claro ni en oscuro. La verificación de esta sesión es por tipos, tests y ejecución de la migración contra Postgres. Es material natural para **S7** (QA dedicado).
3. **S4 no cambia de alcance**, pero ahora se apoya en una base más firme: las fechas de una periódica son un array explícito, y las de un entrenamiento siguen siendo la recurrencia semanal + `ends_at`/indefinido que el cobro mensual necesita.
4. **`canPayByTransfer(tier)` sigue muerto** (heredado de marketplace v2) — sin relación con esta sesión, solo se deja anotado para que no se pierda.

---

### S4 · Entrenamientos: cobro mensual con deuda acumulada — ✅ completa (2026-07-28)

**Entregable:** migraciones `068_training_monthly_charges.sql` y `069_teacher_confirm_via_route.sql`, helper compartido `packages/shared/src/lib/monthlyCharges.ts`, cron nuevo `/api/cron/monthly-charges`, gate de deuda en el QR, pantalla de pago reescrita en las dos plataformas, UI de deuda para el profesor, 22 tests unitarios y 3 pruebas de integración nuevas. Verificado con `db:reset` (replay de las **69** migraciones desde cero); **producción no se tocó**.

**El punto de partida real.** `classes.billing_day` existía desde la migración 025, se pedía en los 4 formularios y se mostraba en tres pantallas ("Cobro mensual el día N de cada mes") sin disparar ningún cobro: un entrenamiento cobraba **una vez** y nunca más. Es el ejemplo que el §1 de este audit usa para su tercera clase de defecto — algo que se guarda, se muestra y no hace nada.

**1. El riesgo que dominó el diseño del esquema.** El plan de sesión pedía "quitar `payments_enrollment_id_key UNIQUE(enrollment_id)`". Esa constraint no sólo expresa la regla "un enrollment ↔ un pago": es también lo que **PostgREST** usa para decidir si el embed `payment:payments(*)` devuelve un OBJETO o un ARRAY. Quitarla convierte, en silencio, ocho embeds repartidos por web y mobile — sin error de compilación, sin error en runtime, sólo `enrollment.payment.status` quedando `undefined`. Se verificó empíricamente contra el stack local: **después de la migración el embed devuelve ARRAY**.

Por eso el unique no se eliminó sin reemplazo, sino que se partió en dos índices **parciales** que preservan la vieja invariante exactamente donde siempre valió:

- `payments_one_per_enrollment` `UNIQUE(enrollment_id) WHERE billing_period IS NULL` → sueltas, periódicas, 2x y paquetes siguen con **un solo pago por inscripción**, igual que antes.
- `payments_one_per_period` `UNIQUE(enrollment_id, billing_period) WHERE billing_period IS NOT NULL` → entrenamientos: un cargo por mes. Es además el guard de idempotencia de la emisión.

`billing_period IS NOT NULL` queda como el discriminador del modelo. Los consumidores pasan por `paymentList()` (shared), que normaliza ambas formas; la segunda prueba de integración afirma las dos mitades: **dos cargos del mismo mes rebotan con 23505, y dos pagos únicos en la misma inscripción también**.

**2. Estado `'due'`, porque reusar `'pending'` habría sido mentir.** Hasta ahora una fila de `payments` sólo nacía cuando el alumno ya había hecho algo, y `'pending'` significaba "esperando revisión del profesor". Un cargo mensual nace **antes** de que el alumno haga nada. Con `'pending'`, cada cargo emitido habría caído en la bandeja de "pagos por verificar" del profesor con un comprobante inexistente. Deuda = `('due','rejected')`; `'pending'` **nunca** cuenta como vencido, porque el alumno ya hizo su parte y el retraso es de la revisión.

**3. La emisión se auto-repara, y no depende de que el cron haya corrido.** `generate_monthly_charges(p_enrollment_id)` genera **todos** los períodos que falten, no sólo el del mes en curso: un cron caído una semana, un mes en que Vercel no ejecutó el job o una inscripción anterior a que el cron existiera no dejan huecos silenciosos en la deuda. La ventana va del mes de `MAX(inicio de la clase, inscripción del alumno)` hasta el mes en curso si ya pasó el `billing_day`, acotada por `ends_at`.

**Un hueco encontrado al revisar la propia función:** con esa regla, un alumno que entra el día 2 con `billing_day = 5` no tenía **ningún** cargo que pagar hasta el día 5 — y por lo tanto ninguna forma de habilitar su QR el día que entra al programa. El primer mes de una inscripción se emite ahora apenas existe, sin esperar al día de cobro, sin que eso permita emitir meses futuros. Tiene su propia prueba de integración.

**Un cargo emitido NUNCA se reprecia.** Es la única excepción deliberada a la "Política de precio al momento de pago" documentada en `CLAUDE.md`: la deuda de marzo es la de marzo, y si el profesor sube el precio en julio la deuda acumulada del alumno no puede moverse sola hacia atrás.

**4. El QR es la única consecuencia, tal como se especificó.** El gate de `/api/attendance/scan` pasa de `enrollment.status === 'confirmed'` a "sin mensualidades vencidas" **sólo para entrenamientos** (el resto de las clases no cambia). `status === 'confirmed'` había dejado de ser señal de "está al día": un alumno confirmado hace ocho meses puede deber los últimos tres. La inscripción no se cancela nunca por impago — los entrenamientos quedaron además excluidos del barrido de reservas impagas de 72 h del cron, que si no le habría quitado a un alumno aceptado el cupo que ganó audicionando.

El rechazo nuevo (`debt_overdue`) devuelve los meses y el total, y los escáneres de web y mobile lo tratan como **accionable**: en vez del flash rojo de 2 s, se quedan abiertos mostrando la deuda con el botón "Revisar pagos" — el profesor cobra en efectivo ahí mismo y el alumno entra.

**5. Rotación del QR: un bug que la feature habría introducido.** `issueAttendanceToken` rota `nonce`+`token` en cada llamada, y `autoConfirmPayment` la invoca en **cada** pago confirmado. Con cobro mensual eso significa un QR nuevo cada mes, invalidando la captura de pantalla que el alumno lleva guardada. Ahora un token **activo** no se rota; la rotación se conserva donde importa (token revocado → se emite uno nuevo y la captura vieja deja de servir, que es la garantía real de la revocación). Cubierto por la prueba de integración.

**6. Confirmación sin comprobante — y con eso, P1-8.** `POST /api/payment/confirm { action: 'confirm_offline' }` registra un pago recibido fuera de la app (efectivo, transferencia directa). Deja rastro propio: `offline_confirmed = true` (columna nueva, no deducido de `receipt_url IS NULL`, que también es cierto en pagos MP), `confirmed_by = 'teacher'`, y marcado como "sin comprobante" en el historial, en el Panel Financiero y en el CSV. Si el pago **sí** tiene comprobante esperando revisión, responde 409 y manda al camino normal: así "sin comprobante" nunca miente.

Eso habilitó cerrar **P1-8**, que S1 había dejado explícitamente pendiente por falta de alternativa: el botón "Confirmar" del profesor dejó de ser un `PATCH` a `enrollments` desde el navegador (camino que dejaba al alumno `confirmed` **sin token QR**, sin tocar `payments` y sin confirmar al compañero de un 2x) y pasa por la ruta, que hace las tres cosas. La migración `069` endurece el guard de `065`/`066` a **"el profesor sólo puede `cancelled`"**. La suite `rls-guards.spec.ts` se actualizó en consecuencia: lo que era un "camino legítimo" ahora es un ataque que debe fallar con `enrollment_status_transition_not_allowed`.

**7. Pagar varios meses: asimetría deliberada entre las dos vías.** Por **transferencia** se pueden saldar varios meses con un solo comprobante (una deuda de tres meses se paga con una transferencia bancaria, no con tres): cada cargo conserva su monto y su revisión, y lo único que comparten es el archivo. En ese caso el **escaneo IA se salta** (`scan_status='skipped'`), porque compara el monto del comprobante contra `payments.amount` de una sola fila y marcaría cada cargo como "monto no coincide" — el profesor revisa a mano, que es el fallback previsto. Por **Mercado Pago** se cobra **un mes por checkout**: el `marketplace_fee` y la validación de monto del webhook se calculan contra una fila, y repartir un pago único de MP entre varias exigiría un vínculo nuevo entre pago y cargos, con dinero real de por medio. Con MP cada mes es un checkout instantáneo, así que el costo para el alumno es bajo. La UI lo dice explícitamente en vez de dejarlo implícito.

**8. `external_reference` pasó a apuntar al pago, no a la inscripción.** Con varios pagos por inscripción, `enrollment:<id>` ya no identifica una fila y el webhook usaba `.maybeSingle()` sobre ella. Ahora los cargos mensuales usan `payment:<paymentId>`; el formato viejo se mantiene entendido (y resuelto con `.is('billing_period', null)`) porque puede haber preferencias creadas antes del despliegue todavía en vuelo.

**Encontrado y corregido de paso:**
- **`archiveClass` nunca purgó un solo comprobante.** Leía `e.payment?.[0]` sobre un embed que PostgREST resolvía como **objeto** (por el `UNIQUE` de 001): el índice `[0]` daba siempre `undefined`. Llevaba así desde que se escribió; la migración lo habría "arreglado" por accidente y sólo para el primer pago. Ahora recorre todos.
- **P2-3 cerrado** (era de S5): `submit-transfer` no seteaba `recipient_teacher_id`, así que el índice antiduplicado `payments_op_dedup` sólo protegía con el escaneo IA activo. Se setea en los tres caminos.
- **El resumen mensual del profesor contaba mal en el modelo nuevo**: sumaba por `enrollmentStatus === 'confirmed'`, que en un entrenamiento es permanente — habría contado como cobrados meses impagos. Ahora suma por `status === 'verified'` del cargo.
- **CSV del profesor**: columnas nuevas "Mes cobrado" y "Comprobante". Sin la primera, un pago atrasado aparece en la fecha en que se pagó y no en la del mes que salda, y la contabilidad no cuadra.

**Decisiones tomadas (para no re-litigarlas):**
- **Gracia de 3 días** entre el día de cobro y el bloqueo del QR (`MONTHLY_CHARGE_GRACE_DAYS`, una constante). `billing_day` está acotado a 1..27, así que sumarla nunca desborda el mes. Es una perilla de producto: cambiarla es una línea.
- **La deuda arranca en el mes en que el alumno se inscribió**, no en el que empezó la clase: un alumno nuevo en un entrenamiento de dos años no debe dos años.
- **La fecha autoritativa se calcula en Postgres** (`AT TIME ZONE 'America/Santiago'`) y en el servidor. `todayInChile()` del shared cae a la fecha local del dispositivo si `Intl` no trae soporte de `timeZone` (Hermes no lo garantiza) en vez de lanzar; en mobile sólo se usa para pintar. `formatBillingPeriod` no usa `Intl` en absoluto.
- **`ensureMonthlyCharges` se llama al abrir la pantalla de pago** (y en `/api/payment/charges`, que existe para mobile) además de en el cron: el alumno que entra el día del cobro ve su mes en vez de una pantalla vacía.

**Verificación:** `npm run db:reset` (replay de las 69 migraciones desde cero) → integración **8/8** verde → `tsc --noEmit` web y mobile ambos limpios → **227** unit tests verdes (antes 205). La prueba de integración central recorre el ciclo completo que pedía el plan: emitir, no pagar, acumular, comprobar que hay deuda vencida, subir comprobante, confirmar, comprobar que el QR se emitió y **no rotó** al pagar el mes siguiente, confirmar un mes en efectivo, y verificar que quedan tres pagos verificados de **tres meses distintos**.

**Pendiente que deja S4:**

1. **Aplicar `068` y `069` en producción**, en ese orden (G-1), **tomando antes el respaldo** que indica el header de `068`: la constraint que elimina no se puede recrear si mientras tanto entró un segundo pago. `069` va **con o después** del deploy del código: si se aplica antes, el botón "Confirmar" del profesor falla con 42501 hasta que el deploy entre.
2. **Registrar el cron nuevo**: `/api/cron/monthly-charges` ya está en `apps/web/vercel.json` (06:00 UTC) y se activa al desplegar. Opcional: crear el monitor `HEALTHCHECK_MONTHLY_CHARGES_UUID` en healthchecks.io, como los otros tres.
3. **Verificación visual pendiente** (misma limitación que S2 y S3): la pantalla de pago con mensualidades, el tab "Dicto" con deuda y el escáner rechazando por deuda no se abrieron en navegador ni en dispositivo, ni en claro ni en oscuro. Material natural para **S7**.
4. **La gracia de 3 días y el tope de un checkout por mes en MP** son decisiones de producto tomadas en esta sesión: conviene que el usuario las confirme antes del lanzamiento.
5. **S5 no cambia de alcance.** P2-3 salió de su lista (cerrado acá); P1-1, P2-1, P2-2, P2-4, P2-6, D-2 y D-4 siguen intactos.

---

### S5 · Endurecimiento de la plataforma de pagos — ✅ completa (2026-07-28)

**Entregable:** migración `070_payment_platform_hardening.sql`, dos módulos nuevos (`lib/mercadopago/token.ts` y `lib/mercadopago/connection.ts`), cron nuevo `/api/cron/mp-connections`, reversión de pagos en `lib/payments.ts`, helper compartido `packages/shared/src/lib/receipts.ts`, panel de conciliación con el excedente de procesamiento, `/terms` §6 (ES+EN) al día, 12 pruebas unitarias y 4 de integración nuevas. Verificado con `db:reset` (replay de las **70** migraciones desde cero); **producción no se tocó**.

**El hilo común de la sesión.** Los cinco hallazgos son la misma familia: *estado distribuido entre la app y Mercado Pago que nadie reconcilia*. Un token que caduca en un tercero, un pago que el tercero devuelve, un profesor que se desconecta, una fila de pago que cambia de vía a mitad de camino. Ninguno explota hoy; todos maduran solos con el tiempo o con el volumen.

**1. P1-1 — el token que nadie leía.** `refresh_token` y `expires_at` se guardaban desde el día uno del marketplace y **ninguna línea del repo los leía**. A los 180 días de conectarse, todos los pagos in-app de ese profesor dejan de funcionar en silencio: `create-payment` responde 502 y el webhook no puede leer el pago del vendedor, así que ninguna inscripción suya vuelve a confirmarse. `getTeacherMpToken()` es ahora el único camino al token (los dos consumidores pasan por ahí) y refresca cuando quedan menos de 30 días. La escritura del par nuevo es **condicional al `refresh_token` que se usó** (`.eq('refresh_token', ...)`): MP rota el refresh token en cada uso, así que dos requests simultáneas no pueden pisarse — la que pierde relee la fila y usa el token que ganó, en vez de dejar la conexión con un token que MP ya invalidó.

El refresh bajo demanda no basta: un profesor con poco movimiento puede pasar meses sin que nadie toque su token y descubrir el vencimiento justo cuando un alumno intenta pagarle. De ahí el cron diario (07:00 UTC), que además avisa —in-app y push, una vez por semana como mucho— cuando el refresh falla y quedan menos de 14 días. Si la conexión ya venció, se marca al profesor como desconectado **una sola vez** (chequeando `profiles.mp_connected` antes): sin ese guard, cada corrida volvería a "desconectar" a un profesor ya desconectado y a pisarle la configuración de vías de pago de sus clases todos los días.

**2. P2-6 — el reembolso que no revertía nada.** El webhook, tras el `approved`, sólo persistía `mp_status`. Un alumno podía pagar, obtener el QR de asistencia, pedir el reembolso y **conservar el acceso**. `reverseClassPayment()` (en `lib/payments.ts`, no en la ruta, para que sea testeable) deja el pago en `refunded` —fuera del Panel Financiero y de la conciliación, que filtran por `verified`—, devuelve la inscripción a `pending_payment`, revoca el token QR y des-confirma al compañero de un 2x.

Tres decisiones dentro de eso:
- **No se cancela la inscripción.** Vuelve a `pending_payment`, que es el estado de "reservado sin pagar": si el alumno no vuelve a pagar, el barrido de reservas impagas del cron lo libera con sus reglas de siempre. Cancelar de una sería inventar una regla nueva para el caso más ambiguo.
- **Estado `'refunded'` propio**, no `'rejected'` (que significa "el profesor miró el comprobante y lo rechazó") ni `'void'` ("el pago dejó de aplicar porque la inscripción se anuló"). Un reembolso no es ninguna de las dos, y mezclarlo habría ensuciado el historial que ve el profesor.
- **En un entrenamiento no se toca la inscripción**: el mes vuelve a ser deuda (`refunded` entró en la lista `UNPAID` de `summarizeCharges`) y el gate del QR se encarga. Es la misma regla que rechazar un cargo mensual, por el mismo motivo que S4: expulsar de la clase a un alumno de dos años por un contracargo de este mes sería el efecto contrario al del modelo.

**Un reembolso PARCIAL no se revierte solo** (MP lo deja en `approved` con `transaction_amount_refunded > 0`): no sabemos si el alumno conserva el derecho a la clase. Se loguea como `warn` para que quede visible en vez de pasar inadvertido.

**3. P2-4 — desconectarse dejaba alumnos con deuda y sin caja.** `accepts_mp = true` no sirve de nada sin cuenta conectada. `/api/class/enroll` ya bloqueaba inscripciones nuevas (correcto), pero los **ya inscritos con pago pendiente** se quedaban sin ninguna vía: cupo tomado, deuda viva y ningún botón. `markMpDisconnected()` activa la transferencia en las clases que quedarían impagables —único arreglo que no inventa una decisión del profesor sobre el precio y que respeta el CHECK de "al menos una vía"— y devuelve el resumen. Lo que **no** se puede reparar solo es la falta de datos bancarios, así que eso se devuelve como aviso y la tarjeta de `/profile/payment-info` lo dice explícitamente. El mismo helper lo usa el cron cuando la conexión vence: la desconexión "por caducidad" y la manual dejan el sistema en el mismo estado.

**4. P2-1 y P2-2 — coherencia entre vías.** Confirmar por API un pago MP `pending` (checkout abandonado) sería regalar la clase, y rechazarlo le avisaría al alumno que "su pago fue rechazado" sin que haya pagado nada: ambas acciones responden ahora 409. Si el profesor cobró en efectivo, `confirm_offline` sí funciona y además **convierte la fila a `transfer` con `commission_amount = 0`** — dejarla como `mp` habría hecho que la conciliación tributaria contara una comisión de servicio que nadie cobró, porque el split nunca ocurrió. En sentido inverso, si el webhook llega después de una confirmación en efectivo, `autoConfirmPayment` limpia `offline_confirmed`: la verdad es la de MP.

Cambiar de transferencia a Mercado Pago dejaba dos puntas sueltas: el comprobante huérfano en el bucket privado (nadie lo referencia y nadie lo borra) y la inscripción en `payment_submitted`, así que el profesor veía "Revisar pago" sobre un pago sin comprobante que revisar. Ahora se borra el archivo y la inscripción vuelve a `pending_payment`. De paso, `create-payment` rechaza (409) sobrescribir un pago ya `verified`: el guard que había miraba el estado del *enrollment*, no el del *pago*.

**5. D-2 — ponerle nombre al excedente.** El costo de procesamiento se le cobra al alumno con el tramo más caro de MP porque la API no expone el plazo de liberación de cada cuenta; si el profesor libera a 10 o 30 días, MP cobra menos y la diferencia se queda en DanzClass. El audit pedía decidir entre devolverlo, declararlo o registrarlo. Se implementó **registrarlo**, que es la única opción que no compromete al negocio de forma irreversible y que **habilita las otras dos**: el webhook lee el costo real de `fee_details` y lo guarda en `payments.mp_fee_amount`, y `/admin?tab=reconciliation` muestra *cobrado al alumno* vs *cobrado por MP* vs **excedente retenido**. Con eso hay dato real para decidir en vez de una estimación. `/terms` §6 lo dice ahora en las dos versiones: **el párrafo de impuestos afirmaba que el costo de procesamiento "se traslada íntegro a Mercado Pago", lo que era falso** — ésa era exactamente la parte sin nombre que el hallazgo señalaba.

El panel también avisa si el excedente sale **negativo**: eso significaría que MP cobra más que el tramo estimado y que el profesor no está recibiendo el 100% de su precio, que es la invariante del modelo.

**6. D-4 — el tipo sale del contenido.** La validación de magic bytes era rigurosa y después el nombre del objeto se armaba con `receipt.name.split('.').pop()`: un PNG válido llamado `comprobante.svg` quedaba guardado como `.svg`, que el navegador puede interpretar como SVG —con script— al abrir la URL firmada. Ahora la extensión y el `contentType` salen de `detectReceiptType()` (shared) en los tres puntos de subida. Dos efectos colaterales: **mobile no validaba absolutamente nada** (subía cualquier cosa con `contentType: image/<lo que dijera el URI>`) y ahora sí; y un RIFF que no es WEBP (un WAV, un AVI) dejó de pasar, porque la comprobación vieja sólo miraba 4 bytes.

**Encontrado de paso — la vía de pago de los paquetes no funcionaba.** `PackageSection` subía el comprobante a `pkg_<id>_<ts>.<ext>`, **sin carpeta**. La policy de INSERT del bucket (migración 007) exige `(storage.foldername(name))[1] = auth.uid()`, y para un nombre sin `/` esa función devuelve un array vacío → la comparación da NULL → **RLS rechaza toda subida**. Está reproducido en la prueba de integración: el path viejo falla, el nuevo (`<userId>/pkg_...`) funciona. Además, `/api/packages/[id]/submit-payment` aceptaba cualquier `receipt_path` del cliente sin verificar el prefijo — podía registrarse como comprobante propio el path de otro archivo del bucket. Las dos cosas corregidas.

**Encontrado de paso — una escritura de pago que fallaba en silencio.** Lo destapó la propia suite: al correrla dos veces, `autoConfirmPayment` chocaba con el índice único `payments_mp_payment_id_key` y **descartaba el error**, dejando la inscripción confirmada con el pago en `pending` y sin ningún rastro de por qué. Era un bug de las pruebas (ids de MP fijos), pero el silencio era del código: ahora ese error se loguea. Las pruebas usan ids únicos por corrida y la suite es re-ejecutable.

**Verificación:** `npm run db:reset` (replay de las 70 migraciones desde cero) → integración **12/12** verde, dos corridas seguidas (idempotencia) → `tsc --noEmit` web y mobile ambos limpios → **239** unit tests verdes (antes 227).

**Pendiente que deja S5:**

1. **Aplicar `070` en producción** (G-1), junto con el resto de la cola. Es aditiva y no toca datos: puede ir antes del deploy sin romper el código viejo.
2. **Registrar el cron nuevo**: `/api/cron/mp-connections` ya está en `apps/web/vercel.json` (07:00 UTC) y se activa al desplegar. Opcional: monitor `HEALTHCHECK_MP_CONNECTIONS_UUID` en healthchecks.io.
3. **Nada de esto se probó contra Mercado Pago real** (G-2, que sigue siendo del usuario): el refresh de tokens, el `fee_details` de un pago aprobado y los webhooks de `refunded`/`charged_back` están escritos contra la documentación de MP, no observados. El sandbox de MP es donde se validan; la lógica *posterior* a recibir el evento sí está probada contra el stack local.
4. **Decisión de negocio abierta (D-2):** con el excedente ya medido, elegir si se devuelve al profesor, se declara como parte de la comisión, o se mantiene registrado como está.
5. **Verificación visual pendiente**, como en S2–S4: el pill "Reembolsado", las dos notificaciones nuevas y el aviso al desconectar Mercado Pago no se abrieron en navegador ni en dispositivo. Material para **S7**.

---

### S6 · Paridad, notificaciones y limpieza transversal — ✅ completa (2026-07-28)

**Entregable:** sin migraciones — toda la sesión es código de aplicación. 3 archivos nuevos en `packages/shared`/`apps/web/src/lib`, ~35 archivos tocados (mobile + web), 0 tests nuevos (era refactor/hardening, no feature). Verificado contra el stack local; **producción no se tocó**.

**P1-2 — el tier de mobile ignoraba `expires_at`.** `getActiveTier`/`getActiveSubscription`/`getCancelledPendingExpiry` (antes solo en `apps/web/src/lib/subscription.ts`) se movieron a `packages/shared/src/lib/subscriptionTier.ts` — es lógica pura sobre una fila, sin dependencia de Next.js. Web quedó con un re-export de una línea (15 importadores intactos). Mobile tenía **9** puntos con `subscriptions.select('tier').eq('status','active').single()` crudo — ignoraba por completo `expires_at` y la gracia de 7 días, así que un plan vencido seguía dando acceso Pro completo en la app pero no en la web. Los 9 se reemplazaron por `getActiveTier(userId, supabase)`, más un **10° encontrado de paso** (`plans/success.tsx`, mismo patrón, no estaba en la lista original del audit).

**P1-7 — `deletion_date` no existía en mobile.** D-5 (S3) ya había movido `getClassDeletionDate` a shared y la web ya la usaba; solo faltaba mobile, que seguía leyendo `cls.deletion_date` como si fuera una columna de la tabla (nunca lo fue — es derivada). `my-classes.tsx` la calcula ahora por fila con el helper compartido; el aviso de archivos y el cálculo de deudores en mobile quedan a la par de web.

**D-3 — `WEB_URL` centralizado, con dos bugs de paso.** `packages/shared/src/lib/webUrl.ts` exporta un solo literal (`EXPO_PUBLIC_WEB_URL` con fallback al dominio de Vercel actual). Reemplazado en los 19 archivos que nombraba el audit (17 mobile + `profile/page.tsx` + el widget embebible) más dos encontrados al hacer el barrido completo: `class/[id]/edit.tsx` tenía el literal *inline* sin pasar por un `const` (por eso no apareció en el conteo original), y **`event/[id]/index.tsx` tenía un bug real**: ya intentaba leer `EXPO_PUBLIC_WEB_URL`, pero como esa env var nunca se configuró, el fallback era `''` — aceptar o rechazar una invitación a evento desde mobile hacía un `fetch('/api/event/respond-invite')` sin origen, que React Native no puede resolver (no hay `window.location` de dónde completarlo). Los 7 route handlers de web con el patrón `APP_URL || NEXT_PUBLIC_APP_URL || 'https://dc-project-web...'` se dejaron intactos — ya priorizan env vars configuradas en Vercel, y no estaban nombrados en el hallazgo original.

**D-6 — 12 rutas insertaban notificaciones sin avisar por push.** Nuevo `apps/web/src/lib/notifyUsers.ts`: inserta y dispara `sendPushToUsers` best-effort, con `PUSH_LABELS` centralizado (antes vivía duplicado dentro de `/api/notifications/send`, solo para los tipos que un cliente puede disparar). Migradas las 11 rutas que nombraba el audit (recordatorio de clase, recordatorio de pago, 2x_match, 2x_payment_turn, debt_warning, invitación a ensayo + aceptar/rechazar, aviso de descuento, cancelación por timeout, waitlist_available, event_invite_accepted/rejected) más una **12ª encontrada al verificar quién llama a cada ruta**: `actions/reports.ts` — el server action que `ReportModal.tsx` (web) realmente usa. `api/reports/route.ts` (la ruta que sí nombraba el audit) no tiene ningún caller detectable en el repo; se migró igual por si acaso pero probablemente es código muerto, no confirmado como tal en esta sesión.

Detalle no trivial de `notifyUsers`: agrupa el push por `(type, JSON(data))`, no solo por `type`. La primera versión agrupaba solo por tipo y reusaba el `data` de la primera fila del batch para el texto del push — funciona cuando todo el batch es el mismo evento (ej. todos los seguidores de un mismo descuento), pero el cron cancela alumnos de **varias clases distintas** en una sola pasada: con la primera versión, todos habrían recibido un push mencionando el título de la primera clase cancelada, sin importar cuál era la suya. Se corrigió antes de aplicarlo al cron.

**P1-4 — rate limit en las 9 rutas nombradas, con una sorpresa de rutas duplicadas.** Al ir a limitar `ratings/upsert` y `reports` apareció que cada una tiene **dos caminos vivos**: una API route (la que usa mobile) y un server action (`actions/ratings.ts`/`actions/reports.ts`, la que realmente llama la UI web — `RatingModal`/`ReportModal`). Limitar solo la ruta nombrada en el audit habría dejado sin protección la vía que más tráfico real recibe. Las dos quedaron limitadas. Además, `checkRateLimit` ahora loguea una vez por proceso vía `logger.error` si Upstash no está configurado **en producción** (antes: `console.warn` silencioso, indistinguible entre dev y prod) — sigue sin bloquear tráfico si Redis falla, a propósito, mismo criterio "fail-open" que ya regía para errores transitorios de Redis.

**P1-3 — Zod + rate limit en `rehearsal/invite`, sin el filtro de amigos/seguidores.** El audit recomendaba además "verificar que los invitados sean amigos o seguidores del creador, que es lo que la UI ya hace de todos modos" — se verificó la UI (`CreateRehearsalModal`) antes de implementarlo y **la premisa era falsa**: invita por búsqueda libre sobre `profiles`, igual que `rehearsal/create` (que tampoco restringe). Agregar la restricción solo en `invite` habría roto una función que hoy funciona así a propósito en las dos rutas del feature, sin arreglar la inconsistencia real (quedaría distinta entre `create` e `invite`). Se implementó solo lo verificable: Zod (`user_ids` UUID, tope 100 — el mismo que ya tenía `create`, no el 60 que decía el texto del audit) + `checkRateLimit(..., 'social')`.

**P2-5 — paginación del cron, y era peor de lo que decía el hallazgo.** El audit lo describía como "problema de memoria con miles de clases"; en realidad, sin `.range()`, PostgREST corta en 1000 filas por defecto **sin devolver error** — con más de 1000 clases activas, las que quedaban fuera de esa página ni se archivaban ni se procesaban, en silencio, cada corrida. `.range()` en loop (páginas de 500) lo resuelve para cualquier volumen.

**P2-7 — dos purgas de comprobantes que convivían mal, la más nueva ganándole a la más vieja.** `archiveClass` (parte del cron desde siempre) borraba **todos** los `receipt_url` de una clase 24h después de su última sesión, incluidos los `verified` — pero esto recién empezó a *funcionar de verdad* en S4, cuando se corrigió el bug del embed `payment?.[0]` que lo dejaba en no-op. El bloque "P3-6" (sesión 2026-07-22, en el mismo archivo, más arriba) purga con una regla completamente distinta y a propósito: solo `void`/`rejected`/`refunded`, recién a los 90 días, **nunca** `verified` ("son el respaldo del pago"). Al arreglarse el bug de S4, `archiveClass` empezó a adelantarse al diseño de P3-6 y a borrar evidencia de pagos ya verificados casi de inmediato — contradiciendo tanto el comentario del propio archivo como lo que `/privacy` promete sobre retención de datos de pago. Se eliminó el bloque de `archiveClass` por completo: archivar una clase ya no toca `payments`, ese ciclo de vida vive solo en el bloque P3-6.

**P2-8 — 8 `console.*`, no 5.** `plans/success/page.tsx` es un server component (corre en Vercel, no en el navegador) con 4 `console.log` + 4 `console.error` — el audit solo contó los `.log`. Los 8 migrados a `logger.info`/`logger.error` con evento nombrado y metadata estructurada (`userId`, `tier`, `mpId`, etc.).

**Verificado:** `tsc --noEmit` web y mobile ambos en cero (sin tocar ninguna migración esta sesión, no hizo falta `db:reset`) → `npm run test:unit`: **239** verdes, sin cambios (sesión de refactor, no de feature) → `npm run test:integration` contra el stack local ya corriendo: **12/12** verdes, sin regresiones. **Todo contra el stack local — producción no se tocó.**

**Pendiente:** ninguna migración que aplicar (sesión sin cambios de esquema). Verificación visual de mobile (los 10 puntos de `getActiveTier`, el fix de `event/[id]/index.tsx`) queda para **S7**, junto con el resto de QA exploratorio pendiente. **S7 y S8 siguen intactas.**

---

### S7 · QA dedicado: Eventos, Ensayos, Paquetes, Chat — ✅ completa (2026-07-28)

**Entregable:** migraciones `071_realtime_publication.sql` y `072_fix_rehearsal_rls_recursion.sql`, ruta nueva `/api/event/confirm-payment`, `/api/payment/receipt-url` extendida a paquetes y eventos, ~15 archivos de web y mobile tocados, y **dos suites nuevas**: `tests/integration/features-qa.spec.ts` (9 casos, negocio y RLS) y `tests/e2e/features-smoke.spec.ts` (render en navegador real, claro y oscuro). Verificado contra el stack local; **producción no se tocó**.

**Esta sesión no cerró hallazgos del documento: encontró 18 nuevos.** Era lo esperable — las seis sesiones anteriores auditaron esquema, rutas y lógica; ninguna abrió una pantalla ni recorrió una feature de punta a punta. Dos de los 18 son del calibre de los P0 de §2, y los dos estaban vivos en producción.

**1. El chat no entregaba ningún mensaje (equivalente a P0).** Ninguna migración agregó `chat_messages` a la publicación `supabase_realtime`, y una suscripción `postgres_changes` sólo recibe filas de tablas publicadas. En Cloud eso se activa a mano desde el dashboard y **estaba documentado sólo para `notifications`**; en un stack levantado desde cero la publicación arranca vacía (verificado: `pg_publication_tables` devolvía 0 filas). Como ni web ni mobile hacían append optimista, el remitente **no veía su propio mensaje** hasta salir y volver a entrar. Migración `071` + los dos clientes pintan la fila al instante y **muestran el error** (antes `insert(...)` descartaba el error: el texto se borraba y el mensaje se perdía sin decir nada). La prueba de integración se suscribe con un JWT real y espera el evento: sin `071` falla.

**2. Recursión mutua de RLS en Ensayos (42P17, equivalente a P0).** `rehearsals_invitees_select` subconsulta `rehearsal_invites` y `rehearsal_invites_creator` subconsulta `rehearsals`: las subconsultas de una policy se evalúan **con** las policies de la tabla referenciada, así que se llamaban entre sí. **Toda** lectura de cliente sobre esas dos tablas abortaba —también la del creador, porque las policies se combinan con OR y basta con que una recurse—, así que el detalle de ensayo en mobile hacía `router.back()` en silencio y la agenda de mobile perdía los ensayos. Las rutas `/api/rehearsal/*` no fallaban (service role), lo que hacía ver sano el detalle web. Es el **tercer** caso de esta familia (037 en chat, corregido por 059; ahora 023). Migración `072`, con el patrón `SECURITY DEFINER` de siempre.

De ahí salió una comprobación que conviene repetir: **un `SELECT` de cliente, con JWT real, contra cada tabla con RLS**. Se hizo sobre las 40 tablas de `public` y no apareció ninguna otra recursión.

**3. Confirmar el pago de un paquete respondía 500 — siempre.** La ruta llamaba a `sendNotifications` (`lib/notifications.ts`), que es el helper del **navegador**: hace `fetch('/api/notifications/send')` con URL relativa, imposible de resolver en Node. `TypeError: Failed to parse URL` → 500. El cliente sólo miraba `res.ok`, así que el profesor apretaba "Confirmar pago" y no pasaba nada, sin ningún mensaje. La vía de pago de paquetes estaba, en la práctica, muerta: S5 ya había encontrado que **la subida del comprobante tampoco funcionaba** (path sin carpeta de usuario → RLS rechazaba). Corregido a `notifyUsers(admin, ...)`; `grep` confirma que era el único uso server-side de ese helper.

**4. Confirmar un paquete no emitía el token QR ni registraba el pago.** Escribía `enrollments.status='confirmed'` a pelo — la misma familia del `/dashboard` zombi (P0-2) y del botón del profesor que S4 migró a ruta (P1-8), viva en un tercer sitio. El alumno quedaba confirmado **sin QR** (el escáner lo rechaza) y el ingreso del paquete no existía en `payments`: invisible en el Panel Financiero, en el historial y en el CSV. Ahora cada clase registra **su parte** del precio (reparto entero con el resto en la primera, para que la suma sea exactamente lo pagado) y se confirma con `confirmEnrollment(..., { notify: false })` → un solo aviso al final en vez de uno por clase. `confirmEnrollment` se exportó desde `lib/payments.ts` con esa opción; era privada.

**5. Comprobantes de entrada a evento en un bucket PÚBLICO.** Se subían a `event-media` (`public = true`, `SELECT USING (bucket_id = 'event-media')`): nombre, RUT y número de cuenta de una transferencia, legibles por cualquiera con la URL, cuando `payment-receipts` es privado desde `029` justamente por eso. Además ese bucket sólo admite imágenes, así que **subir un PDF —que la UI ofrece y la validación acepta— fallaba siempre**. Y la extensión salía de `file.name.split('.').pop()`, el defecto exacto que D-4 cerró en las otras tres subidas: un PNG llamado `.svg` quedaba guardado como SVG **en un bucket público y servible**. Ahora van a `payment-receipts` con `detectReceiptType`; los viejos se siguen sirviendo desde `event-media` (fallback en la ruta de firma).

**6. Quien debía revisar el comprobante no podía verlo.** Ni en paquetes ni en eventos: ambas pantallas mostraban monto y botones, y el archivo no se renderizaba en ninguna parte — el profesor y el organizador confirmaban a ciegas. `/api/payment/receipt-url` acepta ahora `packageEnrollmentId` y `eventPaymentId` (con la misma verificación de que quien pide es el alumno o el dueño del contenido), y las dos UIs tienen "Ver comprobante".

**7. El organizador confirmaba con dos UPDATE sueltos y el alumno no se enteraba.** Sin notificación, sin push, y si el segundo update fallaba la inscripción quedaba confirmada con el pago sin verificar. Nueva ruta `POST /api/event/confirm-payment` (confirm/reject) que escribe ambas filas y avisa. Rechazar deja el pago en **`'void'`** —el CHECK de `038` no admite `'rejected'`— y la pantalla del alumno vuelve a ofrecerle subir un comprobante; antes ni siquiera existía la acción de rechazar.

**8. Un evento de HOY se daba por pasado.** `new Date('YYYY-MM-DD')` es medianoche **UTC** y en Chile cae el día anterior, así que `isPast` era verdadero el mismo día del evento y la CTA de inscripción desaparecía. En las dos plataformas. Es el bug de fechas que `CLAUDE.md` documenta para `formatDate`, en una comparación que nadie había revisado.

**9–12. Cuatro huecos de paridad y de estado en mobile.**
- **No había cómo pagar la entrada de un evento**: tras inscribirse, mobile mostraba "✅ Estás inscrito. Te esperamos!" aunque faltara pagar, sin datos de transferencia ni subida de comprobante. Ahora tiene las dos cosas y el copy dice la verdad.
- **No había cómo pagar un paquete**: sólo el texto "Inscrito — pendiente de pago". Agregada la subida (mismo camino que la pantalla de pago de clase: bucket privado bajo la carpeta del usuario + registro por ruta de servidor).
- **`/api/chat/list` no devolvía `participants` ni `last_read_at`** (la página web equivalente sí los traía): en la lista de chats de mobile, un chat 1:1 se pintaba con un ícono genérico y el título de la clase en vez del nombre y la foto de la otra persona, y el punto de "no leído" quedaba encendido **para siempre**.
- **`/api/rehearsal/respond` sólo aceptaba cookie** y mobile la llama con Bearer → 401 siempre: **aceptar o rechazar una invitación a ensayo desde la app nunca funcionó**. Se revisaron una por una las ~30 rutas que mobile consume; era la única.

**13–16. Cuatro de menor calibre, cerrados igual.** Rechazar un paquete dejaba las inscripciones de clase en `payment_submitted` (vuelven a `pending_payment`); un profesor podía abrir un chat de clase con **cualquier** usuario pasando un `student_id` sin inscripción (ahora se verifica); el chat de mobile se quedaba girando para siempre si no había sesión; y los avisos de pago de evento reusan `payment_confirmed`/`payment_rejected` con `data.event_id`, que ahora enrutan al evento en vez de a "Mis clases" (donde los eventos no aparecen) — agregar un tipo nuevo obliga a reescribir el CHECK entero de `notifications`, y no valía el riesgo.

**17. La CSP de desarrollo bloqueaba el HMR del propio Next.** Salió al montar el smoke de navegador: `next dev` abre un websocket de recarga en caliente en `ws://localhost:<puerto aleatorio>`, y el `connect-src` de dev sólo contemplaba el stack local de Supabase. El navegador lo reintentaba en bucle, y cada error de consola dentro de un render hacía que el overlay de desarrollo lanzara además el warning "Cannot update a component (`HotReload`) while rendering a different component (`ClassCard`)" — que parecía un bug de la app y no lo era. **No afecta a producción** (la excepción es sólo de dev), pero hacía que el hot reload no funcionara localmente. Corregido en `next.config.js`.

**18. Una clase sin hora tumbaba el feed entero — para todos.** El hallazgo más caro del smoke, y el que justifica la suite. `recurring_time` es NULLABLE, y `formatTime` hacía `time.split(':')` sin más: una sola fila incompleta lanzaba una excepción **durante el render de una tarjeta**, que React propaga hasta el árbol y deja la pantalla en blanco. No es una fila hipotética — apareció sola en cuanto la base tuvo datos de otras pruebas (entrenamientos sembrados sin `recurring_time`), y en producción la puede crear cualquier script, importación o columna que se agregue después. `formatTime` (web y mobile) devuelve ahora cadena vacía, y las dos tarjetas de clase arman el texto de horario con `filter(Boolean)` para no dejar "undefined" en pantalla. Con 3 pruebas unitarias que fijan el comportamiento.

Esto es también la respuesta a "¿para qué sirve un smoke de render si el typecheck está en cero?": el tipo decía `string`, la base decía `null`, y nadie lo iba a notar hasta que un usuario abriera el feed.

**Registrado, no arreglado (alcance de producto, no defectos silenciosos):**
- **Mobile no crea ensayos, no los edita ni invita, y no tiene el calendario de coordinación** — un ensayo `date_mode='coordinate'` sólo se coordina desde la web.
- **Mobile no invita profesores a un evento ni confirma pagos como organizador.**
- **La inscripción a eventos no tiene control de cupo server-side** (el `isFull` es del cliente): dos personas simultáneas pueden pasarse del máximo. Las clases sí lo tienen porque pasan por `/api/class/enroll`.
- **`/api/packages/[id]/enroll` no valida cupo, clase vencida ni audición requerida**, cosas que `/api/class/enroll` sí valida: un paquete puede sobrepasar el cupo de una de sus clases.
- **El barrido de chats del cron no pagina** (mismo patrón que P2-5, que S6 corrigió para clases): con más de 1000 chats, los que caen fuera de la primera página no se limpian.
- **Re-invitar a alguien ya invitado a un ensayo le reenvía la notificación** (el upsert ignora el duplicado, el aviso no).

**Verificación:** `npm run db:reset` (replay de las **72** migraciones desde cero) → `tsc --noEmit` web y mobile en cero → **242** unit tests verdes → integración **21/21** (12 previas + 9 nuevas) → smoke de navegador **5/5** (las cuatro features en claro y oscuro, como alumno y como profesor, más el envío de un mensaje). Las dos suites se corrieron **dos veces seguidas** para confirmar que son re-ejecutables. Ambas necesitan `npm run dev:web` apuntando al stack local; los casos de integración que hablan por HTTP se **saltan** (no fallan) si el servidor no está.

**Dos aprendizajes del smoke, para que la próxima sesión no los repita:**

- **Interactuar antes de la hidratación no falla, miente.** El primer intento tecleaba en el chat apenas cargaba el HTML: `fill` escribía en el DOM, React nunca se enteraba y el botón quedaba deshabilitado — idéntico a un bug de envío. El envío estaba perfecto (se verificó con un diagnóstico aparte: `POST 201`, mensaje pintado y fila en la base). La prueba ahora teclea de verdad y espera a que el botón se habilite, que es la señal de que la página ya responde. De paso, el botón de enviar ganó `aria-label` (no tenía nombre accesible).
- **Bajo presión de memoria el smoke no miente, pero tarda una eternidad**: una corrida llegó a 1,5 h con timeouts de login y de arranque del navegador, y todo eso desapareció con la máquina libre (19 s). Si falla por timeout, mirar `free -m` antes de buscar el bug.

**Pendiente que deja S7:**

1. **Aplicar `071` y `072` en producción** (G-1), con el resto de la cola. Ninguna toca datos. Para `071` conviene mirar antes el dashboard: si Realtime ya estaba activado a mano para esas tablas, la migración lo detecta y no hace nada.
2. **Sigue sin haber verificación en un dispositivo real**: el smoke corre en navegador (web). Los arreglos de mobile de esta sesión —subida de comprobante de evento y de paquete, lista de chats, detalle de ensayo— están verificados por typecheck y por la capa de datos, no abriendo la app. Es lo mismo que S2–S6 dejaron anotado y sigue necesitando un build de Expo.
3. **Los seis puntos "registrado, no arreglado"** de arriba: son decisiones de alcance, no descubrimientos pendientes. Los dos de cupo (eventos y paquetes) son los únicos con consecuencia económica.

### S8 · Gates finales y despliegue — 🔶 en preparación (2026-07-29)

**Entregable de esta sesión: el §11 completo** (checklist de despliegue). No se tocó producción ni se ejecutó ningún `db push` — el usuario pidió específicamente el checklist para ejecutarlo él mismo, dado que aplicar migraciones + deployar código en una app con dinero real de por medio es una acción de alto riesgo que corresponde confirmar y correr con las propias credenciales, no delegarla a un agente en modo automático.

**Verificación de entorno hecha en esta sesión (solo lectura, sin tocar nada):**
- `supabase/.temp/linked-project.json` confirma que el repo está linkeado al proyecto `hkmvbutjjrxmegdliiqt` ("DcProject"), pero el CLI de esta sesión no tiene sesión iniciada (`supabase migration list --linked` → `LegacyProjectNotLinkedError` pese al link local) — no hay forma de leer el estado real de migraciones de prod desde este entorno sin que el usuario inicie sesión.
- No hay proyecto Vercel linkeado (`.vercel/` no existe en ningún nivel del repo) y `npx vercel whoami` no completó — tampoco hay forma de verificar env vars ni el estado del deploy desde este entorno.
- `git status -sb` muestra `main...origin/main` sin diferencia: el commit `30a185e` ya está tanto local como en GitHub. Esto **no** significa que Vercel ya lo sirva — depende de si el proyecto tiene autodeploy activado en `main` y si hubo algún push previo a esta ronda de sesiones. Confirmado por el usuario: **nada de esto se ha desplegado aún**; el orden pactado es migraciones → luego push/deploy.
- `grep` sobre `apps/web/src/lib/qrAttendance.ts` confirma que `QR_TOKEN_SECRET` es una env var **obligatoria** (sin ella no se emite ni valida ningún QR de asistencia) que **no aparece en la tabla de env vars de `CLAUDE.md`** — hueco de documentación nuevo, no solo de configuración. Ver G-4 abajo.

**Nada de S2–S7 quedó invalidado por esto**: todas esas sesiones se verificaron contra el stack local de Docker, que es independiente de si prod ya tiene el código o no.

---

## 11. S8 — Checklist de despliegue a producción (preparado 2026-07-29)

Preparado para que el usuario lo ejecute directamente (no fue corrido por el agente). Cubre G-1 y G-4; G-2, G-3, G-5, G-6 y D-1 siguen siendo trabajo exclusivo del usuario y se listan al final solo como recordatorio de qué falta, sin información nueva sobre ellos.

### 11.1 · G-1 — Migraciones pendientes: estado y orden

**Ya aplicadas en prod (confirmado en `CLAUDE.md`, no requieren acción):** `001`–`047`, `052`, `053`. `054` (QR de asistencia) no tiene una nota explícita de "aplicada" en `CLAUDE.md`, pero tampoco aparece en la lista de "no aplicadas" que registra el propio audit (§6, G-1) — presumiblemente ya está en prod. **Verificar con `supabase migration list --linked` antes de asumir nada**, en vez de confiar en esta reconstrucción.

**Pendientes: `048`, `049`, `050`, `051`, `055`→`072` (24 migraciones).** `supabase db push` las aplica todas en orden numérico automáticamente — no hace falta ejecutarlas una por una a mano. Lo que sí exige atención manual es lo que sigue:

| # | Riesgo | Acción previa obligatoria |
|---|---|---|
| `048_admin_actions_settings` | Bajo — aditiva | Ninguna |
| `049_grant_public_table_privileges` | Ninguno — probablemente no-op (prod ya tiene los grants vía bootstrap del dashboard) | Ninguna |
| `050_fix_referral_functions_search_path` | Ninguno — `CREATE OR REPLACE`, idempotente. Puede ser no-op si ya se parchó a mano en prod | Opcional: `SELECT prosrc FROM pg_proc WHERE proname = 'generate_referral_code';` para ver si ya tiene `SET search_path` |
| `051_fix_handle_new_user_role_default` | Ninguno — mismo caso que `050` | Opcional: `SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';` |
| `055_late_payment_holds_and_archive` | Medio — agrega columnas + estado `'archived'` | Ninguna, pero **debe ir antes que `056`** (la depende) |
| `056_enrollment_integrity` | Bajo — trigger + índice | Requiere `055` ya aplicada (el orden numérico del CLI lo garantiza) |
| `057_posts_visibility_rls` | Bajo — reescribe una policy | Ninguna |
| `058_teacher_financial_summary` | Ninguno — solo crea una función | Ninguna |
| `059_fix_chat_rls_recursion` | Bajo, pero **funcionalmente crítica**: sin ella el chat sigue sin entregar mensajes en prod aunque el código nuevo ya esté deployado | Ninguna, pero conviene aplicarla **antes o junto con** el deploy del código de chat |
| `060_post_plan_visibility` | Medio — agrega triggers que rechazan INSERT de posts sin plan | Ninguna |
| `061_class_payment_methods` | Medio | **Debe ir antes de deployar el código de marketplace v2** (enroll/create/edit clase referencian `accepts_mp`/`accepts_transfer` — sin la migración, esas rutas responden error de columna inexistente) |
| `062_fix_2x_payment_assignee` | Bajo | `SELECT column_name FROM information_schema.columns WHERE table_name='class_2x_requests' AND column_name='payment_assignee';` — si ya existe, la migración es no-op igual (aditiva). Mismo deploy que `061` |
| `063_fix_2x_requests_rls_and_dedup` | Bajo | Ninguna |
| `064_payments_void_status` | Bajo — habilita un valor de CHECK | Ninguna (el código que escribe `'void'` ya existe hace tiempo y fallaba en silencio; tras esto empieza a funcionar) |
| `065_write_guards_rls` | ⚠️ **La más urgente de todas: cierra P0-1** | **Debe ir junto con el deploy del código de S1** (mobile `ratings.ts`, guard de `referral.ts`, fix del callback OAuth de MP) — si se aplica sin ese código, las valoraciones desde mobile fallan hasta que el deploy llegue |
| `066_enrollments_pending_since` | Bajo | Junto con `065` (mismo trigger extendido) |
| `067_periodica_custom_dates_only` | 🔴 **Alto — muta datos, conversión de una sola vía** | **Tomar respaldo antes de correrla:** `CREATE TABLE IF NOT EXISTS _backup_067_periodicas AS SELECT id, recurrence, day_of_week, start_date, ends_at, ends_indefinitely, custom_dates, created_at FROM classes WHERE type = 'periodica';` y revisar el alcance con `SELECT recurrence, count(*) FROM classes WHERE type='periodica' GROUP BY recurrence;` |
| `068_training_monthly_charges` | 🔴 **Alto — cambia forma del embed `payment:payments(*)` de objeto a array en TODO PostgREST, no solo para entrenamientos** | **Tomar respaldo antes:** `SELECT id, enrollment_id, amount, status, submitted_at FROM payments ORDER BY submitted_at;`. Coordinar estrictamente con el deploy del código de S4 (los 8 consumidores del embed ya migraron a `paymentList()`, pero confirmar que ese código es el que se está por deployar) |
| `069_teacher_confirm_via_route` | Medio | **Junto con o después del deploy del código de S4** (`confirm_offline`) — si se aplica antes, el botón "Confirmar" del profesor falla con 42501 hasta que el código llegue |
| `070_payment_platform_hardening` | Bajo — aditiva | Ninguna |
| `071_realtime_publication` | Ninguno — idempotente | Revisar antes en el dashboard (Database → Replication) si `chat_messages`/`notifications` ya están publicadas a mano; si sí, la migración es no-op |
| `072_fix_rehearsal_rls_recursion` | Bajo — aditiva | Ninguna |

**Notas de fondo:**
- Como el usuario confirmó que **el código todavía no está deployado**, las migraciones "acopladas a un deploy de código" (`059`, `061`+`062`, `065`+`066`, `069`) no tienen ventana de riesgo real *ahora*: aplicar toda la cola de una sola pasada con `supabase db push` y recién después empujar el código es exactamente el orden más seguro, porque el código viejo en prod nunca referencia columnas nuevas y el código nuevo las encuentra ya creadas al llegar.
- El único paso que **debe** hacerse a mano y **antes** de correr `supabase db push` es tomar los dos respaldos de `067` y `068` (no son parte del archivo de migración, hay que ejecutarlos aparte por SQL editor).

**Secuencia recomendada:**
1. Backup completo de la base (también cubre parte de G-5): `supabase db dump` o snapshot desde el dashboard si hay plan Pro.
2. Correr las dos queries de respaldo de `067` y `068` (arriba) y guardar el resultado.
3. Revisar Database → Replication en el dashboard de Supabase (pre-check de `071`).
4. `supabase login` (si esta terminal no tiene sesión) → confirmar que `supabase migration list --linked` refleja lo esperado (052–054 aplicadas, 055+ pendientes) antes de empujar nada.
5. `supabase db push`.
6. `supabase migration list --linked` de nuevo — confirmar que las 24 quedaron aplicadas remoto y local.
7. Recién ahí, deploy del código (`git push` ya hecho a `main`; falta confirmar/disparar el deploy en Vercel).
8. Smoke test inmediato en prod: enviar un mensaje de chat (`059`+`071`), abrir el detalle de un ensayo (`072`), confirmar una valoración solo vía UI (`065`), revisar `/api/attendance/scan` de un entrenamiento con deuda (`068`).

### 11.2 · G-4 — Env vars: estado y un hueco nuevo

Reconstruido de `CLAUDE.md` (no verificado contra Vercel desde esta sesión — no hay proyecto Vercel linkeado en este entorno):

**Confirmadas por el usuario en sesiones previas:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`, `HEALTHCHECK_CLEANUP_CLASSES_UUID`/`HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID`.

**Marcadas "⚠️ verificar" y sin confirmación posterior registrada:** `SUPERADMIN_USER_ID`, `CRON_SECRET`, `ANTHROPIC_API_KEY` (necesaria para el escaneo IA; sin ella cae a revisión manual en silencio, no rompe nada pero desactiva la feature).

**Opcionales, sin registro de si se configuraron:** `HEALTHCHECK_MONTHLY_CHARGES_UUID`, `HEALTHCHECK_MP_CONNECTIONS_UUID`, `HEALTHCHECK_PLAN_CONTENT_UUID`.

**Hueco de documentación encontrado en esta sesión: `QR_TOKEN_SECRET`.** `apps/web/src/lib/qrAttendance.ts` la exige para emitir y validar cualquier token QR de asistencia (feature de `054`, entrenamientos con cobro mensual de `068` incluidos) y **no aparece en la tabla de env vars de `CLAUDE.md`** ni en ningún registro de sesión anterior. **Actualización:** ya está generada y en uso local (`apps/web/.env.local` y `.env.development.local`, ambos gitignored, nunca llegaron a GitHub) — solo falta copiar ese mismo valor (o generar uno nuevo con `openssl rand -base64 32`) a Vercel → Settings → Environment Variables, **sin** prefijo `NEXT_PUBLIC_` (debe quedar server-only). Si falta en prod, ningún QR se emite ni se valida — el escaneo de asistencia queda roto en silencio hasta que un profesor intente escanear a un alumno. **No rotar este valor una vez en producción** salvo de forma deliberada: invalida todos los QR ya emitidos (el HMAC deja de coincidir).

**Opcional, sin impacto si falta hoy:** `EXPO_PUBLIC_WEB_URL` (mobile) — si no está seteada, cae al dominio de Vercel hardcodeado (`packages/shared/src/lib/webUrl.ts`), que es el que mobile ya usa. **No es bloqueante para el deploy actual.** Solo hace falta configurarla (`https://danzclass.com`) cuando se decida apuntar mobile al dominio propio (G-6) — y en ese momento hay que recordar que las `EXPO_PUBLIC_*` se inlinean en build time (Metro/EAS), no en runtime: cambiarla exige un **build nuevo de EAS**, no alcanza con un OTA update.

### 11.3 · G-2, G-3, G-5, G-6, D-1 — sin cambios, siguen siendo tuyos

Nada nuevo que aportar desde el código en estos cinco puntos; quedan exactamente como los describe §6 y §4 (D-1):
- **G-2** QA con sandbox de Mercado Pago — necesita tus cuentas de prueba.
- **G-3** Revisión legal chilena de `/terms` y `/privacy` — el texto es borrador de un modelo, sin validar por un abogado.
- **G-5** Backups — Supabase free no los tiene automáticos; decidir Pro ($25/mes, PITR) o `supabase db dump` programado antes de que haya dinero real entrando.
- **G-6** Dominio `danzclass.com` — apuntar a Vercel + actualizar `APP_URL`/Site URL de Supabase + (opcional) `EXPO_PUBLIC_WEB_URL`.
- **D-1** iOS + IAP — decisión de negocio, cuanto antes mejor porque puede cambiar el alcance de todo S8 (build EAS, submit a tiendas).
4. **S8 no cambia de alcance.**
