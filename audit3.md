# Tercera auditoría integral — DanzClass

**Fecha:** 2026-07-30
**Alcance:** monorepo completo (`apps/web`, `apps/mobile`, `packages/shared`, `supabase/migrations`), con el objetivo explícito de ser **la última auditoría antes de invitar usuarios reales a la alpha**, en web y en mobile. A diferencia de las dos anteriores —que fueron mayormente auditorías de RLS con hallazgos funcionales de paso—, ésta busca *todo* lo que falta, está roto, está a medias o es riesgo real con dinero de verdad: bugs, huecos de funcionalidad, deuda documentada y nunca cerrada, paridad mobile/web, e infraestructura de despliegue sin confirmar.

**Baseline verificado en la sesión 1 (antes de tocar nada):** typecheck web limpio · typecheck mobile limpio (0 errores) · **242** unit tests verdes · **25/25** de integración verdes (con `npm run dev:web` arriba) · **5/5** smoke E2E · stack local de Supabase corriendo con las **74** migraciones aplicadas (`supabase_migrations.schema_migrations` = 74, última `074`).
**Al cerrar la sesión 3 (última de código, 2026-07-30):** **257** unit tests verdes (242 + 8 de `classQuota` en S2 + 7 de `notificationRoutes` en S3) · integración **43 verdes + 0 saltados** (con `dev:web` arriba; ver §6 y §10-S3) · typecheck web y mobile en cero · **75** migraciones aplicadas en el stack local (sin cambio desde S2 — S3 no agregó ninguna). **Producción no se tocó en ningún momento durante las tres sesiones.**

**Método.** El mismo de `audit.md` y `audit2.md`, sin excepciones: nada de lectura especulativa. Cada hallazgo con consecuencia se **reprodujo empíricamente** contra el stack local de Docker, con JWT de usuario real —por PostgREST cuando el ataque no pasa por la app, y por HTTP contra `dev:web` cuando sí—, y la salida real de cada corrida está transcrita en el hallazgo. Los hallazgos de código citan `archivo:línea`. Donde no verifiqué algo, lo digo en **§7** en vez de afirmarlo.

**Relación con los documentos previos.** `audit.md` (S1–S8) cerró la superficie de escritura RLS de las 6 tablas de dinero, el chat, el cobro mensual de entrenamientos, las clases periódicas, la paridad de S6, Realtime, y dejó el checklist de despliegue de su §11. `audit2.md` (S1–S2) cerró el mismo patrón de RLS en 5 tablas de invitación/relación, la edición de postulación de audición, el CI de integración, un bug de paginación y la deuda heredada al reactivar una inscripción de entrenamiento. **Este documento no reabre ninguno de esos hallazgos** — se verificó que siguen cerrados corriendo la suite completa (`rls-guards.spec.ts` incluida) contra el stack local, 30 verdes. Lo que hay acá es nuevo.

---

## 0. Resumen ejecutivo

Las dos auditorías anteriores dejaron la capa de datos sólida: hoy un cliente no puede escribir lo que no le corresponde en ninguna de las 11 tablas que se blindaron. El problema que encontró esta tercera pasada está **una capa más arriba**: hay rutas de servidor que escriben en nombre del cliente **sin repetir las validaciones que la ruta hermana sí hace**, y hay estados de la aplicación que se alcanzan sin que ocurra el hecho que representan.

1. **Un comprobante de pago que no existe vale como pago.** `/api/payment/submit-transfer` valida que el path del comprobante empiece por la carpeta del usuario, pero **nunca que el archivo exista**. Con un `POST` y un nombre inventado: en un entrenamiento, tres mensualidades vencidas pasan de `due` a `pending`, la deuda deja de contar como vencida y **el QR de acceso vuelve a funcionar** (reproducido: el escáner pasó de `debt_overdue` a `confirmed`); en una clase con reserva de 10 minutos, el `hold_expires_at` se borra y **el cupo queda tomado para siempre**, porque nada barre las inscripciones en `payment_submitted`. El profesor que intenta mirar el comprobante recibe un 500.
2. **El sistema 2x es una puerta lateral a la inscripción.** `/api/class-2x/match` crea las **dos** inscripciones sin comprobar audición requerida, clase vencida, clase cancelada, vía de pago viable ni reserva. Reproducido: `/api/class/enroll` devolvió `403 audition_required` y, sobre la misma clase, el match devolvió `200` con los dos alumnos dentro de un entrenamiento con audición obligatoria y **cero postulaciones**. La misma llamada metió a dos personas en una clase **cancelada** con fecha de 2020.
3. **El plan pago no se hace cumplir.** Un tier `basic` ($1.500) puede publicar sueltas ilimitadas, periódicas y entrenamientos: el tope vive sólo en el formulario web, **mobile no lo aplica en absoluto** (su pantalla de publicar ofrece "Periódica" y "Entrenamiento" a cualquiera con plan) y la base sólo exige "tener algún plan". Reproducido: 3 sueltas + 1 periódica + 1 entrenamiento aceptadas con tier `basic`.
4. **Borrar la cuenta no borra casi nada de lo que importa.** La sesión sigue viva (el refresh token renovó la sesión **después** del borrado, verificado), la suscripción en `grace` no se cancela, **no se llama nunca a Mercado Pago** (el propio comentario lo admite) así que el cobro mensual sigue corriendo, y el push token sobrevive: el usuario borrado sigue recibiendo notificaciones en su teléfono.
5. **Tres features entregadas que no funcionan como dicen:** el widget embebible se sirve con `X-Frame-Options: DENY` y `frame-ancestors 'none'` (no se puede embeber en ninguna parte); la lista de espera avisa **siempre a la misma persona** y nunca se limpia, así que el segundo de la fila jamás se entera; y tocar una notificación push no lleva a ninguna pantalla, mientras la limpieza de tokens muertos es código que nunca se ejecuta (compara contra un campo que el SDK de Expo no devuelve).

No encontré nada nuevo en: los guards de escritura de `065`/`073` (siguen cerrados), la aritmética de comisión y gross-up de Mercado Pago, el motor de cargos mensuales, el refresh de tokens OAuth, la elegibilidad de valoraciones, la validación de descuentos, el premio de referidos, ni la cobertura de los 29 tipos de notificación en web y mobile. El detalle de qué revisé sin encontrar nada está en **§5**.

**Semáforo:**

| | Estado |
|---|---|
| 🔴 **Bloqueadores reales** | 2 (P0-1, P0-2) — ✅ **los dos cerrados en la sesión 1** (§10) |
| 🟠 **Importantes antes de invitar usuarios** | 6 (P1-1 a P1-6) — ✅ **los 6 cerrados** (P1-1/P1-3 en S2; P1-2/P1-4/P1-5/P1-6 en S3) |
| ⚪ **Deuda acotada** | 12 (P2-1 a P2-12; P2-1, P2-2, P2-3, P2-6, P2-8, P2-9 y P2-11 cerrados — quedan P2-4, P2-5, P2-7, P2-10, P2-12) |
| 🧾 **Gates que no son código** | ver §9 (checklist go/no-go) |

---

## 1. 🔴 P0 — Bloqueadores

### P0-1 · Un comprobante que no existe registra el pago: devuelve el QR de un entrenamiento con deuda y toma un cupo para siempre

> ✅ **CERRADO en S1 (2026-07-30)** — las tres puntas: `receiptObjectExists()` (`lib/receipts.ts`) en `submit-transfer` y en `packages/[id]/submit-payment`; `create-payment` deja el cargo en **`'due'`** en vez de `'pending'` al crear la preferencia; y el cron avisa al profesor de los comprobantes que llevan 3+ días sin revisar (no cancela: el alumno hizo su parte). Fijado con dos tests nuevos en `tests/integration/audit3-coverage.spec.ts`. **Sin migración.** Detalle y lo que se decidió distinto de la recomendación, en §10.

**Dónde:**
- `apps/web/src/app/api/payment/submit-transfer/route.ts:56-60` — única validación del path: `receiptPath.startsWith(`${userId}/`)`.
- `:121-144` — con esa sola validación, cada cargo mensual pasa a `status: 'pending'`.
- `:246-249` — en el camino de pago único, además `hold_expires_at: null`.
- Consecuencia 1: `packages/shared/src/lib/monthlyCharges.ts:46` (`UNPAID = ['due','rejected','refunded']`) y `:121-128` (`isChargeOverdue` devuelve `false` para `pending`) → `hasOverdue` pasa a `false`.
- Consecuencia 2: `apps/web/src/app/api/cron/cleanup-classes/route.ts:312-326` — el barrido de reservas impagas filtra `.eq('status','pending_payment')`, y el comentario de la línea 316 lo dice explícitamente: *"El alumno que sí subió comprobante pasa a 'payment_submitted', así que esto solo alcanza reservas nunca concretadas"*. **Nada barre `payment_submitted`.**
- Misma puerta por Mercado Pago: `apps/web/src/app/api/mercadopago/create-payment/route.ts:213` escribe `status: 'pending'` al **crear la preferencia**, antes de que el alumno pague nada.

**Qué pasa.** La ruta comprueba que el path del comprobante viva bajo la carpeta del usuario (lo que exige la policy del bucket) pero no que el objeto exista. Como el archivo se sube desde el cliente y el registro va por la ruta, basta con saltarse la subida.

**Verificado empíricamente** (stack local + `dev:web`, salida real de la corrida):

```
cargos: 2026-04:due 2026-05:due 2026-06:due 2026-07:due
confirm_offline mes 1 → 200 {"ok":true,"paymentStatus":"verified"}
token QR: active
scan (con 3 meses vencidos) → 200 {"status":"rejected","reason":"debt_overdue",
    "message":"El alumno tiene mensualidades vencidas.",
    "debt":{"months":3,"total":60000,"periods":["2026-05","2026-06","2026-07"]}}

POST /api/payment/submit-transfer  { receiptPath: "<userId>/inexistente-….jpg",
                                     chargeIds: [los 3 vencidos] }
  → 200 {"ok":true,"charges":3,"amount":60000}

scan (después del "pago" fantasma) → 200 {"status":"confirmed","student":{…},
    "checked_in_at":…}
receipt-url del comprobante fantasma → 500 {"error":"Could not sign URL"}
```

Y sobre una clase con reserva de 10 minutos (`allow_late_payment = false`, `max_spots: 1`):

```
enroll → 200 hold_expires_at: 2026-07-30T04:54:21.530Z
submit-transfer con path inexistente → 200 {"ok":true}
inscripción: {"status":"payment_submitted","hold_expires_at":null}
cupos disponibles en una clase de 1 cupo: 0
```

**Consecuencia.** Dos, ambas con dinero real de por medio:

- **Entrenamiento:** un alumno con tres meses impagos recupera el acceso por QR con **una sola request**, sin subir un archivo. Y no es un estado transitorio: el cargo se queda en `pending` para siempre salvo que el profesor lo rechace a mano — pero el profesor **no puede ver el comprobante** (500 al firmar la URL), y en su pantalla el alumno deja de aparecer como deudor y pasa a "en revisión". El modelo de entrenamientos que definió el usuario tiene al QR como **única** consecuencia del impago; esto lo anula por completo.
- **Cualquier clase con reserva:** el cupo queda tomado indefinidamente. El `hold_expires_at` de la migración `055` existe justamente para que una reserva no concretada libere el cupo en 10 minutos; una request lo borra y la inscripción entra a un estado que ningún barrido del cron toca. Es la "reserva perpetua" que `audit.md` P0-1 cerró por RLS, reabierta por una ruta de servidor.

La vía de Mercado Pago es peor de razonar pero igual de real: `create-payment` marca el cargo como `pending` al crear la preferencia. Abrir el checkout y abandonarlo deja la mensualidad fuera de "vencida" sin que ningún peso se haya movido, y ni siquiera hay comprobante que rechazar (`/api/payment/confirm` responde 409 `mp_payment_not_reviewable` sobre pagos MP, por diseño de S5). **No pude reproducir esta mitad** porque `preference.create` exige la cuenta MP conectada del profesor (ver §7); es lectura directa de la línea 213, sin ambigüedad.

**Recomendación.**
1. **Verificar que el objeto exista** antes de aceptar el registro: un `list(dir, { search })` o un `createSignedUrl` sobre el path, con service role, en `submit-transfer` y en `/api/packages/[id]/submit-payment` (que tiene la misma forma). Es la única comprobación que convierte "el alumno dice que pagó" en "hay algo que revisar".
2. **Que crear una preferencia de MP no cambie el estado del cargo.** El cargo debe seguir `due` (o un estado propio tipo `awaiting_gateway` que **sí** cuente como impago) hasta que el webhook diga `approved`/`in_process`. Hoy la app le cree al alumno por haber apretado un botón.
3. Barrer también `payment_submitted` en el cron, con su propio reloj (`pending_since` ya se recalcula en cada transición, migración `066`), o al menos avisar al profesor de comprobantes que llevan N días sin revisar.

---

### P0-2 · `/api/class-2x/match` crea dos inscripciones sin ninguna de las validaciones de `/api/class/enroll`

> ✅ **CERRADO en S1 (2026-07-30)** — helper compartido `lib/enrollGuards.ts` (`loadEnrollableClass` + `assertCanEnroll`), llamado por `enroll` (que dejó de tenerlas escritas a mano) y por `match` **para los dos alumnos**; más el precio 2x, el cupo para dos y el `.eq('status','looking')` en el UPDATE, que ahora es un compare-and-set **antes** de crear las inscripciones. Fijado con tres tests nuevos (los dos ataques + el camino legítimo). **Sin migración.** Detalle en §10.

**Dónde:** `apps/web/src/app/api/class-2x/match/route.ts:39-104`, contrastado con `apps/web/src/app/api/class/enroll/route.ts:45-212`.

**Qué pasa.** `enroll` valida, en este orden: que la clase exista y esté `active` (`:46-53`), que no esté vencida (`:70-78`), que el alumno tenga la audición **aceptada** si la clase la exige (`:80-91`), que el profesor no se inscriba en su propia clase (`:93-96`), que la clase ofrezca una vía de pago viable (`:98-112`), y aplica la reserva de 10 minutos cuando corresponde (`:59-68`). `match` no hace **ninguna** de esas comprobaciones: lee la solicitud 2x, verifica que ninguno de los dos esté ya inscrito, e inserta las dos filas.

La solicitud 2x que dispara todo la crea el propio alumno, y la policy de INSERT de `class_2x_requests` sólo exige `user_id = auth.uid()` — así que no hace falta que la UI ofrezca el botón: un `INSERT` directo a PostgREST basta (verificado abajo). Con dos cuentas coordinadas, cualquiera entra.

**Verificado empíricamente** (mismo entrenamiento, mismas dos cuentas, salida real):

```
/api/class/enroll (sin audición)                  → 403 {"error":"audition_required"}
insert 2x request como alumno (PostgREST directo) → ACEPTADO
/api/class-2x/match                               → 200 {"success":true,…}
inscripciones creadas: [
  {"student_id":"dd47…","status":"pending_payment","is_2x":true,"hold_expires_at":null},
  {"student_id":"58e5…","status":"pending_payment","is_2x":true,"hold_expires_at":null}]
audiciones en la clase: 0
```

La misma clase tenía además `accepts_transfer:false` con `accepts_mp:true` y **sin cuenta MP conectada** — el caso exacto que `enroll` rechaza con `no_payment_method` (400) para no dejar a nadie con un cupo que no puede pagar. Y sobre una segunda clase:

```
match sobre clase CANCELADA y con fecha 2020 → 200 {"success":true,…}
inscripciones en la clase cancelada: [dos filas 'pending_payment']
```

**Consecuencia.**
- **La audición deja de ser un filtro.** Es el mismo impacto que `audit2.md` S1 ya había encontrado por otra vía (insertarse la postulación ya `accepted`, cerrado por `073`): el profesor selecciona a quién entra a su entrenamiento, y el 2x se salta esa selección por completo. Además el alumno queda inscrito, ocupa cupo y entra al cobro mensual.
- **Inscripciones en clases canceladas o vencidas**, que ninguna pantalla espera y que ensucian el historial del profesor y los barridos del cron.
- **Cupo tomado sin reserva:** las dos filas nacen con `hold_expires_at: null` aunque la clase no permita pagos atrasados, así que el lock de 10 minutos no aplica (las libera recién el barrido de 2x a los 7 días).
- **Carrera no cubierta:** `CLAUDE.md` documenta que *"si dos usuarios matchean simultáneo, el segundo recibe 404"* porque la ruta filtra `.eq('status','looking')`. Ese filtro está en el **SELECT** (`:43`), no en el `UPDATE` (`:111-118`, sólo `.eq('id', request_id)`): dos matchers concurrentes pasan los dos. Hoy el choque lo ataja el índice único de inscripciones (`056`) devolviendo un 500 genérico, no la lógica de la ruta.
- **El cupo sí está protegido**, eso conviene decirlo: el trigger `enforce_class_capacity` de `056` cubre todos los caminos de inserción, incluido éste. No hay sobrecupo por acá.

**Recomendación.** Extraer el bloque de validación de `enroll` (`:45-120`) a un helper compartido —`assertCanEnroll(admin, classId, userId)` que devuelva el mismo código de error— y llamarlo **para los dos alumnos** antes de insertar en `match`. Y poner `.eq('status','looking')` también en el `UPDATE`, que es donde la documentación ya cree que está.

---

## 2. 🟠 P1 — Importantes

### P1-1 · El plan Básico publica sin límite: el tope vive sólo en el formulario web y mobile ni lo intenta

> ✅ **CERRADO en S2 (2026-07-30)** — migración **`075_class_plan_quota.sql`**: `class_quota_for_tier()` + `monthly_suelta_count()` + trigger `classes_write_guard` **BEFORE INSERT OR UPDATE** (la rama de UPDATE porque convertir una suelta ya publicada en periódica saltaba el gate entero — `classes_update_teacher` de `001` es `USING` sin `WITH CHECK`). Más el gate que faltaba en mobile (candado en la pantalla de publicar + tope y traducción del error en el formulario) y la traducción del error en web. Fijado con 4 tests de integración y 8 unitarios. Detalle en §10.

**Dónde:** `packages/shared/src/types/index.ts:465-494` (lo que promete cada plan), `apps/web/src/components/class/CreateClassForm.tsx:128` (`basicBlocked = isBasic && sueltas_this_month >= 1`) y `:506-507` (`locked: isBasic` en periódica/entrenamiento), contra `apps/mobile/app/(app)/(tabs)/create.tsx:62,71` y `apps/mobile/app/(app)/class/create.tsx:100-101`.

**Qué pasa.** El plan Básico ($1.500/mes) promete *"Publica 1 clase suelta por mes"* y el Pro ($3.500) *"Publica clases ilimitadas (sueltas y periódicas)"*. La diferencia se hace cumplir así:

- **Web:** la page cuenta las sueltas del mes (`create-class/page.tsx:18-26`) y el formulario bloquea el botón y el selector de tipo. Es un gate de UI: el `INSERT` en `classes` sale **directo del cliente**, así que basta con otra pestaña, otro dispositivo o una request directa.
- **Mobile:** `(tabs)/create.tsx` ofrece "Periódica" y "Entrenamiento" a cualquiera que pase `canTeach(tier)` — sin `canTeachUnlimited`. Y `class/create.tsx` sólo usa el tier para el número de archivos (`mediaLimit`), no para el tope mensual ni para el tipo. **No existe el gate.**
- **Base de datos:** la policy `classes_insert_teacher` (migración `017`) sólo exige tener *algún* plan.

**Verificado empíricamente** (usuario con tier `basic`, insertando por PostgREST con su propio JWT — exactamente lo que hace la app mobile):

```
insert clase suelta #1 como plan Básico → ACEPTADO
insert clase suelta #2 como plan Básico → ACEPTADO
insert clase suelta #3 como plan Básico → ACEPTADO
sueltas publicadas este mes por un plan Básico: 3
insert PERIÓDICA como plan Básico       → ACEPTADO
insert ENTRENAMIENTO como plan Básico   → ACEPTADO
insert clase SIN PLAN                   → RECHAZADO (violates row-level security policy)
```

**Consecuencia.** El único motivo para pagar Pro en vez de Básico —publicar sin límite y publicar periódicas/entrenamientos— no se hace cumplir en ninguna capa que el usuario no controle. Un profesor que use la app móvil obtiene el paquete Pro completo pagando el Básico, **sin hacer nada raro**: la app se lo ofrece. Es una fuga de ingresos directa, y además una inconsistencia visible entre plataformas.

**Recomendación.** El precedente correcto ya existe en este repo: el cupo de videos del plan Básico se hace cumplir **en la base** con los triggers de la migración `060`, precisamente porque los posts se insertan desde el cliente. Replicar ese patrón: un trigger `BEFORE INSERT ON classes` que lea el tier con `get_user_tier` y rechace (a) la segunda suelta del mes calendario y (b) `type IN ('periodica','entrenamiento')` para `basic`. Y, en paralelo, poner el gate en la pantalla de publicar de mobile, que hoy ni siquiera muestra el candado.

---

### P1-2 · El widget embebible no se puede embeber en ninguna parte

> ✅ **CERRADO en S3 (2026-07-30)** — `next.config.js` separa el bloque de `headers()` en dos: `/((?!embed/).*)` (todo el sitio menos `/embed/*`, con `X-Frame-Options: DENY` + `frame-ancestors 'none'` intactos) y `/embed/:path*` (sin `X-Frame-Options`, CSP propia con `frame-ancestors *`). Verificado por HTTP contra el servidor real: `/embed/teacher/<username>` ya no manda `X-Frame-Options` y el resto del sitio (`/feed`) lo sigue mandando. Fijado con un test nuevo. Detalle en §10.

**Dónde:** `apps/web/next.config.js:49,55-59` (`frame-ancestors 'none'` en la línea 49 y `X-Frame-Options: DENY` en la 58, aplicados a `source: '/(.*)'` en la 56) contra `apps/web/src/middleware.ts:19-20` y `apps/web/src/components/profile/EmbedWidgetButton.tsx:16`.

**Qué pasa.** El middleware declara `/embed/*` como ruta *"completamente público (se embebe en iframes externos)"* y el botón "Widget para tu web" del perfil copia al portapapeles un `<iframe src="…/embed/teacher/<username>" …>`. Pero la cabecera de seguridad se aplica a **todas** las rutas sin excepción, así que el navegador de cualquier sitio externo bloquea el frame.

**Verificado empíricamente** contra el servidor real, con un `username` existente:

```
GET /embed/teacher/qaprof…  → HTTP/1.1 200 OK
X-Frame-Options: DENY
Content-Security-Policy: … frame-ancestors 'none'; …
```

**Consecuencia.** La feature está entregada, documentada, tiene su propio layout sin nav y su ruta pública en el middleware — y no funciona. El profesor copia el código, lo pega en su web y ve un recuadro vacío con un error en consola. Es de las pocas cosas que la app ofrece a un profesor para llevar tráfico desde afuera.

**Recomendación.** Servir `/embed/*` con su propia cabecera: quitar `X-Frame-Options` y usar `frame-ancestors *` (o una lista si se quiere acotar) sólo para ese prefijo, dejando el resto del sitio como está. `next.config.js` admite varias entradas en `headers()` con `source` distinto; la más específica debe ir primero. Y conviene un smoke que verifique la cabecera de `/embed/*`, porque es el tipo de regresión que nadie nota.

---

### P1-3 · Borrar la cuenta no corta la sesión, no cancela el cobro en Mercado Pago y no borra el push token

> ✅ **CERRADO en S2 (2026-07-30)** — los cuatro puntos, **sin migración**: cancelación real en MP + base vía `lib/subscriptionCancel.ts` (compartido con `/api/subscriptions/cancel`, con `('active','grace')` — cierra también **P2-8**), borrado de `push_tokens`, y revocación de **todos** los refresh tokens con `admin.auth.admin.signOut(accessToken, 'global')`. Fijado con un test de integración que mide las tres cosas. Detalle en §10.

**Dónde:** `apps/web/src/app/api/account/delete/route.ts:39-66`.

**Qué pasa.** La ruta anonimiza el perfil, marca `deleted_at`, cambia el correo a un tombstone y llama a `signOut()`. Lo que **no** hace:

1. **No termina la sesión de verdad.** El `signOut()` se ejecuta sobre el cliente construido con el Bearer del propio request; el *refresh token* del dispositivo sigue vivo.
2. **No cancela el cobro recurrente en Mercado Pago.** El comentario de la línea 52 lo dice: *"soft-cancel only — no MP API call in MVP"*. `/api/subscriptions/cancel` sí llama a `PreApproval.update({status:'cancelled'})`; el borrado de cuenta no.
3. **El filtro de suscripciones es `.in('status', ['active','trialing'])`** — `'trialing'` **no existe** en el CHECK de la tabla (`active|grace|expired|cancelled`), es un no-op; y falta `'grace'`, que sí es un estado real y que `getActiveTier` **honra**.
4. **No borra `push_tokens`.** La función `deletePushToken` existe en `apps/mobile/lib/pushNotifications.ts:62` y **no tiene ni un llamador** en todo el repo.

**Verificado empíricamente:**

```
account/delete (Bearer / camino mobile)  → 200 {"ok":true}
suscripción tras borrar:  [{"status":"grace","expires_at":"2026-08-04…"}]
push_tokens tras borrar:  1 fila(s)
refreshSession con el refresh token viejo → ACEPTADO — sesión renovada
  perfil leído con la sesión renovada: {"full_name":"Usuario eliminado","deleted_at":"2026-07-30…"}
  ruta autenticada con la sesión renovada → responde (404 por id inventado, no 401)
```

**Consecuencia.** Alguien que borra su cuenta desde la app móvil: sigue con sesión abierta (indefinidamente, porque el refresh token renueva), **le siguen cobrando** $1.500 o $3.500 al mes sin ninguna forma de pararlo desde la app (no puede volver a entrar por el tombstone del correo, y mobile tampoco tiene botón de cancelar — ver **P1-5**), y su teléfono sigue recibiendo las notificaciones push de la cuenta borrada. Con `status='grace'` conserva además el tier: `getActiveTier` devuelve `pro`.

Cobrarle a alguien después de que borró su cuenta, sin darle un camino para detenerlo, es exactamente el tipo de cosa que la Ley 19.496 (SERNAC) mira con lupa, y es indefendible con dinero real entrando.

**Recomendación.** En la misma ruta: cancelar en MP (reusando el bloque de `/api/subscriptions/cancel`), incluir `'grace'` y quitar `'trialing'` del filtro, borrar las filas de `push_tokens` del usuario, e invalidar la sesión de verdad con `admin.auth.admin.signOut(userId, 'global')` (o revocando los refresh tokens). Los cuatro son cambios de pocas líneas sobre una ruta que ya existe.

---

### P1-4 · La lista de espera avisa siempre a la misma persona y nunca se limpia

> ✅ **CERRADO en S3 (2026-07-30)** — helper compartido `lib/waitlist.ts` (`notifyWaitlist(admin, classId)`): recorre la fila en orden, borra (sin avisar) a quien ya esté inscrito y avisa al primero que no lo esté. `/api/class/enroll` borra la fila propia del alumno al inscribirse (el punto que faltaba). Llamado desde `/api/class/leave` y desde los **tres** puntos del cron que liberan cupo (holds vencidos, reservas impagas de 72h, timeout 2x de 7 días) — antes sólo `leave` avisaba. Fijado con un test que ancla dos personas en la fila, libera dos veces y exige que el segundo aviso sea para la SEGUNDA. Detalle en §10.

**Dónde:** `apps/web/src/app/api/class/leave/route.ts:71-89` (avisa al primero por `created_at`), y la ausencia total de un `DELETE` sobre `waitlist` fuera de `/api/class/waitlist/leave` — `grep` sobre todo el repo: los únicos accesos a la tabla son `class/[id]/page.tsx:111`, `class/[id]/index.tsx:620` (mobile), las dos rutas de join/leave y este aviso.

**Qué pasa.** Cuando alguien libera un cupo, se notifica al primero de la fila. Ese alumno se inscribe… y **su fila en `waitlist` sigue ahí**. La próxima liberación vuelve a elegirlo a él (es el más antiguo), y el segundo de la fila no se entera nunca. Además, la liberación por cualquier otro camino —el barrido de reservas vencidas, el timeout de 2x, el profesor eliminando a un alumno— **no avisa a nadie**: `waitlist` no aparece en el cron.

**Verificado empíricamente** (clase de 1 cupo, dos personas en lista):

```
w1 join waitlist → 200 ; w2 join waitlist → 200
owner leave      → 200
avisados: w1
w1 enroll        → 200
filas en waitlist tras inscribirse w1: w1,w2      ← w1 sigue en la lista
w1 se va otra vez …
avisos acumulados: w1,w1                          ← w2 nunca fue avisado
```

**Consecuencia.** La lista de espera es, en la práctica, una lista de una sola persona con avisos repetidos. Para todos los demás es un botón que no hace nada. El profesor, además, ve un badge "N en lista de espera" que cuenta a gente que ya está inscrita en su clase.

**Recomendación.** Borrar la fila de `waitlist` cuando el usuario se inscribe (en `/api/class/enroll`, junto al insert), y avisar al primero que **no** esté ya inscrito. Idealmente, mover el aviso a un helper `notifyWaitlist(classId)` y llamarlo también desde los tres puntos del cron que liberan cupo.

---

### P1-5 · Mobile no puede cancelar la suscripción — y la pantalla promete que sí

> ✅ **CERRADO en S3 (2026-07-30)** — `/api/subscriptions/cancel` cambió `createClient()` (solo cookie) por `requireUser` (acepta Bearer). Pantalla de planes mobile ganó el botón "Cancelar plan" (mismo texto de confirmación y mismo banner ámbar "acceso hasta X" que ya tenía la web, vía `getActiveSubscription`/`getCancelledPendingExpiry` de `packages/shared`). Fijado con un test que llama la ruta con Bearer y confirma `200` + `status='cancelled'`. Detalle en §10.

**Dónde:** `apps/mobile/app/(app)/plans/index.tsx:229` (*"Podés cancelar en cualquier momento."*) contra `apps/web/src/app/api/subscriptions/cancel/route.ts:7-10`, que usa `createClient()` (sólo cookie) y por tanto responde 401 a cualquier request con Bearer. `grep` confirma que el único llamador de esa ruta es `apps/web/src/components/plans/CancelSubscriptionButton.tsx:26`.

**Qué pasa.** No hay botón de cancelar en la app móvil, y aunque se agregara hoy, la ruta no aceptaría su autenticación. Es exactamente el mismo defecto que `audit.md` S7 encontró en `/api/rehearsal/respond` (cookie-only, mobile manda Bearer): la regla del repo es que toda ruta que mobile consuma use `requireUser`.

**Consecuencia.** Un usuario que se suscribió desde el teléfono no tiene forma de cancelar desde el teléfono; tiene que descubrir que existe la web. Además de la fricción y del texto que promete lo contrario, las políticas de Google Play (y de App Store, si iOS entra al lanzamiento — ver D-1 de `audit.md`) exigen que la gestión de la suscripción sea accesible desde la app.

**Recomendación.** Migrar la ruta a `requireUser` (acepta las dos vías) y agregar el botón en la pantalla de planes de mobile, con la misma confirmación y el mismo aviso de "tienes acceso hasta DD/MM" que ya usa la web. Mientras no exista, cambiar el copy.

---

### P1-6 · El push que llega no lleva a ninguna parte, y la limpieza de tokens muertos nunca se ejecuta

> ✅ **CERRADO en S3 (2026-07-30)** — los tres puntos: (a) navegación al tocar un push, resuelta con `resolveNotificationRoute()` (`apps/mobile/lib/notificationRoutes.ts`), fuente única compartida con el tap en la lista in-app (`notifications.tsx` perdió su copia duplicada del mapa de rutas); (b) `sendPushToUsers` correlaciona los tickets de error por **posición** dentro del chunk (el SDK los devuelve en el mismo orden que los mensajes), no por `ticket.to` —campo que no existe en `ExpoPushErrorReceipt`—, con fallback a `details.expoPushToken`; (c) `deletePushToken` gana su primer llamador, en el logout de mobile. Fijado con 7 tests unitarios del mapa de rutas (incluye un guard de completitud contra los 29 `NotificationType`). Detalle en §10.

**Dónde:** `apps/mobile/app/(app)/_layout.tsx:25-27` y `apps/web/src/lib/push.ts:47-62`.

**Qué pasa.** Dos defectos independientes en la misma feature:

1. **El tap no navega.** El listener de respuesta es un callback vacío con el comentario *"Navigation on tap is handled by expo-router's deep link support"*. Esa premisa es falsa con el payload que se envía: `sendPushToUsers` manda `data: { type, ...data }` (`lib/notifyUsers.ts:79`), sin ningún campo `url`, que es lo único que expo-router sabe seguir automáticamente. Tocar "Tu clase es mañana 📅" o "Te toca pagar el 2x" abre la app en la pantalla donde estaba.
2. **La limpieza de tokens es código muerto.** `push.ts:53` busca el token del ticket con `messages.find((m) => m.to === (ticket as any).to)`. El tipo real del SDK instalado (`node_modules/expo-server-sdk/build/ExpoClient.d.ts:93-100`) es `{ status:'error', message, details?: { error?, expoPushToken? } }` — **no existe `to`**. La comparación es siempre `undefined`, `invalidTokens` queda siempre vacío y **ningún token `DeviceNotRegistered` se borra jamás**. (Aparte: los `DeviceNotRegistered` reales suelen llegar en los *receipts*, que esta implementación no consulta.)

**Consecuencia.** El push está construido, desplegado, con tokens registrados y con texto por tipo (`PUSH_LABELS`, 25 entradas) — y entrega notificaciones que no llevan a ningún lado, que es justo lo que las hacía valiosas. En paralelo, `push_tokens` crece sin límite: cada reinstalación deja un token muerto, que suma envíos inútiles y acerca el rate limit de Expo. Sumado a que el token no se borra al cerrar sesión ni al borrar la cuenta (**P1-3**), un teléfono compartido recibe las notificaciones de la cuenta anterior.

**Recomendación.** (a) Agregar `url` al payload del push (o resolver la navegación a mano en el `responseListener` con el `type` + ids que ya viajan en `data`, que es lo más simple y no depende de la config de linking). (b) Correlacionar los tickets por **posición** dentro del chunk —que es como el SDK los devuelve— o leer `details.expoPushToken`. (c) Llamar a `deletePushToken` en el logout y borrar las filas del usuario en `/api/account/delete`.

---

## 3. ⚪ P2 — Deuda acotada

| # | Hallazgo | Dónde |
|---|---|---|
| **P2-1** ✅ **CORREGIDO en S3** | **La notificación de descuento se corta en silencio a 1000 seguidores.** La query de `follows` no tenía `.range()` ni `.limit()`: PostgREST corta en 1000 filas por defecto sin devolver error. Mismo patrón que `audit.md` P2-5 y `audit2.md` P2-1 ya corrigieron en dos crons. Corregido con el mismo patrón: loop de `.range()` en tandas de 500. | `api/class/discount/route.ts:81-85` |
| **P2-2** ✅ **CORREGIDO en S3** | **`sendPushToUsers` no troceaba ni paginaba el `.in('user_id', ids)`.** Con un batch grande (todos los seguidores de un descuento) la URL podía reventar o el resultado cortarse en 1000 filas, y el `catch` vacío hacía que el fallo fuera invisible. Corregido troceando `userIds` en tandas de 200 antes de cada `.in()`. | `lib/push.ts:21-26` |
| **P2-3** ✅ **CORREGIDO en S3** | **La purga de comprobantes a 90 días no paginaba y no cubría eventos ni paquetes.** La query de `payments` iba sin `.range()` (mismo corte silencioso); y desde que S7 movió los comprobantes de entrada de evento al bucket privado, nadie los purgaba — igual que los de paquetes. Corregido: la purga de `payments` pagina; se agregaron dos purgas nuevas — `event_payments` (`status='void'`, con fallback al bucket legacy `event-media` para comprobantes viejos) y `package_enrollments` (`status='pending_payment'` + `receipt_url` + `updated_at` viejo, el único indicador de "rechazado y nunca resubido" que existe en esa tabla). **No se agregó test automatizado** — invocar el cron completo desde un test tocaría todas las clases/inscripciones del stack local; mismo criterio que ya se aplicó (sin test) a los dos fixes anteriores de este patrón exacto (`audit.md` P2-5, `audit2.md` P2-1). Verificado por code review + el mismo patrón de paginación ya probado en producción por esos dos fixes. | `api/cron/cleanup-classes/route.ts:504-635` |
| **P2-4** | **Rutas con efecto secundario y sin rate limit.** `audit.md` P1-4 cubrió las 9 que nombraba y dejó el resto fuera de alcance. Las que hoy más importan: `class/waitlist/join` y `/leave`, `class/leave` (cancela inscripción y anula pagos), `class-2x/transfer-payment`, `packages` (crear), `packages/[id]/submit-payment` y `/confirm`, `subscriptions/cancel`, `event/respond-invite`, `rehearsal/update` y `rehearsal/[id]`, `payment/charges` (dispara `generate_monthly_charges`). | varias |
| **P2-5** | **Transferir el turno de pago 2x con un comprobante ya enviado deja dos pagos por un solo 2x.** `transfer-payment` no mira el estado del pago: si A ya subió su comprobante y transfiere el turno, B puede subir el suyo contra **su** inscripción (el índice único es por inscripción, y son dos distintas). El profesor termina con dos comprobantes de un pago único, y confirmar los dos cuenta el ingreso dos veces en el Panel Financiero. | `api/class-2x/transfer-payment/route.ts:33-54` |
| **P2-6** ✅ **CORREGIDO en S3** | **`/api/ratings/upsert` aceptaba decimales que el CHECK rechaza.** Validaba `stars >= 1 && stars <= 5` pero la tabla exige pasos de 0,5: un `3.7` pasaba la ruta y moría en la base con un 500 genérico. La UI sólo manda enteros, así que no se disparaba en producción. Corregido con `Math.round(stars * 2) !== stars * 2` (seguro para pasos de 0.5: son exactos en IEEE-754). Fijado con dos casos nuevos (rechaza 3.7, acepta 3.5) en el test de valoraciones ya existente. | `api/ratings/upsert/route.ts:28-31` |
| **P2-7** | **La extensión del archivo sale del nombre en avatares, media de clase y videos.** `D-4` cerró esto para los comprobantes (`detectReceiptType`), pero `EditProfileForm.tsx:55`, los dos `CreateClassForm`/`EditClassForm` y `CreatePostModal` siguen con `file.name.split('.').pop()` sobre buckets **públicos**. El `allowed_mime_types` del bucket es una segunda capa real, pero valida el content-type que declara el cliente. | 6 sitios de subida |
| **P2-8** ✅ **CORREGIDO en S2** | **El filtro de suscripciones de `/api/account/delete` usa un estado inexistente y omite uno real** (`'trialing'` no está en el CHECK; falta `'grace'`). Se arregló junto con **P1-3**: la lista vive ahora en un solo lugar (`BILLABLE_SUBSCRIPTION_STATUSES` en `lib/subscriptionCancel.ts`) que usan las dos rutas de cancelación. | `api/account/delete/route.ts:53-55` |
| **P2-9** ✅ **CORREGIDO en esta sesión** | **Documentación desactualizada en `CLAUDE.md`**: la tabla de componentes seguía listando `class/DashboardClient.tsx`, **borrado en `audit.md` S2**; las dos listas de "Funcionalidades futuras" nombraban push, 2x mobile, descuentos mobile y OCR, **los cuatro implementados** (y omitían lo que sí falta: ensayos y eventos en mobile, cancelar suscripción); la sección "Storage — archivos huérfanos" daba por abiertos tres casos ya cerrados; y el extracto de `NotificationType` listaba 22 tipos cuando el union real y el CHECK de la base tienen 29. Corregido acá porque es documentación que guía a cada sesión nueva: dejarla falsa cuesta más que arreglarla. | `CLAUDE.md`, `resumen.md:411-417` |
| **P2-10** | **La CSP sigue con `unsafe-eval`** (marcado "post-alpha" desde 2026-06-02). Con `unsafe-inline` en `script-src` ya presente por la hidratación de Next, quitar sólo `unsafe-eval` sube poco el listón; el cambio con valor real es pasar a CSP con nonce, que es una sesión propia. **Mi lectura: sigue siendo razonable posponerlo**, y conviene decidirlo explícitamente en vez de arrastrarlo. Falta además `object-src 'none'`, que es gratis. | `next.config.js:41` |
| **P2-11** ✅ **CORREGIDO en S1** | **La pantalla de pago web fallaba en silencio.** La rama de transferencia de `PaymentClient` sólo hacía `console.error` cuando la subida o el registro fallaban: el alumno apretaba "Enviar comprobante", el spinner se apagaba y **no pasaba nada, sin ningún mensaje** — mobile ya avisaba con un `Alert`. Salió a la luz al agregar el rechazo `receipt_not_found` de P0-1: una validación que nadie puede ver es media validación. Ahora hay una línea de error, con texto propio para ese caso. | `components/payment/PaymentClient.tsx` |
| **P2-12** *(nuevo, abierto)* | **El comprobante de entrada a un evento es la misma puerta de P0-1, y no tiene ruta de servidor.** `EventDetailClient` (y su equivalente mobile) suben el archivo y **insertan `event_payments` directo desde el cliente** con `receipt_url` y `status: 'submitted'`. No hay dónde poner la verificación de existencia: cerrarlo exige mover ese write a un `/api/event/submit-payment` (la contraparte del `confirm-payment` que S7 ya creó para el organizador). Consecuencia acotada respecto de P0-1 —no hay QR ni deuda mensual de por medio—, pero el cupo del evento sí queda tomado y el organizador ve "pendiente de revisión" sobre un comprobante que no existe. | `components/event/EventDetailClient.tsx:105-130`, `mobile event/[id]/index.tsx:107` |

---

## 4. Migraciones pendientes — secuencia única y actualizada

`audit.md` §11.1 dejó la secuencia hasta `072`; esto la reconstruye completa incluyendo `073` y `074`, y verifica que ninguna quedó inconsistente con otra más reciente.

**Estado reconstruido de la documentación** (no verificable contra producción desde este entorno, ver §7): aplicadas `001`–`047`, `052`, `053`. `054` no tiene nota explícita de aplicada ni aparece entre las pendientes — **verificarla antes de asumir nada**.

**Pendientes: `048`, `049`, `050`, `051` y `055`→`075` — 25 migraciones** (`075` la agregó la sesión 2 de este documento; las otras 24 venían de antes). `supabase db push` las aplica en orden numérico; lo que exige atención manual es esto:

| Migración | Riesgo | Acción previa |
|---|---|---|
| `048`–`051` | Ninguno / bajo — aditivas o `CREATE OR REPLACE` idempotentes | Ninguna |
| `055` → `056` | Medio | `056` **depende** de `055` (usa `hold_expires_at`); el orden numérico lo garantiza |
| `057`, `058` | Bajo | Ninguna |
| `059` | Bajo pero **funcionalmente crítica** — sin ella el chat no entrega mensajes | Ninguna |
| `060` | Medio — agrega triggers que rechazan INSERT de posts sin plan | Ninguna |
| `061` + `062` | Medio | **Antes** del deploy del código de marketplace v2. Para `062`, comprobar si la columna ya existe (query en su header) |
| `063`, `064` | Bajo | Ninguna |
| `065` + `066` | ⚠️ **Las más urgentes: cierran `audit.md` P0-1** | **Junto con** el deploy del código de S1 |
| `067` | 🔴 **Alto — muta datos, conversión de una sola vía** | **Respaldo obligatorio** (query en el header): `CREATE TABLE _backup_067_periodicas AS SELECT … FROM classes WHERE type='periodica'` |
| `068` | 🔴 **Alto — cambia el embed `payment:payments(*)` de objeto a ARRAY en todo PostgREST** | **Respaldo obligatorio** (query en el header) + coordinar con el deploy del código de S4 |
| `069` | Medio | **Con o después** del deploy del código de S4, o el botón "Confirmar" del profesor falla con 42501 |
| `070` | Bajo — aditiva | Ninguna |
| `071` | Ninguno — idempotente | Mirar antes Database → Replication: puede ser no-op si Realtime ya se activó a mano |
| `072`, `073` | Bajo — aditivas | Ninguna. `073` no exige orden respecto del código |
| `074` | Bajo — aditiva, **pero no es retroactiva** | Ninguna. Si algún alumno de entrenamiento ya fue facturado de más desde `068`, hay una query de diagnóstico en su header |
| `075` | Bajo — aditiva, no toca datos. **Empieza a rechazar publicaciones** que hoy se aceptan (segunda suelta del mes / periódica de un Básico) | Ninguna respecto del código: la app funciona igual antes y después, sólo que sin ella el tope no se hace cumplir. Nada de lo ya publicado se toca |

**Consistencia entre migraciones pendientes — verificado, sin hallazgos.**

- **La función compartida `enrollments_write_guard` la reescriben cuatro migraciones** (`065` → `066` → `069` → `074`), que es la trampa que costó una vuelta en `audit2.md` S2. Se verificó el estado final del stack local tras replayear las 74 desde cero: la suite `rls-guards.spec.ts` pasa completa, incluido el caso "el profesor confirmando desde el cliente debe fallar" (el fix de P1-8 que `074` estuvo a punto de revertir). **No hay regresión.**
- `generate_monthly_charges` la definen `068` y `074`; el estado final lee `billing_since`, y los tests de `monthly-charges.spec.ts` lo confirman.
- Los CHECK que se reescriben en cadena quedaron completos: `payments.status` termina con los 6 valores (`due|pending|verified|rejected|void|refunded`) y `notifications.type` con los **29** del union de TypeScript — comprobado con `pg_get_constraintdef` contra el stack local y contra `packages/shared/src/types/index.ts:13-42`.
- El replay completo desde cero funciona (es lo que hace `npm run db:reset` y el job `test-integration` de CI en cada PR): ninguna de las 24 pendientes falla al aplicarse en orden sobre una base limpia.

**Secuencia recomendada** (sin cambios respecto de `audit.md` §11.1, más las dos nuevas): respaldo completo → respaldos manuales de `067` y `068` → revisar Replication → `supabase login` y `supabase migration list --linked` → `supabase db push` → verificar → deploy del código → smoke en producción (enviar un mensaje de chat, abrir un ensayo, valorar desde mobile, escanear el QR de un entrenamiento con deuda).

---

## 5. Áreas revisadas sin hallazgos nuevos

Para que quede explícito qué se miró y no produjo nada:

- **Los guards de escritura de `065` y `073` siguen cerrados.** Se corrió la suite completa (`rls-guards.spec.ts`, 4 casos: los ataques de `audit.md` P0-1, los de `audit2.md` P0-1, y las dos mitades de caminos legítimos) contra el stack local con las 74 migraciones: verde. Ningún hallazgo de los dos documentos previos está reabierto.
- **La aritmética de comisión y gross-up de Mercado Pago** (`packages/shared/src/lib/commission.ts`) y su reconstrucción en el webhook: consistentes; no encontré un caso donde el profesor reciba menos que su precio. `create-payment` calcula el monto server-side en las tres ramas (clase individual con descuento, 2x con `twoxClassPrice`, cargo mensual con el monto congelado) y ninguna confía en el cliente.
- **El motor de cargos mensuales** (`monthlyCharges.ts` + `generate_monthly_charges`): el descuento se aplica al emitir (`COALESCE(discount_price_monthly, price)`), un cargo emitido no se reprecia, y los dos índices únicos parciales de `068` preservan la vieja invariante donde valía. El defecto de P0-1 **no está acá**: la matemática es correcta, lo que falla es cómo se llega al estado `pending`.
- **El refresh de tokens OAuth de Mercado Pago** (`lib/mercadopago/token.ts`): sin cambios respecto de lo que ya verificó `audit2.md` §4.
- **Valoraciones:** la elegibilidad (inscripción confirmada **y** clase ya ocurrida) se hace cumplir en la ruta, la tabla sigue cerrada al cliente desde `065`, y la auto-valoración se rechaza. Fijado con tests nuevos (§6).
- **Descuentos espontáneos:** la validación de precio es correcta (entero, ≥ 0, menor al base) y sólo el dueño de la clase puede fijarlo; un descuento inválido no se persiste. Fijado con tests nuevos (§6). El único pero es la paginación de seguidores (**P2-1**).
- **Programa de referidos:** el endurecimiento de `audit.md` S1 se sostiene — no premia auto-referidos, exige una suscripción **pagada** (no una de regalo con prefijo `referral_`), y es idempotente ante la carrera webhook↔`/plans/success`. Fijado con tests nuevos (§6).
- **Los 29 tipos de notificación** están los 29 en el CHECK de la base, los 29 en el union de TypeScript y los 29 renderizados tanto en `NotificationsClient.tsx` (web) como en `notifications.tsx` (mobile). Ninguno cae en un render vacío.
- **Middleware y rutas públicas:** la allow-list es correcta y acotada (detalle de clase/evento, perfil de profesor, `/embed`, feed y explorar); las subrutas exigen sesión. El único problema de `/embed` es la cabecera (**P1-2**), no el middleware.
- **`packages/shared`:** los helpers de fechas (`classSchedule.ts`), disponibilidad, cupo de posts y comisión tienen tests y son fuente única. No encontré lógica duplicada nueva entre web y mobile del tipo que cerró D-5/D-3.
- **Listas y documentación:** revisadas contra el código real. Lo que está desactualizado quedó en **P2-9**; lo que sí refleja la realidad: la tabla de migraciones de `CLAUDE.md` (salvo el estado "pendiente/aplicada", que sólo el usuario puede confirmar), la descripción de los guards de escritura, el modelo de cobro mensual, el de videos atados al plan y el de clases periódicas.
- **Deuda técnica documentada, ya cerrada sin que la doc lo diga:** los avatares huérfanos se limpian (`EditProfileForm.tsx:71-77`), los videos de un post borrado se borran de Cloudinary **y** de Storage (`api/post/delete/route.ts:36-50`), y los comprobantes de pagos `void`/`rejected`/`refunded` se purgan a los 90 días (`cron/cleanup-classes/route.ts:412-441`). Lo que sigue realmente abierto de esa lista es **P2-3** (eventos y paquetes) y los dos gaps del escaneo IA de más abajo.
- **Gaps del escaneo IA que siguen exactamente donde estaban:** no hay canal para que el **alumno** pida revisión humana de un `ai_verdict='issue'` (sólo el profesor ve `scan_result`), y no hay log granular de quién visualizó qué comprobante vía `/api/payment/receipt-url`. Verificado por `grep`: no existe ninguna implementación. Siguen siendo diferibles mientras `auto_confirm_enabled` esté en `false`, que es el default — el Art. 8° bis de la Ley 21.719 entra en vigencia el **1 de diciembre de 2026**.

---

## 6. Cobertura de tests — hueco cerrado en esta sesión

`audit.md` S7 dejó suites para Chat, Paquetes, Eventos y Ensayos. **Cuatro features que mueven reputación, dinero y acceso no tenían ninguna cobertura**: lista de espera, valoraciones, descuentos y referidos. Es un hueco real y accionable, así que se cerró acá en vez de sólo anotarlo.

**`tests/integration/audit3-coverage.spec.ts`** (nuevo, 5 casos verdes):

1. **Lista de espera** — al liberarse el cupo, el primero de la fila recibe `waitlist_available`; mientras la clase está llena, otro alumno recibe `409 no_spots`.
2. **Valoraciones** — sin inscripción → 403; con inscripción confirmada pero clase futura → 403; con clase ya ocurrida → 200 con el promedio; auto-valoración → 400.
3. **Valoraciones (RLS)** — el cliente no puede escribir `ratings` directo: la policy que `065` eliminó sigue eliminada.
4. **Descuentos** — sólo el dueño; precio negativo, decimal o ≥ al original se rechaza **y no se persiste**; el válido sí.
5. **Referidos** — un auto-referido no reclama el premio; una suscripción de regalo (`referral_…`) tampoco lo habilita; con una pagada se premian +30 días **una sola vez** (segunda llamada no-op).

Además, tres `test.fixme` documentan el comportamiento **correcto** esperado de P0-1, P0-2 y P1-1, con la reproducción exacta en el cuerpo: la sesión que cierre cada hallazgo sólo tiene que quitarle el `.fixme` y verificar que pase. No fallan CI (aparecen como saltados), siguiendo la disciplina de la serie: **primero el ataque, después el fix** — y el ataque como test se escribe en la sesión que arregla, no en la que audita.

**Verificación:** `npm run test:integration` → **30 verdes + 4 saltados** (25 previos + 5 nuevos; los 4 saltados son los 3 `fixme` de hallazgos abiertos más el de la lista de espera). Typecheck web y mobile en cero. Los 242 unit tests sin cambios.

**Actualización — S1 (2026-07-30).** Los dos `test.fixme` de P0-1 y P0-2 se convirtieron en **5 casos reales** (los ataques, más el camino legítimo de cada uno: comprobante que sí existe → 200, y match 2x válido → dos inscripciones con el turno de pago en el solicitante). Quedan 2 saltados: el `fixme` de P1-1 (plan Básico) y el de la lista de espera (P1-4). Suite completa: **35 verdes + 2 saltados**.

**Actualización — S2 (2026-07-30).** El `fixme` de P1-1 se convirtió en **4 casos** (el ataque del Básico; el UPDATE que convertía una suelta en periódica y el que reasignaba la clase; el Pro sin tope, que es la mitad legítima; y "sin plan no se publica", que fija lo que ya hacía la policy de `017`), más **1 caso** para P1-3 que mide las tres consecuencias juntas (suscripción en `grace` cancelada, `push_tokens` vacío, refresh token revocado). También hay 8 unitarios nuevos en `tests/unit/classQuota.test.ts`. Suite completa: **40 verdes + 1 saltado** (el `fixme` de P1-4, lista de espera), **250** unitarios.

**Actualización — S3 (2026-07-30).** El último `fixme` (P1-4, lista de espera) se convirtió en un caso real que ancla dos personas en la fila, libera el cupo dos veces y exige que el segundo aviso sea para la SEGUNDA persona, no otra vez la primera. Se agregaron además: un caso para P1-2 (widget embebible) que verifica por HTTP que `/embed/*` no manda `X-Frame-Options` y que el resto del sitio lo sigue mandando; un caso para P1-5 (cancelar suscripción) que pega con Bearer token y confirma `200` + `status='cancelled'`; y dos casos nuevos dentro del test de Valoraciones ya existente para P2-6 (un decimal fuera de paso de 0.5 se rechaza, uno en paso válido se acepta). **7 unitarios nuevos** en `tests/unit/notificationRoutes.test.ts` para P1-6 (el mapa de rutas de notificación, incluido un guard de completitud contra los 29 `NotificationType`). Suite de integración completa: **43 verdes + 0 saltados** (ya no queda ningún `fixme`). Unitarios: **257**. P2-3 (purga de comprobantes de eventos/paquetes) se corrigió **sin** test nuevo — ver su fila en §3 para el porqué.

---

## 7. Lo que no pude verificar

- **Mobile en un dispositivo o simulador real.** Sigue sin haber ninguno en este entorno: `adb devices` no lista nada, no hay `ANDROID_HOME` ni SDK instalado, y no hay macOS para iOS. **Este es el único punto de todo el documento que requiere de verdad al usuario con su propio dispositivo**, y arrastra la deuda de S2, S3, S4, S5, S7 y de las dos sesiones de `audit2.md`: el fix del crash de detalle de evento (`Avatar size`), los 10 puntos de `getActiveTier`, la subida de comprobante de evento y de paquete, la lista de chats, el detalle de ensayo y el `AuditionModal` nunca se abrieron en pantalla. Los hallazgos de mobile de este documento (P1-1, P1-5, P1-6 — los tres cerrados en código, S2/S3) están verificados por lectura de código y por la capa de datos, no abriendo la app: el botón "Cancelar plan", el banner ámbar de suscripción cancelada, y la navegación al tocar un push nunca se vieron en pantalla.
- **Mercado Pago real.** El split, la firma del webhook, el `marketplace_fee`, el gross-up y el refresh de tokens siguen sin correr nunca contra MP (G-2 de `audit.md`). La mitad de **P0-1** que pasa por `create-payment` no se pudo reproducir por eso: `preference.create` exige la cuenta MP conectada del profesor. La mitad por transferencia sí se reprodujo entera.
- **Estado real de producción.** No hay sesión del CLI de Supabase ni proyecto de Vercel linkeado en este entorno (misma limitación que registró S8). Todo lo de este documento se verificó contra el stack local de Docker. El estado de las 24 migraciones pendientes y el de las env vars es reconstrucción documental, no lectura.
- **Comportamiento de App Store / Google Play.** D-1 de `audit.md` (iOS + IAP para los planes) sigue siendo una lectura de las guías, no una predicción de lo que hará un revisor.

---

## 8. Recomendación de secuencia

Cuatro sesiones, ordenadas para que lo que toca dinero y acceso vaya primero:

1. ✅ **HECHO (S1, 2026-07-30).** **`opus high` — P0-1 + P0-2.** Los dos son el mismo tipo de trabajo: una ruta de servidor que escribe en nombre del cliente sin repetir las validaciones que su hermana sí hace. Construir primero los dos ataques como test (quitando el `.fixme` de `audit3-coverage.spec.ts`), confirmar que pasan hoy, arreglar, confirmar que fallan. Ojo con el alcance real de P0-1: son **tres** puntos de escritura (`submit-transfer`, `packages/[id]/submit-payment`, y la rama de `create-payment` que marca el cargo como `pending`) y hay que decidir el estado intermedio del cargo mensual antes de tocar nada, o se rompe la pantalla de pago.
2. ✅ **HECHO (S2, 2026-07-30).** **`opus high` — P1-1 + P1-3.** El tope del plan Básico exige un trigger en la base (patrón de `060`) más el gate que falta en mobile, y hay que decidir qué pasa con los profesores que hoy tienen más clases de las que su plan permite (igual que `067` decidió no truncar las periódicas heredadas). El borrado de cuenta toca Mercado Pago y la invalidación de sesiones: es irreversible por definición y conviene razonarlo entero. **Arrastró P2-8**, que era la mitad de datos de P1-3.
3. ✅ **HECHO (S3, 2026-07-30).** **`sonnet high` — P1-2, P1-4, P1-5, P1-6 y los P2 mecánicos** (P2-1, P2-2, P2-3, P2-6). Son cambios locales y verificables por separado: una cabecera por prefijo, un `DELETE` en la inscripción, `requireUser` + un botón, el payload del push y su correlación de tickets, y tres paginaciones del mismo patrón que ya se resolvió dos veces en este repo. **P1-5 fue media hora**, como se anticipaba: la ruta de cancelar suscripción ya estaba reducida a una llamada a `cancelBillableSubscriptions` desde S2, sólo faltaba cambiarle `createClient()` por `requireUser` y poner el botón en mobile.
4. **Del usuario, en paralelo y sin depender de lo anterior:** aplicar las 24 migraciones (§4), verificar las env vars (§9.2), QA con sandbox de Mercado Pago, revisión legal, backups, y la decisión de iOS.

---

## 9. Checklist go/no-go — todo lo que falta antes de invitar usuarios reales

Consolida lo pendiente de `audit.md` §11, de `audit2.md` §7 y lo nuevo de esta sesión, separado por **quién** puede hacerlo. Nada de esto está hecho al cerrar esta sesión.

### 9.1 · Trabajo de código (ejecutable en una próxima sesión)

| # | Qué | Origen | Bloquea el lanzamiento |
|---|---|---|---|
| ~~C-1~~ ✅ | **P0-1** — verificar que el comprobante exista; que crear una preferencia de MP no marque el cargo como pagado; barrer `payment_submitted` | audit3 | ✅ **Hecho en S1** (sin migración; falta desplegar) |
| ~~C-2~~ ✅ | **P0-2** — `/api/class-2x/match` con las validaciones de `enroll`, y `.eq('status','looking')` en el UPDATE | audit3 | ✅ **Hecho en S1** (sin migración; falta desplegar) |
| ~~C-3~~ ✅ | **P1-3** — borrado de cuenta: cancelar en MP, incluir `'grace'`, borrar push tokens, invalidar sesión | audit3 | ✅ **Hecho en S2** (sin migración; falta desplegar) |
| ~~C-4~~ ✅ | **P1-1** — hacer cumplir el plan Básico (trigger en la base + gate en mobile) | audit3 | ✅ **Hecho en S2** — migración **`075`**, que se suma a U-1 |
| ~~C-5~~ ✅ | **P1-2** — cabecera propia para `/embed/*` | audit3 | ✅ **Hecho en S3** (sin migración; falta desplegar) |
| ~~C-6~~ ✅ | **P1-4** — limpiar `waitlist` al inscribirse y avisar al siguiente | audit3 | ✅ **Hecho en S3** (sin migración; falta desplegar) |
| ~~C-7~~ ✅ | **P1-5** — `requireUser` en `subscriptions/cancel` + botón en mobile | audit3 | ✅ **Hecho en S3** (sin migración; falta desplegar + build EAS para que mobile vea el botón nuevo) |
| ~~C-8~~ ✅ | **P1-6** — navegación al tocar un push + correlación real de tickets | audit3 | ✅ **Hecho en S3** (sin migración; falta desplegar + build EAS) |
| C-9 | **P2-4, P2-5, P2-7, P2-10** — rate limits, doble comprobante 2x, extensión por contenido en los buckets públicos, CSP nonce-based. (P2-1, P2-2, P2-3 y P2-6 de esta fila **ya se cerraron en S3** — ver su fila en §3) | audit3 | ⚪ No |
| C-10 | **P2-12** — mover el comprobante de entrada a un evento a una ruta de servidor (`/api/event/submit-payment`) para poder verificar que exista, igual que P0-1 en clases y paquetes | audit3 S1 | ⚪ No (consecuencia acotada: no hay QR ni deuda mensual) |

### 9.2 · Sólo el usuario (credenciales, dinero, decisiones, dispositivos)

| # | Qué | Origen | Estado |
|---|---|---|---|
| U-1 | **Aplicar las 25 migraciones pendientes** en el orden y con los respaldos de §4 (`067` y `068` exigen respaldo manual **antes**) | audit.md G-1 | ⛔ Bloqueante |
| U-2 | **Desplegar el código** de S1–S7 + `audit2` (nada está en producción todavía) y correr el smoke de §4 | audit.md S8 | ⛔ Bloqueante |
| U-3 | **QA con sandbox de Mercado Pago**: tokens, firma del webhook, split, gross-up, reembolso/contracargo. Nunca se ha ejecutado contra MP real | audit.md G-2 | ⛔ Bloqueante |
| U-4 | **Revisión legal chilena** de `/terms` §6-7 y `/privacy` §5 — es borrador escrito por un modelo, con encuadre tributario del split y de responsabilidad por fraude | audit.md G-3 | ⛔ Bloqueante |
| U-5 | **Backups de base de datos** — Supabase free no los tiene automáticos. Único hueco de seguridad de datos abierto desde 2026-05-27 | audit.md G-5 | ⛔ Bloqueante con dinero real |
| U-6 | **Env vars en Vercel** — ver la tabla de abajo | audit.md G-4 | ⚠️ Verificar |
| U-7 | **Verificación visual en un dispositivo real** de todo lo que S2–S7 y `audit2` dejaron sin abrir (ver §7) | S2…audit2 | 🟠 Recomendable |
| ~~U-8~~ ✅ | **Decisión iOS + IAP** (D-1): los planes desbloquean funcionalidad digital, lo que la guía 3.1.1 de Apple obliga a cobrar por IAP | audit.md D-1 | ✅ **Resuelta en S4 (2026-08-02)**: la app móvil **deja de vender suscripciones** en vez de integrar IAP. Ver §10-S4. El marketplace de pagos de clases **no se toca** — una clase presencial es un servicio consumido fuera de la app (guía 3.1.5(a)), el caso Uber/Airbnb |
| U-9 | **`APP_URL`/Site URL de Supabase apuntando a `www.danzclass.com`** (el dominio ya sirve la app, verificado en G-6; falta confirmar estas dos variables) | audit.md G-6 | ⚠️ Verificar |
| U-10 | **Confirmar dos decisiones de producto de S4**: la gracia de 3 días antes de bloquear el QR, y un checkout por mes en Mercado Pago | audit.md S4 | 🟡 Confirmar |
| U-11 | **Decidir qué pasa con el excedente del tramo de comisión de MP** (D-2): devolverlo, declararlo o mantenerlo registrado como está | audit.md D-2 | 🟡 Decisión de negocio |

**Env vars — qué se rompe, en silencio, si falta cada una** (reconstruido del código; no verificable contra Vercel desde este entorno):

| Variable | Si falta | Ruido |
|---|---|---|
| `QR_TOKEN_SECRET` | **No se emite ni valida ningún QR de asistencia.** Nadie entra a clase por escaneo | Ninguno hasta que un profesor intenta escanear. **No rotarla nunca en producción**: invalida todos los QR ya emitidos |
| `CRON_SECRET` | Los crons responden 503 y **no corre nada**: ni cargos mensuales, ni recordatorios, ni archivado, ni purga de comprobantes, ni refresh de tokens MP | 503 en el log de Vercel |
| `SUPERADMIN_USER_ID` | El panel de administración responde 503 y las denuncias no llegan a nadie | 503 |
| `ANTHROPIC_API_KEY` | El escaneo IA cae a `scan_status='failed'` y todo va a revisión manual | Silencioso (es el fallback previsto) |
| `MERCADOPAGO_WEBHOOK_SECRET` | **Todo webhook se rechaza**: ninguna suscripción se activa y ningún pago in-app se confirma | Sólo en el log |
| `MERCADOPAGO_CLIENT_ID` / `_SECRET` | Ningún profesor puede conectar su cuenta (OAuth) → ningún pago in-app | Error visible al conectar |
| `CLOUDINARY_API_KEY` / `_SECRET` | **No documentadas en `CLAUDE.md`.** Borrar un video no borra el asset en Cloudinary: la purga de videos vencidos deja todo huérfano y siguen contando en la cuota | `warn` en el log |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | **Ninguna ruta está limitada** (fail-open por diseño) | Desde S6, un `logger.error` una vez por proceso en producción |
| `EXPO_ACCESS_TOKEN` | Opcional; sin ella Expo puede aplicar rate limit a los push | Silencioso |
| `HEALTHCHECK_*_UUID` (5) | No hay alerta si un cron deja de correr | Silencioso — que es justamente el problema |
| `EXPO_PUBLIC_WEB_URL` | Mobile cae al dominio de Vercel hardcodeado. No bloquea. **Se inlinea en build time**: cambiarla exige un build nuevo de EAS, no un OTA | Silencioso |

---

## 10. Registro de sesiones

### S1 — 2026-07-30 · P0-1 + P0-2 (los dos bloqueadores)

**Alcance:** los dos P0. Sin migraciones: los dos hallazgos son de rutas de servidor, y la capa de datos ya estaba donde tenía que estar. **Producción no se tocó.**

**Método, igual que en las dos auditorías previas: primero el ataque.** Los dos `test.fixme` se escribieron como tests reales **antes** de tocar código y se corrió la suite para verlos fallar — los 4 casos fallaron con la salida esperada (`200` donde debía haber `400`/`403`/`404`). Recién ahí se arregló. Cada hallazgo quedó además con su **mitad legítima** probada: un comprobante que sí existe se registra, y un match 2x válido crea las dos inscripciones con el turno de pago en el solicitante. Sin esa mitad, un fix que rompiera el camino bueno pasaría el test igual.

#### P0-1 — las tres puntas, y dónde el fix no siguió la recomendación al pie de la letra

1. **Existencia del comprobante.** `receiptObjectExists(admin, path)` en `lib/receipts.ts` (junto a `receiptStoragePath`/`deleteReceiptObject`, que ya normalizaban el path legacy), llamado por `/api/payment/submit-transfer` y por `/api/packages/[id]/submit-payment`. Se resolvió con `list(dir, { search: name })` comparando el nombre **exacto** —`search` es coincidencia parcial— y no con `createSignedUrl`, que devuelve un error genérico donde no se distingue "no existe" de "no se pudo firmar" y que además emitiría una URL válida por cada intento. Ante cualquier error de Storage devuelve `false`: en la duda, el pago no se registra. **La consistencia no es un problema**: `list` lee la tabla `storage.objects` de Postgres, que la subida escribe de forma síncrona.
2. **Crear una preferencia de MP ya no marca el cargo como pagado.** La recomendación proponía "un estado propio tipo `awaiting_gateway`"; se usó **`'due'`**, que ya existe, ya está en la lista `UNPAID` de `summarizeCharges` y **ya se usa para exactamente esto** — `confirm_offline` inserta un pago único en `'due'` cuando el alumno nunca registró nada. Un estado nuevo habría exigido migración del CHECK y tocar todos los consumidores, para no ganar nada. **Efecto colateral bueno, que no estaba en el hallazgo:** con `'pending'`, el cargo dejaba de ser seleccionable en la pantalla de pago, así que el alumno que abría el checkout de MP y lo abandonaba **no podía reintentar por transferencia**; ahora sí. El webhook no necesitó cambios: no filtra por estado, y en un pago no aprobado sólo persiste `mp_status`.
3. **`payment_submitted` sin barrer: aviso, no cancelación.** El hallazgo ofrecía las dos opciones. Se eligió avisar: cancelar la inscripción castigaría al alumno que **sí** hizo su parte por la demora del profesor. El cron `cleanup-classes` manda un `payment_reminder` con `role: 'teacher'` por cada comprobante que lleva 3+ días en revisión, con tope de una vez por semana por comprobante y link directo a `/payment/review/<paymentId>`. Se reusó el tipo existente en vez de agregar el 30º (mismo patrón `data.role` que ya usa `payment_refunded`): un tipo nuevo son migración + union + dos renderers + push label, y el texto ya se ramifica por `data` desde que el tipo tiene dos usos.

**Tres cosas que aparecieron al arreglar y no estaban en el hallazgo:**

- **`submitted_at` no se refrescaba al reenviar** un comprobante tras un rechazo, así que la antigüedad seguía siendo la del intento anterior. Importa para la purga a 90 días y ahora también para el aviso de comprobantes sin revisar.
- **`create-payment` sólo borraba el comprobante huérfano del pago único**, no el de un cargo mensual: un alumno que subía transferencia por marzo y después elegía MP dejaba el archivo (con nombre, RUT y número de cuenta) en el bucket para siempre. `MonthlyCharge` ya traía `receipt_url`, así que fue una línea.
- **La pantalla de pago web fallaba en silencio** ante cualquier error de la ruta (`console.error` y nada más; mobile ya avisaba con `Alert`). Anotado como **P2-11** y corregido acá mismo: una validación que el usuario no puede ver es media validación.
- **La misma puerta sigue abierta en las entradas de evento** (**P2-12**, nuevo, **abierto**): ahí el `INSERT` en `event_payments` sale directo del cliente, así que no hay dónde poner la comprobación sin crear antes un `/api/event/submit-payment`. Se dejó anotado en vez de expandir la sesión: no hay QR ni deuda mensual de por medio.

#### P0-2 — un helper, y el compare-and-set que la documentación ya creía que existía

`lib/enrollGuards.ts` con `ENROLLABLE_CLASS_FIELDS`, `loadEnrollableClass` (que incluye el `status='active'`) y `assertCanEnroll(admin, cls, userId)`, que devuelve `{error, status}` con **los mismos códigos** que ya devolvía `enroll` — el cliente no aprende un vocabulario nuevo por ruta. `enroll` dejó de tener las validaciones escritas a mano (−45 líneas) y `match` las aplica **a los dos alumnos**: si el compañero no puede entrar, no hay 2x que armar.

Tres cosas más en la misma ruta, dos de ellas fuera del texto del hallazgo:

- **Precio 2x obligatorio** (`twoxClassPrice`): sin él, ni `create-payment` ni `submit-transfer` pueden cobrar (los dos responden `twox_price_missing`), así que emparejar dejaba a los dos con un cupo impagable — exactamente lo que evita el guard `no_payment_method`.
- **Cupo para dos, verificado antes de insertar.** El trigger de capacidad (`056`) igual lo impedía, pero recién en la segunda fila: la ruta borraba la primera y devolvía un 500 genérico donde correspondía un `no_spots`.
- **El `.eq('status','looking')` se movió a un compare-and-set previo.** No basta con agregarlo al UPDATE donde estaba (después de crear las inscripciones): así el UPDATE es el **único** punto que serializa la carrera, y el segundo matcher recibe el 404 que `CLAUDE.md` ya prometía. Si las inscripciones fallan, la solicitud se libera de vuelta a `looking` — dejarla `matched` sin inscripciones la mataría para siempre, porque ninguna pantalla la ofrece y ninguna ruta la vuelve a mirar.

**Lo que NO se hizo, a propósito:** las dos inscripciones de un 2x siguen naciendo con `hold_expires_at: null` aunque la clase exija pago por adelantado. El pagador por defecto es el **solicitante**, que no es quien está online al momento del match: un lock de 10 minutos anclado en alguien ausente mataría el 2x en toda clase con `allow_late_payment=false`. La ventana de reserva de un 2x es el barrido de 7 días que ya existe en el cron; queda dicho acá para que no se lea como un olvido.

**Verificación.** typecheck web y mobile en cero → **242** unit tests → integración **35 verdes + 2 saltados** (los 2 `fixme` que quedan abiertos: P1-1 y P1-4), con `dev:web` arriba y las 74 migraciones del stack local. El smoke E2E **no se corrió** en esta sesión.

**Pendiente de esta sesión:** nada de código en los dos P0. Los cambios son **sólo de aplicación** (ninguna migración nueva), así que entran con el deploy de U-2 del checklist §9.2 y no exigen ningún orden respecto de las 24 migraciones pendientes.

---

### S2 — 2026-07-30 · P1-1 + P1-3 (el plan que no se cobraba y la cuenta que no se borraba)

**Alcance:** los dos P1 de la sesión 2 de §8, más **P2-8**, que era la mitad de datos de P1-3 y se arreglaba sola al tocarlo. Una migración nueva: **`075_class_plan_quota.sql`**. **Producción no se tocó.**

**Primero el ataque, otra vez.** El `test.fixme` de P1-1 y un caso nuevo para P1-3 se escribieron como tests reales antes de tocar código, y se corrió la suite para verlos fallar: la segunda suelta del mes de un plan Básico entró sin una queja, y tras borrar la cuenta la suscripción en `grace` seguía viva. Recién ahí se arregló. Los dos hallazgos quedaron con su **mitad legítima** probada: el Pro publica sin tope y de cualquier tipo, y "sin plan no se publica" (que ya funcionaba por la policy de `017`) queda fijado como regresión.

#### P1-1 — el tope tiene que vivir en la base, y el UPDATE era una puerta que el hallazgo no nombraba

El precedente que el hallazgo recomendaba es el correcto y es el que se siguió: `060` hace cumplir el cupo de videos con triggers **porque los posts se insertan desde el cliente**, y `classes` es exactamente el mismo caso. `class_quota_for_tier()` (none 0 · basic 1 · teacher/pro ∞), `monthly_suelta_count()` y el trigger `classes_write_guard`.

Cuatro cosas que se decidieron en el camino:

- **El trigger es BEFORE INSERT *OR UPDATE*.** Con sólo INSERT el gate duraba una request: `classes_update_teacher` (001) es `FOR UPDATE ... USING` **sin `WITH CHECK`** —el defecto que `065` y `073` cerraron en otras 11 tablas, con `classes` fuera de las dos pasadas—, así que publicar una suelta (permitida) y convertirla en periódica por PostgREST saltaba todo. La misma rama congela `teacher_id`: reasignar una clase se lleva sus inscripciones, sus pagos y su historial a otra cuenta. Las dos cosas están cubiertas por test.
- **El cupo cuenta lo CREADO en el mes, en cualquier estado, incluidas las canceladas.** Si cancelar liberara el cupo, el tope no existiría (publicar → cancelar → publicar, sin fin). Es además lo que ya contaba el formulario web, así que UI y base dicen lo mismo — un desfase acá sería peor que no tener tope, porque el profesor vería un candado que la base no respalda o al revés.
- **Nada de lo ya publicado se toca**, que es la pregunta que §8 dejaba abierta. Un Básico con 8 sueltas y 2 periódicas heredadas las conserva enteras y las sigue editando (el tipo es de sólo lectura en los dos formularios de editar, así que `NEW.type = OLD.type` y el guard no interviene). El tope rige desde la próxima publicación. Misma decisión que `067` tomó con las periódicas heredadas, y por la misma razón: hay alumnos inscritos y pagados del otro lado.
- **El mes se calcula en UTC** en los tres lugares (trigger, page web, formulario mobile). Chile está detrás de UTC, así que el mes nuevo abre unas horas antes para el profesor: permisivo, nunca restrictivo, y sin desfase entre lo que muestra la app y lo que hace cumplir la base.

**⚠️ La trampa que costó una vuelta, y que vale para todo guard futuro: un guard que pregunta "¿quién llama?" NO puede ser `SECURITY DEFINER`.** La primera versión del trigger lo era, y dentro de una función `SECURITY DEFINER` **`current_user` es el dueño de la función** (`postgres`): la exención de service role se cumplía para todo el mundo y el guard no bloqueaba nada. No hay error, no hay warning — la migración aplica limpia y el ataque sigue pasando. Lo destapó el test, que seguía en rojo después del "fix". Los seis guards de `065` son SECURITY INVOKER por esto mismo (su comentario lo dice); la pregunta de **datos** ("¿cuántas sueltas lleva este mes?") sí va en un helper `SECURITY DEFINER` aparte, para que la respuesta no dependa de lo que el llamador alcance a leer bajo RLS. Quedó anotado en `CLAUDE.md` junto a la regla de `search_path`.

**Y el gate que faltaba en mobile**, que era la mitad visible del hallazgo: la pantalla de publicar ofrecía "Periódica" y "Entrenamiento" a cualquiera con `canTeach` y ahora muestra una sola tarjeta bloqueada que lleva a `/plans`; el formulario cuenta las sueltas del mes, bloquea el envío con el mismo aviso que la web y traduce el rechazo de la base. Helper compartido `classQuota.ts` con `classQuotaErrorMessage`: sin traducir el mensaje de Postgres, el profesor Básico veía "Error al crear la clase" sin enterarse de que el problema era su plan.

#### P1-3 — los cuatro puntos, y por qué `signOut()` no cerraba nada

1. **La sesión.** `supabaseForSignOut.auth.signOut()` no hacía nada en el camino de mobile: ese cliente se construye con el Bearer en un header y **no tiene ninguna sesión guardada que cerrar**, así que la llamada retorna sin tocar el servidor. Lo que corta es `admin.auth.admin.signOut(accessToken, 'global')`, que revoca todos los refresh tokens del usuario. Verificado aparte con un control: el mismo refresh token renueva la sesión antes de la llamada y devuelve `Invalid Refresh Token: Refresh Token Not Found` después. **Límite que conviene tener escrito:** el access token ya emitido sigue valiendo hasta que expire (es un JWT y PostgREST sólo mira firma y `exp`); revocar el refresh es lo que mata la sesión, no el token en vuelo.
2. **El cobro.** Se extrajo `cancelBillableSubscriptions()` a `lib/subscriptionCancel.ts`, compartido con `/api/subscriptions/cancel` — que quedó en seis líneas — para que "qué está cobrando" tenga **una sola definición**. Recorre **todas** las suscripciones cobrables, no sólo la más reciente como hacía la ruta de cancelar: dejar una viva es justo el problema que esto cierra. Si la preaprobación de MP no se pudo cancelar, la ruta de borrado lo registra con `logger.error` (no `warn`): ahí sigue corriendo un cobro real sobre una cuenta que ya no existe, y eso hay que verlo en Sentry.
3. **`('active','grace')`, no `('active','trialing')`** (P2-8). `'trialing'` no está en el CHECK de la tabla: el filtro era un no-op y omitía el único estado que además conserva el tier.
4. **Los push tokens** se borran, así que el teléfono deja de recibir notificaciones de una cuenta eliminada.

**Lo que NO se hizo, a propósito:** no se agregó `deletePushToken` al logout de mobile (la función sigue sin llamadores) ni la navegación al tocar un push — son **P1-6**, de la sesión 3, y mezclarlos habría dejado los dos a medias. El borrado de cuenta ya no depende de eso: borra las filas del servidor.

**Verificación.** typecheck web y mobile en cero → **250** unit tests (242 + 8 de `classQuota`) → integración **40 verdes + 1 saltado** (queda el `fixme` de P1-4, lista de espera), con `dev:web` arriba y las **75** migraciones del stack local. La suite completa incluye `rls-guards.spec.ts`: ningún hallazgo de `audit.md` ni de `audit2.md` quedó reabierto por el trigger nuevo. El smoke E2E **no se corrió**.

**Pendiente de esta sesión:** la migración `075` se suma a las pendientes de §4 (ahora **25**). No exige ningún orden respecto del deploy del código: sin ella la app funciona igual, sólo que el tope no se hace cumplir. El cambio de `/api/account/delete` es sólo de aplicación.

---

### S3 — 2026-07-30 · P1-2 + P1-4 + P1-5 + P1-6 + los P2 mecánicos (P2-1, P2-2, P2-3, P2-6)

**Alcance:** la sesión 3 completa de §8 — los cuatro P1 que quedaban abiertos y los cuatro P2 mecánicos (paginaciones + validación de pasos). Sin migraciones: los ocho hallazgos son de aplicación (headers, rutas de servidor, un componente mobile, un helper compartido). **Producción no se tocó.**

**Primero el ataque, donde había algo que atacar.** P1-4 ya tenía su `test.fixme` desde S1 (dos personas en la fila, dos liberaciones, exigir que el segundo aviso sea para la segunda) — se corrió antes de tocar código y falló como se esperaba (el segundo aviso llegaba otra vez a la primera). Los otros siete hallazgos no tenían nada que "atacar" en el sentido de las RLS/rutas de escritura de las sesiones anteriores — son ausencia de comportamiento (una cabecera que falta, un botón que no existe, un listener vacío, tres queries sin paginar) — así que se verificó el defecto por lectura + reproducción puntual (HTTP real para P1-2/P1-5; lectura de tipos reales del SDK de Expo para P1-6) y se cerró con su test correspondiente.

#### P1-2 — dos bloques de `headers()`, no uno con excepciones

La cabecera se aplicaba con `source: '/(.*)'`, que también matchea `/embed/*`. Next.js no tiene forma de "quitar" un header ya puesto por un bloque más general — sólo de sobreescribirlo con otro valor, y `X-Frame-Options` no tiene un valor permisivo real (a diferencia de `frame-ancestors` de CSP). La solución fue partir el matcher: `/((?!embed/).*)` para el resto del sitio (con `X-Frame-Options: DENY` intacto) y `/embed/:path*` aparte, sin esa cabecera y con su propia CSP (`frame-ancestors *` en vez de `'none'`). El resto de las directivas de CSP (`script-src`, `img-src`, etc.) se factorizaron a `cspBase` para no duplicarlas entre los dos bloques — si algún día cambia una política de Cloudinary/Supabase, hay un solo lugar que tocar. Verificado por HTTP real contra `dev:web`: `/embed/teacher/<username>` sin `X-Frame-Options`, `/feed` con `DENY` intacto.

#### P1-4 — un helper, no un parche en cada punto que libera cupo

`lib/waitlist.ts` (`notifyWaitlist(admin, classId)`) hace tres cosas en un solo lugar: lee la fila ordenada por `created_at`, **borra** (sin avisar) a cualquiera que ya tenga una inscripción activa —defensivo, para filas viejas que sobrevivieron a una inscripción anterior a este fix—, y avisa al primero que quede. El borrado "normal" pasa por `/api/class/enroll`, que ahora limpia la fila propia del alumno al inscribirse (el punto que el hallazgo señalaba como ausente). Se llama desde `/api/class/leave` (que antes tenía la lógica escrita a mano, ahora es una línea) y desde los **tres** puntos del cron que liberan cupo: holds vencidos (`hold_expires_at`), reservas impagas de 72h, y el timeout de 7 días del 2x — ninguno de los tres avisaba antes. Una asimetría deliberada: si dos cupos se liberan de la MISMA clase en la misma corrida del cron, el primero de la fila puede recibir el aviso dos veces (nada lo saca de la fila hasta que se inscribe) — caso raro, y preferible a la complejidad de trackear "ya avisado en esta corrida" para un caso que en la práctica casi no ocurre.

#### P1-5 — la ruta ya estaba lista, faltaba la autenticación y el botón

`cancelBillableSubscriptions` (extraído en S2) ya hacía todo el trabajo pesado; `/api/subscriptions/cancel` sólo necesitaba `requireUser` en vez de `createClient()`. El trabajo real fue la pantalla de mobile: `PlansScreen` ganó `getActiveSubscription`/`getCancelledPendingExpiry` (mismos helpers que ya usa la web, `packages/shared`), un botón "Cancelar plan" con el mismo `Alert.alert` de confirmación con fecha, y el banner ámbar "tu suscripción fue cancelada, tienes acceso hasta X" que la web ya mostraba y mobile no. De paso se agregaron los `dark:` que le faltaban al banner verde "Plan activo" (regla de CLAUDE.md sobre colores estáticos sin variante oscura) — tocaba ese bloque de todas formas.

**Lo que no se investigó, a propósito:** cancelar deja `status='cancelled'` de inmediato (no espera a `expires_at`), así que `getActiveTier` deja de ver el plan en el momento del clic, aunque el texto diga "sigue activo hasta X". Es comportamiento **preexistente** de la web (mismo `cancelBillableSubscriptions`, mismo `CancelSubscriptionButton`) — mobile ahora lo replica exactamente, no lo inventa. Si es un defecto, es uno que ya vive en la web desde antes de esta sesión y queda fuera de alcance de P1-5.

#### P1-6 — una fuente de rutas, no una lista nueva de "a dónde ir"

`apps/mobile/lib/notificationRoutes.ts` (`NOTIFICATION_ROUTES` + `resolveNotificationRoute`) es el mapa que `notifications.tsx` ya tenía escrito (su función `route()` por tipo), movido a un archivo compartido y reutilizado por el listener de push en `_layout.tsx`. `notifications.tsx` perdió su copia — ahora llama al mismo resolver, con un atajo: si el perfil de `from_user_id` ya está en el `profileMap` que la pantalla cargó para pintar el label, lo usa directo en vez de pedirle a `resolveNotificationRoute` que vuelva a consultarlo. El listener de push, en cambio, no tiene ese caché — siempre resuelve `follow`/`friend_request`/`friend_accepted` con una consulta a `profiles` en el momento del tap, que es aceptable porque sólo ocurre cuando el usuario efectivamente toca la notificación. La corrección de `sendPushToUsers` fue puramente de lectura: el tipo real del SDK (`ExpoPushErrorReceipt`, sin campo `to`) confirma que la comparación vieja era siempre `undefined`; el fix correlaciona por posición dentro del chunk, que es la garantía que el propio SDK documenta. `deletePushToken` se conectó al único lugar donde tenía sentido sin tocar otro hallazgo: el logout de mobile (`(tabs)/profile.tsx`), reusando `registerForPushNotifications()` para obtener el token actual sin volver a pedir permiso.

#### Los cuatro P2 mecánicos

Los tres de paginación (`class/discount` para seguidores, `sendPushToUsers` para `push_tokens`, y la purga de 90 días) siguen al pie de la letra el patrón que `audit.md` P2-5 y `audit2.md` P2-1 ya usaron dos veces en este repo: loop de `.range()` en tandas (500 para queries de una tabla, 200 para el `.in()` de `sendPushToUsers`, más conservador porque ahí el riesgo es también el largo de la URL, no sólo el corte de PostgREST). La purga de comprobantes se extendió a `event_payments` y `package_enrollments`, que hasta ahora no los tocaba nadie:

- **`event_payments`** purga por `status='void'` (el único estado terminal del CHECK de `038` — no existe `'rejected'`) y `created_at` (la tabla no tiene `updated_at`, y cada reenvío inserta una fila nueva en vez de actualizar la vieja, así que `created_at` sí mide "hace cuánto quedó obsoleta esta fila en particular"). Con fallback al bucket legacy `event-media` para comprobantes viejos (S7 los movió a `payment-receipts`, pero los ya subidos siguen donde estaban) — se distinguen por si la URL guardada contiene el marcador `/event-media/`.
- **`package_enrollments`** no tiene un estado "rechazado" distinguible de "nunca se envió nada" (los dos son `pending_payment`); el indicador que sí existe es `receipt_url IS NOT NULL` (hubo un comprobante) + `updated_at` viejo (el mismo trigger que ya mantenía esa columna se dispara en cada transición de estado, así que mide justo "hace cuánto que nadie tocó esta fila" — un rechazo la actualiza, así que el reloj arranca ahí).

**Sin test para P2-3**, a propósito: el cron `cleanup-classes` procesa TODAS las clases/inscripciones/comprobantes del stack local en una sola corrida (archivado, holds, 2x, recordatorios, purgas, chats); invocarlo desde un test de integración arriesgaría efectos secundarios sobre datos de otros tests, y ningún test de este repo lo invoca por HTTP por la misma razón — ni siquiera los dos fixes anteriores de este patrón exacto (`audit.md` P2-5, `audit2.md` P2-1) tienen test. Se verificó por lectura + el hecho de que el patrón de `.range()` ya está probado en producción por esos dos fixes anteriores.

**P2-6** fue el más simple: `Math.round(stars * 2) !== stars * 2` en vez de sólo el rango — seguro sin errores de punto flotante porque los pasos de 0.5 son exactos en IEEE-754.

**Verificación.** typecheck web y mobile en cero → **257** unit tests (250 + 7 de `notificationRoutes.test.ts`) → integración **43 verdes + 0 saltados** (el `fixme` de P1-4 ya es un test real; ya no queda ninguno pendiente), con `dev:web` arriba y las mismas **75** migraciones del stack local (sin cambio — sesión sin migraciones). La suite completa incluye `rls-guards.spec.ts`: sin regresión. El smoke E2E **no se corrió**.

**Una corrección de rumbo durante la sesión:** el test de Valoraciones extendido con los dos casos de P2-6 empezó a fallar por **timeout** (30s por defecto, sin `test.setTimeout` propio) al sumarle dos llamadas HTTP más a una secuencia que ya tenía cuatro — mismo patrón de lentitud del dev server que ya obligó a otros tests de este archivo a pedir `test.setTimeout(90_000)`. Se agregó el mismo timeout ahí. Sirve de recordatorio para la próxima sesión: **todo test que agregue una llamada HTTP a una secuencia existente en este archivo debe revisar si el test ya tiene margen, no asumirlo.**

**Pendiente de esta sesión:** nada de código en los ocho hallazgos — todos son de aplicación (deploy normal, sin orden respecto de las 25 migraciones pendientes). Mobile además necesita un build EAS nuevo para que el botón de cancelar suscripción (P1-5) y la navegación de push (P1-6) lleguen a los usuarios — son JS puro (sin módulos nativos nuevos), así que si el canal OTA de Expo Updates está configurado debería alcanzar con `eas update` en vez de un build completo; **verificarlo antes de asumirlo**, no se comprobó en esta sesión (fuera del alcance verificable sin el proyecto EAS real, mismo límite de §7).

**Con esto, los 8 hallazgos de la Sesión 3 de §8 quedan cerrados.** Queda **P2-4, P2-5, P2-7, P2-10 y P2-12** sin tocar (deuda acotada, no bloquea lanzamiento) y todo el checklist de §9.2 (sólo el usuario).

---

### S4 — 2026-08-02 · El checklist §9 explicado al usuario, y U-8 resuelta (las tiendas y la venta de suscripciones)

**Alcance:** el punto 4 de §8 —*"del usuario, en paralelo"*— explicado paso a paso a pedido suyo. Empezó como sesión **sin código** y terminó cerrando **U-8** (la decisión iOS/IAP que venía de `audit.md` D-1) más cuatro bugs de la pantalla de planes de mobile. Sin migraciones. **Producción no se tocó.**

#### La pregunta del usuario, y por qué su premisa era doblemente falsa

Antes de ejecutar el checklist preguntó si la suscripción en mobile redirigía a la web *"porque de lo contrario Apple llevará comisión"*. Ninguna de las dos mitades era cierta, y la corrección resultó lo más valioso de la sesión:

- **Lo que hacía el código:** `plans/index.tsx:153` llamaba a `create-subscription`/`create-preference` y abría el checkout de **Mercado Pago dentro de la app** (`WebBrowser.openBrowserAsync(init_point)`). No redirigía a `danzclass.com`.
- **Ni Apple ni Google pueden cobrar comisión sobre un pago de Mercado Pago** — no tienen acceso técnico a esa transacción. **La sanción es el rechazo de la app en revisión** (guía 3.1.1 de Apple; Payments policy de Google Play). El razonamiento "no me cobran comisión, entonces está bien" es el error exacto que motivó el cambio, y conviene que quede escrito porque es contraintuitivo.
- **Redirigir a `danzclass.com` tampoco habría servido** — la intuición natural, y falsa: las reglas anti-steering (guía 3.1.3) prohíben enlazar a un mecanismo de compra externo desde adentro de la app. En EE.UU. cambió tras el fallo de 2025; **Chile no está cubierto** por esa excepción ni por las de la UE (DMA).

#### La distinción decisiva, que no estaba escrita en ninguna parte del proyecto

En la app se pagan **dos cosas** y las tiendas las tratan de forma **opuesta**:

| Qué se paga | ¿MP dentro de la app? | Por qué |
|---|---|---|
| **Una clase de baile** (alumno → profesor) | ✅ Permitido | Servicio **físico presencial**, consumido **fuera** de la app — guía 3.1.5(a), el caso Uber/Airbnb |
| **El plan Básico/Pro** (usuario → DanzClass) | ❌ Prohibido | Desbloquea funcionalidad **digital dentro** de la app (publicar clases, subir videos) — guía 3.1.1 |

Esto acotó el problema drásticamente: **todo el marketplace queda intacto** (`PaymentClient`, `create-payment`, el 2% + gross-up, el `WebBrowser` de `payment/[enrollmentId].tsx` — verificado que ese llamador es el pago de clase, no de plan). El único punto a cambiar era la pantalla de planes.

#### La decisión, y lo implementado

Se le ofrecieron tres opciones con sus costos reales; eligió la recomendada: **quitar la compra de la app** en vez de integrar IAP. Razón: los planes son $1.500/$3.500, e integrar Apple IAP + Google Play Billing es ~1 semana, build nativo nuevo y **15–30% de comisión permanente** sobre montos chicos, para recuperar una conversión que en la web no tiene fricción real.

La pantalla conserva el plan activo, el banner de cancelación y el botón "Cancelar plan" (que Apple **sí** exige accesible); donde estaban los botones Mensual/Anual hay ahora un aviso de **texto plano sin link tocable**, **una sola vez** al pie de la pantalla y no por tarjeta de plan, para no repetir la referencia externa. Se eliminaron `handleSubscribe`, el estado `checkingOut` y el import de `expo-web-browser` de ese archivo.

**Bloque `WHY_NO_PURCHASE_IN_APP`** al inicio de `plans/index.tsx` + sección nueva en `CLAUDE.md` ("Reglas de las tiendas"): es código que **parece una regresión** —"¿por qué no se puede suscribir desde la app?"— y se revertiría sin querer en la próxima sesión que lo abra.

#### Ocho promesas falsas en la superficie de planes, en dos capas

**Capa 1 — la copia duplicada de mobile (4).** `plans/index.tsx` tenía su **propio** array de planes, desincronizado de `SUBSCRIPTION_PLANS` (`packages/shared`), que es lo que alimenta la web. Ahora deriva de la fuente única:

- **"Publicar clases (hasta 3 activas)"** — el Básico permite **1 suelta por mes**, tope que la migración `075` (S2 de este documento) ahora **hace cumplir en la base**. El más caro de los cuatro precisamente por eso: `075` lo vuelve visible al desplegar, con el profesor viendo un rechazo que la propia app le dijo que no debía ocurrir. Es el reverso exacto de la decisión de S2 de que "UI y base digan lo mismo" — que se cumplió en web y no se revisó en mobile.
- **"Sistema de confianza"** — eliminado en 2026-05-22, reemplazado por las valoraciones.
- **"Dashboard de analytics (próximamente)"** — existe desde 2026-05-31 como Panel Financiero.
- **"Anual · $18.000 · ahorras $3.000"** — **falso**: `create-preference/route.ts:46` cobra `config.price * 12` sin ningún descuento, y la web nunca prometió ahorro. Corregido al copy de la web.

**Capa 2 — el propio `SUBSCRIPTION_PLANS` (4 más).** Al hacer de ese array la fuente de verdad de mobile había que comprobar que sus promesas fueran ciertas, o el fix habría propagado lo falso **con más confianza**. Se verificó viñeta por viñeta contra el código y cuatro no se sostenían:

- **"Perfil destacado"** (Pro, $3.500/mes) — la **única aparición de esa frase en todo el repo era esa línea del array**. La funcionalidad nunca se construyó: es vaporware cobrado. El peor de los ocho.
- **"Inscríbete en cualquier clase"** (Básico) — la inscripción está **abierta a todos** desde marketplace v2; `canEnroll` ya no la gatea (su comentario en `ClassDetailClient.tsx:289-291` lo dice: sólo paquetes y 2x). Se vendía como beneficio pago algo que es gratis.
- **"Explora profesores"** (Básico) — `/feed` y `/explore` están en `PUBLIC_ROUTES` del middleware: no requieren plan **ni siquiera cuenta**. Mismo defecto.
- **El Pro no nombraba los entrenamientos** — decía "clases ilimitadas (sueltas y periódicas)" cuando `canPublishClassType` reserva **entrenamientos** al Pro, y con ellos las audiciones y el cobro mensual de S4. No es falso, es lo contrario: el diferenciador más grande del plan caro no aparecía.

Lo que **sí** se verificó como cierto y quedó: los cupos de clases (`class_quota_for_tier`, migración 075), los archivos por clase (`mediaLimit`: basic 1, pro 5), los videos de coreografía (`postQuotaForTier`: basic 3, pro ∞), paquetes y 2x (`canEnroll`), y la exención de comisión (`paysCommission`). La verificación quedó escrita como comentario del propio array.

**Regla que sale de acá, y que vale más que los ocho arreglos:** **toda viñeta de un plan es una promesa comercial y sólo va en el array si hay código que la haga cumplir.** Los ocho defectos tienen dos causas: un array duplicado que nadie volvió a mirar, y un array original que nadie contrastó contra el código cuando las features cambiaron debajo (la inscripción se abrió a todos, el feed se hizo público, el tope del Básico pasó de "3 activas" a "1 por mes"). Prometer algo inexistente o gratis es publicidad engañosa bajo la Ley 19.496 (SERNAC), que los propios `/terms` citan.

**Alcance del cambio de `SUBSCRIPTION_PLANS`:** lo leen **tres** pantallas — `/plans` web, la tarjeta de suscripción de `/profile` web, y planes de mobile. Las tres quedan corregidas de una vez.

#### La parte no-código: el checklist §9 explicado

Se recorrió con el usuario, en orden ejecutable y en lenguaje accesible, todo §9.2 (U-1 a U-11) más §4, explicando qué es cada cosa (qué es una migración, qué es un backup, qué es sandbox de MP, qué significa cada variable de entorno). **Hallazgo de estado no listado en el documento:** el código de S1–S3 **sigue sin commitear** (`git status` con ~27 archivos, `git log` sin ningún commit de `audit3` — el último es `ea0ecee`, de `audit2`). §9 asume el código "listo para desplegar"; se le marcó como **paso 0**, antes de U-1/U-2.

**Verificación.** typecheck mobile en cero → **257** unit tests verdes. No se tocó web, ni el marketplace, ni ninguna migración (siguen **25** pendientes).

**Pendiente:** todo §9.2 menos U-8, que queda cerrada. En código sólo queda C-9/C-10 (P2-4, P2-5, P2-7, P2-10, P2-12), deuda acotada. El cambio de esta sesión es de aplicación pero **mobile-only**: necesita build EAS o `eas update` para llegar a los usuarios, igual que P1-5/P1-6 de S3.
