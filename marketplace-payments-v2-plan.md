# Marketplace Payments v2 — Ambas vías abiertas a todos + comisión simplificada

> Plan de implementación. Documento de handoff para ejecutar en sesiones de Claude Code separadas.
> Continúa (no reemplaza) `marketplace-payments-plan.md` — leer ese documento primero para el contexto de la Fase 1–5 original (OAuth Connect, split, webhook). Este documento describe el **cambio de modelo de negocio** decidido en la sesión 2026-07-27 (conversación de planificación) y el trabajo de código para implementarlo.
> Estado: **Sesiones 1, 2, 3 y 4 completas** (2026-07-27). Además, una **sesión de cierre de deuda técnica** (2026-07-28) resolvió todos los cabos sueltos que las Sesiones 2–3 habían dejado anotados como "pendiente de decisión del usuario" o "riesgo bajo, no cerrado" — ver el registro en §8. Solo queda **Sesión 5** (QA con sandbox de Mercado Pago) — requiere al usuario.

---

## 0. Qué cambia, en una frase

Hoy: alumno sin plan → solo puede pagar por Mercado Pago (con comisión). Alumno con plan → puede pagar por transferencia (sin comisión) o MP (sin comisión).

**Nuevo:** el profesor elige, por clase, qué métodos acepta (MP, transferencia, o ambos). **Todos los alumnos pueden usar cualquier método que el profesor habilitó**, tengan o no plan. La única diferencia por plan es: pagando por MP, un alumno sin plan paga una comisión de servicio de DanzClass (2%, tope $700); un alumno con plan no. **El profesor recibe siempre el 100% del precio que fijó**, sin importar método ni plan del alumno — el costo de procesar con Mercado Pago se traslada íntegro al monto que paga el alumno, nunca lo absorbe el profesor.

---

## 1. Modelo de comisiones — matemática exacta

### 1.1 Piezas del costo

| Componente | Valor | Quién lo paga |
|---|---|---|
| Comisión Mercado Pago (Checkout Pro, disponibilidad inmediata) | 3,19% + 19% IVA sobre esa comisión = **3,7961%** del monto total transado | Se traslada 100% al alumno vía gross-up (ver 1.2). El profesor nunca la absorbe. |
| Comisión de servicio DanzClass | 2% del precio de la clase, tope **$700 CLP** | Solo el alumno **sin plan**, y solo si paga por **MP**. $0 si tiene plan o si paga por transferencia. |

**Decisión explícita — MP es la única tasa de referencia usada.** MP en Chile tiene 4 tramos según el plazo de liberación del dinero (inmediato 3,19%+IVA, 10 días 2,89%+IVA, usuarios nuevos 2,59%+IVA, 30 días 2,29%+IVA). Se usa **el tramo inmediato (peor caso)** como tasa fija de plataforma para todos los profesores, para no tener que leer la configuración de cada cuenta MP (no expuesta de forma confiable por la API). Esto es conservador: si un profesor tiene liberación a 30 días, DanzClass gana un poco más en cada transacción MP (el alumno paga el gross-up del peor caso, MP cobra menos). No hay pérdida posible por este lado. Empujar a los profesores hacia liberación a 30 días en el onboarding de OAuth queda como mejora futura opcional (baja el costo real sin tocar el modelo).

### 1.2 Por qué hace falta "gross-up" (y no un simple +X%)

Mercado Pago cobra su comisión **sobre el monto total transado**, no sobre el precio base. Si se suma un recargo plano de 3,7961%, MP cobra ese porcentaje sobre un monto ya inflado y el profesor termina recibiendo menos que su precio. La fórmula que sí deja al profesor con el 100% exacto:

```
comisión_dc = alumno sin plan pagando por MP ? min(round(precio * 0.02), 700) : 0

total_a_pagar = round( (precio + comisión_dc) / (1 - 0.037961) )
```

Donde `precio` es el valor que el profesor fijó al crear la clase (lo que **siempre** recibe íntegro). `total_a_pagar` es lo que ve y paga el alumno en el checkout de MP.

**Por transferencia no hay gross-up ni comisión DanzClass** (ver §1.4): el alumno paga exactamente `precio`, el profesor recibe exactamente `precio`.

### 1.3 Tabla de ejemplo

| Precio clase | Comisión DC (si sin plan + MP) | Total MP — **sin** plan | Total MP — **con** plan | Total transferencia (ambos) |
|---|---|---|---|---|
| $15.000 | $300 | **$15.904** (+6,02%) | **$15.592** (+3,95%) | $15.000 |
| $25.000 | $500 | **$26.506** (+6,02%) | **$25.986** (+3,95%) | $25.000 |
| $35.000 | $700 (tope alcanzado) | **$37.109** (+6,02%) | **$36.381** (+3,95%) | $35.000 |
| $50.000 | $700 (tope) | **$52.701** (+5,40%) | **$51.973** (+3,95%) | $50.000 |

Nota: el extra "con plan" (3,95%) es **constante** para cualquier precio — es puramente el gross-up de MP, sin comisión DC. El extra "sin plan" se estabiliza en ~6,02% hasta que el tope de $700 empieza a diluirse en precios altos (baja gradualmente, ej. 5,40% a $50.000).

**Usuarios de prueba PRO (alpha):** como cualquier plan pagado hace `comisión_dc = 0`, un tester PRO que pague por MP solo ve el 3,95% de gross-up de MP — nunca la comisión DanzClass. Esto ya es el comportamiento correcto del modelo, no requiere código especial: basta con que el usuario de prueba tenga una fila `subscriptions` activa (`tier='pro'`).

### 1.4 Decisión — la comisión DanzClass no aplica a pagos por transferencia

El mensaje del usuario no lo especifica explícitamente para el caso "sin plan + transferencia", así que dejo esto como **supuesto de diseño, no como pregunta bloqueante** (puede confirmarse/revertirse fácilmente en Sesión 1 si se decide lo contrario):

- Con transferencia, el dinero se mueve banco-a-banco, fuera de cualquier pasarela — DanzClass no tiene ningún mecanismo para "cobrar" su comisión sin pedirle al alumno una **segunda transferencia** a una cuenta de DanzClass (fuera de alcance: implicaría custodiar fondos, romper el encuadre tributario de "split en origen" que ya se eligió en la Fase 1–5 original, y agregar fricción).
- Por lo tanto: **transferencia siempre es precio = precio fijado, sin extra, para cualquier alumno** (con o sin plan). Es, de hecho, la opción más barata para el alumno sin plan — puede convertirse en un incentivo a usar transferencia en vez de MP. Esto es aceptable para alpha (más adopción, menos dependencia de MP) y coherente con la prioridad declarada de "ganar usuarios y movimiento".
- Consecuencia para el profesor: transferencia le sigue dando el 100% sin fricción de comisión, tal como hoy — sigue siendo atractiva ofrecerla, aunque implica confirmación manual (comprobante + revisión, con o sin escaneo IA).

### 1.5 Helpers a reescribir — `packages/shared/src/lib/commission.ts`

El archivo actual queda obsoleto en su forma (fue diseñado para "no hay gross-up, el profesor recibe `base` menos lo que MP le descuente en su cuenta" — que era el bug real que teníamos: el profesor perdía la comisión de MP silenciosamente). Nueva forma:

```ts
export const MP_FEE_RATE = 0.0319        // Checkout Pro, disponibilidad inmediata (peor caso, ver §1.1)
export const MP_FEE_IVA_RATE = 0.19 * MP_FEE_RATE
export const MP_TOTAL_RATE = MP_FEE_RATE + MP_FEE_IVA_RATE  // 0.037961

export const COMMISSION_RATE = 0.02
export const COMMISSION_CAP_CLP = 700

export function platformCommission(price: number): number { /* igual que hoy */ }

export function paysCommission(tier: SubscriptionTier): boolean { return tier === 'none' }

export interface ClassPaymentMethods { acceptsMp: boolean; acceptsTransfer: boolean }

export interface PaymentBreakdown {
  base: number          // precio fijado por el profesor — SIEMPRE lo que recibe
  commission: number     // comisión DanzClass (0 salvo MP + sin plan)
  mpFeeCovered: number   // porción del total que cubre la comisión de MP (0 en transferencia)
  total: number          // lo que paga el alumno
  method: 'mp' | 'transfer'
}

export function paymentBreakdown(price: number, tier: SubscriptionTier, method: 'mp' | 'transfer'): PaymentBreakdown {
  const base = Math.round(price)
  if (method === 'transfer') return { base, commission: 0, mpFeeCovered: 0, total: base, method }
  const commission = paysCommission(tier) ? platformCommission(base) : 0
  const total = Math.round((base + commission) / (1 - MP_TOTAL_RATE))
  return { base, commission, mpFeeCovered: total - base - commission, total, method }
}
```

`canPayByTransfer(tier)` **deja de tener sentido para clases** (la disponibilidad de transferencia pasa a ser una propiedad de la clase, no del tier del alumno) — queda deprecado para ese uso.

> **Corrección (Sesión 3):** este párrafo decía originalmente que la función "sigue siendo necesaria para paquetes". Es **falso**: `class_packages` nunca la usó — se gatea con `canEnroll(tier)` en `/api/packages/[id]/enroll`. Tras la Sesión 3 la función quedó **sin ningún llamador en el repo**. Se conservó igual (borrarla es una decisión aparte), con el JSDoc corregido.

---

## 2. Modelo de datos — nuevas columnas en `classes`

Migración nueva: **`061_class_payment_methods.sql`** (el repo va hasta `060_post_plan_visibility.sql`).

```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS accepts_mp BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS accepts_transfer BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE classes ADD CONSTRAINT classes_payment_method_check
  CHECK (accepts_mp OR accepts_transfer);
```

- Default `true`/`true` en ambas: preserva disponibilidad para clases existentes y es coherente con "abrir todo a todos" — no requiere backfill adicional.
- El CHECK evita que una clase quede sin ninguna vía de pago (bloquearía la inscripción para siempre).
- Rollback: `ALTER TABLE classes DROP CONSTRAINT classes_payment_method_check; ALTER TABLE classes DROP COLUMN accepts_mp; ALTER TABLE classes DROP COLUMN accepts_transfer;` — documentar en el header de la migración (patrón ya usado en 044–060).
- **Gating adicional en runtime, no en la constraint:** `accepts_mp=true` en una clase no implica que el pago MP esté realmente disponible — el profesor también necesita `profiles.mp_connected=true` (OAuth ya conectado). La UI de creación/edición debe deshabilitar el checkbox de MP si el profesor no está conectado (con link a `/profile/payment-info`), y el backend (`create-payment`) debe seguir devolviendo `teacher_not_connected` si igual llega una request con `accepts_mp=true` pero sin conexión.

**`packages/shared/src/types/index.ts`** — agregar `accepts_mp: boolean` y `accepts_transfer: boolean` a la interfaz `Class` (buscar dónde están definidos `price_2x`/`billing_day` para mantener el mismo estilo).

---

## 3. Bug encontrado durante la investigación — 2x nunca confirma al compañero ✅ CORREGIDO (Sesión 2)

**No es parte del pedido del usuario, pero bloquea "2x debe poder pagarse por MP" si no se corrige primero, y es un bug real hoy.**

En el flujo 2x, cada participante tiene su **propio** `enrollment` (`enrollA`/`enrollB`, unidos por `partner_enrollment_id`, ver `apps/web/src/app/api/class-2x/match/route.ts:62-99`). El pago (transferencia hoy) se registra contra el `enrollment.id` del `payment_assignee` únicamente. Tanto `autoConfirmPayment()` (`apps/web/src/lib/payments.ts:12-52`) como `/api/payment/confirm` (`apps/web/src/app/api/payment/confirm/route.ts`) confirman **solo esa fila** — nunca tocan el `partner_enrollment_id`. Es decir: hoy, cuando el profesor confirma el pago 2x de quien pagó, el compañero **se queda en `pending_payment` para siempre**, salvo que el profesor lo detecte y lo confirme manualmente aparte (si es que hay UI para eso — a verificar en Sesión 2).

Esto hay que arreglarlo como parte de la Sesión 2 (no como parche aislado), porque la confirmación automática de MP para 2x sin este fix dejaría al compañero sin inscripción confirmada aunque el pago haya sido aprobado.

> **Resuelto en la Sesión 2** dentro de `lib/payments.ts` (`confirmTwoxPartner` + `unconfirmTwoxPartner`), de modo que los tres caminos de confirmación (profesor, IA, webhook MP) lo heredan sin cambios propios. Verificado con un test de integración contra el stack local (`npm run test:integration`). Detalle en §8.

---

## 4. Sesiones de trabajo

Ordenadas por prioridad/dependencia. Cada una es ejecutable como una sesión de Claude Code independiente (contexto fresco), asumiendo que las sesiones anteriores ya fueron mergeadas. Indico modelo/capacidad recomendada por el nivel de riesgo (lógica financiera > UI mecánica > texto legal).

### Sesión 1 — Fundamentos: modelo de datos + helper de comisión ✅ COMPLETA (2026-07-27)
**Prioridad: bloqueante — nada más puede empezar sin esto.**
**Modelo recomendado: Opus 5, capacidad Alta/Extra High.** Es aritmética financiera pura con pocos archivos pero cero margen de error de redondeo/signo — vale la pena la capacidad alta aunque el diff sea chico.

- [x] Migración `061_class_payment_methods.sql` (§2), aplicar contra el stack local (`npm run db:reset`) y verificar el CHECK constraint con un insert que intente `accepts_mp=false, accepts_transfer=false` (debe fallar).
- [x] Reescribir `packages/shared/src/lib/commission.ts` según §1.5. Mantener `platformCommission`/`paysCommission` tal cual (siguen siendo correctas); reemplazar `paymentBreakdown` por la versión con `method` y gross-up completo; agregar `MP_FEE_RATE`/`MP_FEE_IVA_RATE`/`MP_TOTAL_RATE`.
- [x] Reescribir `tests/unit/commission.test.ts`: casos con method='transfer' (siempre `total===base`, `commission===0`), method='mp' sin plan (verificar la tabla de §1.3 con tolerancia de redondeo), method='mp' con plan (solo gross-up, sin comisión), casos de tope ($700) y precio $0/negativo.
- [x] Actualizar `packages/shared/src/types/index.ts`: `accepts_mp`/`accepts_transfer` en `Class`; revisar si `PaymentBreakdown`/`PaymentMethod` necesitan ajuste de tipo por el nuevo campo `method`.
- [x] `npm run typecheck --workspace=apps/web` limpio (romperá temporalmente en los call-sites de `paymentBreakdown`/`canPayByTransfer` — eso es esperado y se resuelve en Sesiones 2–3, dejar anotado con TODO o silenciar con `as any` temporal si hace falta para no bloquear el merge de esta sesión). → **Se resolvió sin `as any` ni TODOs**: los 3 call-sites se adaptaron pasando `'mp'` (ver §8).

### Sesión 2 — Backend de pago: `create-payment`, webhook, confirmación 2x ✅ COMPLETA (2026-07-27)
**Prioridad: alta — depende de Sesión 1.**
**Modelo recomendado: Opus 5, capacidad Alta/Extra High.** Es la parte de mayor riesgo real (dinero, idempotencia, split, dos enrollments que deben confirmarse atómicamente).

- [x] `apps/web/src/app/api/mercadopago/create-payment/route.ts`:
  - Leer `cls.accepts_mp` en el select existente; si es `false` → 400 `mp_not_accepted_for_class` (nuevo código de error, distinto de `teacher_not_connected`).
  - Quitar el bloqueo `if (enrollment.is_2x) return twox_not_supported`. En su lugar: si `is_2x`, buscar el `class_2x_requests` correspondiente (`status='matched'`, `class_id=cls.id`, `user_id` o `matched_with` = `enrollment.student_id`) y verificar `payment_assignee === userId` (403 `not_payment_turn` si no). Usar `cls.price_2x` (o `cls.price_suelta_2x` según `cls.type`) en vez de `effectiveClassPrice(cls)` — mismo precio que ya usa `PaymentClient` hoy para 2x (sin descuento espontáneo, ver `marketplace-payments-plan.md` §9).
  - Llamar `paymentBreakdown(precio, tier, 'mp')` (nueva firma de Sesión 1) y usar `total`/`commission`/`base` como hoy.
  - Guardar en el `payments` row insertado/actualizado: **el `partner_enrollment_id` del par 2x** (si aplica) en algún campo recuperable por el webhook — más simple: en vez de duplicar columnas, que el webhook relea `enrollments.partner_enrollment_id` directo desde la tabla al confirmar (no hace falta persistirlo en `payments`).
- [x] `apps/web/src/lib/payments.ts` — `autoConfirmPayment()`: antes de retornar, si `enrollment.is_2x && enrollment.partner_enrollment_id`, repetir el mismo bloque de escritura (`enrollments.update(status='confirmed')`, emisión de QR, notificación `payment_confirmed`, push) para el `partner_enrollment_id`. Esto corrige el bug de §3 y de paso hace que el pago 2x por transferencia (ya existente) también quede bien resuelto — verificar que no se rompa nada del flujo actual de transferencia 2x al tocar esta función compartida (la usan también `/api/payment/confirm` y `/api/payment/scan`).
- [x] `apps/web/src/app/api/mercadopago/webhook/route.ts` — `confirmClassPayment()`: no necesita cambios propios si `autoConfirmPayment` ya confirma ambos; solo verificar que el `enrollment` que lee (por `enrollment_id` del `external_reference`) traiga `partner_enrollment_id` en el select.
- [x] `apps/web/src/app/api/payment/confirm/route.ts` (confirmación manual del profesor para transferencia): mismo fix — aplica automáticamente porque usa `autoConfirmPayment`, pero **verificar** que el select de `payment` en esa ruta (línea ~34) incluya `enrollment.partner_enrollment_id` y `enrollment.is_2x` para pasarlos al helper.
- [x] Revisar `apps/web/src/app/api/class-2x/transfer-payment/route.ts` — no debería necesitar cambios (solo reasigna `payment_assignee`), pero confirmar que sigue siendo compatible con que ahora el asignado también pueda elegir MP en vez de transferencia.
- [x] Tests de integración contra el stack local (no unitarios — necesitan DB): crear un par 2x, confirmar el pago del asignado (vía `/api/payment/confirm` simulando teacher), verificar que **ambos** enrollments quedan `confirmed`.

### Sesión 3 — UI: pago (web+mobile) y creación/edición de clase con selector de métodos ✅ COMPLETA (2026-07-27)
**Prioridad: alta — depende de Sesiones 1 y 2 para tener datos/endpoints reales, pero el trabajo de formularios puede empezar en paralelo sobre mocks si se quiere adelantar.**
**Modelo recomendado: Sonnet 5, capacidad Alta.** Mecánico y guiado por los helpers ya correctos; el riesgo es de UX/dark-mode/paridad web-mobile, no de matemática.

- [x] **`apps/web/src/components/payment/PaymentClient.tsx`** — reescribir la lógica de gating:
  - Quitar `canPayByTransfer(tier)` como gate; usar `cls.accepts_transfer` y `cls.accepts_mp` (traídos por la query de la page, agregar a los `select`).
  - `showMp = cls.accepts_mp && teacherMpConnected && (!is2x || esMiTurno)`.
  - `showTransfer = cls.accepts_transfer`.
  - Si `is2x`, calcular `paymentBreakdown` con `cls.price_2x`, igual que hace hoy para el monto mostrado — ahora también para el botón MP.
  - Desglose visual: mostrar los tres números cuando sea relevante — "Precio clase", "Comisión MP" (solo si method=mp, mostrar como línea separada de "Comisión DanzClass" para que quede claro que **una es de MP y la otra es de DanzClass**, evitando el problema de *surcharging* mencionado en la conversación de planificación: nunca decir "cargo de Mercado Pago" como línea que DanzClass factura — usar un fraseo tipo "Comisión de procesamiento" que incluya ambas sin acusarlas de "cargo por pagar con X").
  - Caso sin ningún método disponible para ese alumno (no debería poder pasar dado el CHECK de §2, pero si `teacherMpConnected=false` y `accepts_transfer=false` sí puede pasar en runtime) → mensaje de error claro, no debería llegar un alumno a esta pantalla en ese estado (validarlo también al mostrar el botón "Reservar" en `ClassDetailClient`).
- [x] **`apps/mobile/app/(app)/payment/[enrollmentId].tsx`** — mismo cambio, en paridad (ver patrón ya usado para F3b en `marketplace-payments-plan.md` §4).
- [x] **`apps/web/src/components/class/CreateClassForm.tsx`** y **`EditClassForm.tsx`**:
  - Nuevo bloque junto al campo de precio (`CreateClassForm.tsx` alrededor de la línea 792): dos checkboxes "Acepto pago con Mercado Pago" / "Acepto transferencia bancaria", con validación `superRefine` (al menos uno marcado) espejando el CHECK de la DB.
  - Checkbox de MP deshabilitado con tooltip/link a `/profile/payment-info` si `!profile.mp_connected` (reusar el patrón de `MpConnectCard`).
  - **Preview de precio al alumno**, actualizado en tiempo real mientras el profesor escribe el precio (usar `paymentBreakdown` de shared, sin llamar al backend): mostrar hasta 3 líneas según qué métodos estén marcados — "Por transferencia: $P", "Por Mercado Pago (alumno sin plan): $T_no", "Por Mercado Pago (alumno con plan): $T_plan". Si `price_2x` tiene valor, repetir el mismo preview para el precio 2x en el bloque ya existente (línea ~797-806).
- [x] **`apps/mobile/app/(app)/class/create.tsx`** y **`class/[id]/edit.tsx`** — mismo par de checkboxes + preview, en paridad.
- [x] **`apps/web/src/components/class/ClassDetailClient.tsx`** y mobile `class/[id]/index.tsx`: pasar `accepts_mp`/`accepts_transfer` desde la query de la clase hasta `PaymentClient`/pantalla de pago; opcionalmente mostrar un badge pequeño "Acepta: MP · Transferencia" en el detalle de la clase (no imprescindible, valorar si aporta o es ruido visual).
- [x] Revisar `canUserEnroll` en `ClassDetailClient.tsx:287` (usa `canEnroll(userTier)`) — confirmar que solo gatea paquetes/2x y no la inscripción general de clase individual (que ya está abierta desde la Fase 3a original); si gatea algo relacionado a esta sesión, ajustar.
- [x] Probar en navegador (dev server + stack local): crear clase con ambos métodos, ver el preview de precio cambiar al tipear; pagar como alumno sin plan por MP (sandbox) y por transferencia; pagar como alumno con plan por MP.

### Sesión 4 — Legal: `/terms` y `/privacy` (ES+EN) + copy en `/plans` ✅ COMPLETA (2026-07-27)
**Prioridad: media — no bloquea funcionalidad, pero no debe lanzarse sin esto (ya es una norma del proyecto: cambios de modelo de pago requieren texto legal actualizado, ver `marketplace-payments-plan.md` §6).**
**Modelo recomendado: Sonnet 5, capacidad Alta.** Redacción siguiendo un patrón ya establecido (las secciones existentes), no requiere razonamiento nuevo, pero sí precisión y cobertura ES+EN.

- [x] **`apps/web/src/app/terms/page.tsx`**, sección 6 "Pagos, comisiones y reembolsos" (ES, línea ~127) y su espejo EN (línea ~340): actualizar para describir:
  - Que ambos métodos (MP y transferencia) están disponibles según lo que cada profesor habilite para su clase.
  - La comisión de servicio DanzClass (2%, tope $700) aplica **solo** a pagos por Mercado Pago de alumnos sin plan activo.
  - El costo de procesamiento de Mercado Pago se refleja en el monto mostrado al pagar por esa vía — nunca se descuenta del precio del profesor.
  - Transferencia no tiene ningún cargo adicional, para ningún alumno.
  - Mantener el encuadre tributario existente (split en origen, DanzClass no custodia fondos) — no cambia con este documento.
- [x] **`apps/web/src/app/privacy/page.tsx`** (ES línea ~96/109/119, EN ~226/239/249): ajustar la descripción de "cómo se calcula la comisión" si el texto actual la describe de forma que ya no es precisa (ej. si dice "la comisión de servicio correspondiente" sin más detalle probablemente no necesita cambio; verificar la sección de recopilación de datos de pago para asegurarse que sigue siendo cierta con dos métodos abiertos a todos). → **Revisado, sin cambios**: no menciona restricción por plan en ningún punto, ya era compatible con el modelo nuevo.
- [x] **`apps/web/src/app/(app)/plans/page.tsx`** y **`apps/mobile/app/(app)/plans/index.tsx`**: agregar una línea/bullet al plan Básico/Pro explicando el beneficio real ("Sin comisión de servicio al pagar clases con Mercado Pago" — **no** prometer nunca "sin cargos de Mercado Pago", porque el gross-up de MP sigue aplicando con o sin plan; ser precisos para no generar una expectativa que el producto no cumple).
- [x] Recordar (no accionable en código): este texto sigue siendo borrador no verificado legalmente, igual que el resto de `/terms` §6 — no se resuelve en esta sesión.

### Sesión 5 — QA end-to-end con sandbox de Mercado Pago (requiere al usuario, no es una sesión autónoma de código)
**Prioridad: alta antes de anunciar la feature a alumnos reales — no antes de tener credenciales sandbox.**
**Esta no es una sesión de agente independiente**: necesita cuentas de prueba de Mercado Pago (comprador + vendedor) que solo el usuario puede crear/gestionar. Puede combinarse con una sesión Sonnet 5 liviana que **prepare** el checklist y corra lo automatizable (unit tests, tests de integración contra stack local que no requieran MP real), dejando la parte de sandbox como pasos manuales documentados.

Checklist:
- [ ] Profesor sandbox con `accepts_mp=true, accepts_transfer=true` en una clase.
- [ ] Alumno sandbox sin plan paga por MP → verificar monto exacto cobrado (`total` de §1.3), que el profesor reciba el `base` completo en su cuenta MP de prueba, y que DanzClass reciba la comisión vía `marketplace_fee`.
- [ ] Mismo alumno, mismo profesor, ahora **con** plan de prueba → verificar que el monto baja al gross-up sin comisión.
- [ ] Alumno paga por transferencia (con y sin plan) → verificar que no hay ninguna comisión ni gross-up, profesor recibe exactamente el precio.
- [ ] 2x: dos alumnos sandbox emparejados, uno paga por MP → verificar que **ambos** enrollments quedan `confirmed` (fix de §3) y que el monto cobrado usa `price_2x`, no el precio individual.
- [ ] Clase con `accepts_mp=false` → confirmar que el botón MP no aparece y que `create-payment` rechaza con `mp_not_accepted_for_class` si se llama igual por API directa.
- [ ] Clase con `accepts_transfer=false` → confirmar que la sección de transferencia no aparece.
- [ ] Firma del webhook sigue validando correctamente con el query param `?seller=` (ya validado en la Fase 4 original, solo confirmar que no se rompió).

---

## 5. Fuera de alcance de este documento (explícitamente, para no generar expectativas)

- **Paquetes de clases (`class_packages`)** — siguen gateados por `canEnroll(tier)`/`canPayByTransfer(tier)` (solo alumnos con plan, sin split MP). No se tocan aquí. Si se quiere alinear paquetes al mismo modelo (abrir a todos, con comisión por MP), es un documento/sesión aparte — la complejidad extra es que un paquete cubre *varias* clases de un mismo profesor con un solo pago, y habría que decidir si el split de MP puede ir a un solo `access_token` (si) y cómo prorratear la comisión.
- **Precios de los planes ($1.500 básico / $3.500 pro)** — no cambian en este documento (a diferencia de una idea anterior descartada en la conversación de planificación). Quedan en `apps/web/src/app/api/mercadopago/create-subscription/route.ts:8-9` y `create-preference/route.ts:8-9` (duplicados — limpiar esa duplicación es deuda técnica preexistente, no de esta feature).
- **Empujar liberación a 30 días en la cuenta MP del profesor** — mejora futura opcional que baja el costo real de MP sin afectar el modelo (ver §1.1). No es parte de esta implementación.
- **Grant de plan PRO a usuarios de prueba alpha** — es una operación manual (insert/update directo en `subscriptions` vía Supabase Studio o SQL), no requiere código nuevo. Ejemplo:
  ```sql
  insert into subscriptions (user_id, tier, status, expires_at)
  values ('<uuid-tester>', 'pro', 'active', now() + interval '90 days')
  on conflict (user_id) do update set tier='pro', status='active', expires_at=excluded.expires_at;
  ```
  (Verificar el nombre exacto de las columnas/constraint de `subscriptions` antes de correrlo — no incluido en la investigación de este documento.)

---

## 6. Índice de archivos por sesión (referencia rápida)

```
Sesión 1
  supabase/migrations/061_class_payment_methods.sql          (nuevo)
  packages/shared/src/lib/commission.ts                       (reescrito)
  packages/shared/src/types/index.ts                          (Class + PaymentBreakdown)
  tests/unit/commission.test.ts                                (reescrito)

Sesión 2  (hecho — así quedó realmente)
  apps/web/src/app/api/mercadopago/create-payment/route.ts    (2x + accepts_mp gate)
  apps/web/src/lib/payments.ts                                 (confirm/unconfirm del partner 2x)
  apps/web/src/app/api/mercadopago/webhook/route.ts            (total esperado con gross-up)
  apps/web/src/app/api/payment/confirm/route.ts                 (unconfirm del partner en reject/revert)
  apps/web/src/app/api/class-2x/match/route.ts                  (no ignorar el error de payment_assignee)
  packages/shared/src/lib/commission.ts                         (exporta grossUpForMp)
  packages/shared/src/lib/pricing.ts                            (twoxClassPrice)
  supabase/migrations/062_fix_2x_payment_assignee.sql           (nuevo — columna que nunca se creó)
  tests/integration/twox-payment.spec.ts                        (nuevo)
  playwright.integration.config.ts + npm run test:integration   (nuevo)

Sesión 3  (hecho — así quedó realmente)
  apps/web/src/components/class/PaymentMethodsField.tsx        (nuevo — checkboxes + preview)
  apps/mobile/components/class/PaymentMethodsField.tsx          (nuevo — espejo mobile)
  apps/web/src/components/payment/PaymentClient.tsx
  apps/mobile/app/(app)/payment/[enrollmentId].tsx
  apps/web/src/components/class/CreateClassForm.tsx
  apps/web/src/components/class/EditClassForm.tsx
  apps/web/src/app/(app)/create-class/page.tsx                  (pasa mpConnected)
  apps/web/src/app/(app)/class/[id]/edit/page.tsx               (pasa mpConnected + hasPaymentInfo)
  apps/mobile/app/(app)/class/create.tsx
  apps/mobile/app/(app)/class/[id]/edit.tsx
  apps/web/src/components/class/ClassDetailClient.tsx
  apps/mobile/app/(app)/class/[id]/index.tsx
  apps/web/src/app/api/class/enroll/route.ts                    (guard no_payment_method)

Sesión 4  (hecho — así quedó realmente)
  apps/web/src/app/terms/page.tsx                              (§6 ES+EN reescrita, fecha actualizada)
  apps/web/src/app/privacy/page.tsx                             (revisada, sin cambios — ya era compatible)
  packages/shared/src/types/index.ts                            (bullet nuevo en SUBSCRIPTION_PLANS.basic)
  apps/mobile/app/(app)/plans/index.tsx                          (bullet nuevo en PLANS.basic, array duplicado)
  apps/web/src/app/(app)/plans/page.tsx                          (sin tocar — renderiza el array de shared)

Sesión 5
  (QA manual + sandbox MP, sin archivos de código propios)

Sesión de cierre de deuda técnica — 2026-07-28 (hecho — así quedó realmente)
  supabase/migrations/063_fix_2x_requests_rls_and_dedup.sql   (nuevo — RLS + dedup class_2x_requests)
  supabase/migrations/064_payments_void_status.sql             (nuevo — habilita payments.status='void')
  apps/web/src/app/api/class/enroll/route.ts                   (fix 'confirmed'→'verified' en exclusión void)
  apps/web/src/app/api/cron/cleanup-classes/route.ts            (ídem, 2 sitios)
  apps/web/src/components/class/MyClassesClient.tsx             (categoría 'Anulado' en pills/CSV/history)
  apps/mobile/app/(app)/(tabs)/my-classes.tsx                   (ídem, mobile)
  apps/web/src/app/api/payment/submit-transfer/route.ts        (nuevo — enforce accepts_transfer server-side)
  apps/web/src/components/payment/PaymentClient.tsx             (usa submit-transfer en vez de insert directo)
  apps/mobile/app/(app)/payment/[enrollmentId].tsx               (ídem, mobile)
  apps/web/src/components/class/PaymentMethodsField.tsx         (preview de price_suelta_2x)
  apps/mobile/components/class/PaymentMethodsField.tsx           (ídem, mobile)
  apps/web/src/components/class/CreateClassForm.tsx              (pasa priceSuelta2x al preview)
  apps/web/src/components/class/EditClassForm.tsx                (ídem)
  apps/mobile/app/(app)/class/create.tsx                          (ídem)
  apps/mobile/app/(app)/class/[id]/edit.tsx                       (ídem)
  apps/web/src/components/class/TwoxRequestButton.tsx            (manejo de error en insert 2x)
  apps/mobile/app/(app)/class/[id]/index.tsx                     (ídem, mobile)
```

---

## 7. Supuestos que tomé y que conviene confirmar antes de iniciar Sesión 1

Ninguno de estos bloquea el arranque (son reversibles con bajo costo si el usuario decide distinto), pero mejor decidirlos ahora que a mitad de una sesión:

1. **Tasa MP fija = tramo inmediato (3,19%+IVA)** para todos los profesores, sin leer su configuración real de liberación (§1.1).
2. **Sin comisión DanzClass en transferencia**, para nadie (§1.4) — es la pieza más importante de confirmar porque cambia el incentivo económico (transferencia queda como la opción más barata para el alumno sin plan).
3. **El profesor recibe el 100% de su precio siempre**, sin excepción — el modelo ya no tiene ninguna variante donde el profesor absorba nada (a diferencia de iteraciones anteriores de esta conversación). Esto es justo lo que pidió el usuario en el último mensaje, lo dejo explícito para que quede como decisión final y no se reintroduzca por error en una sesión futura.
4. **Paquetes quedan fuera de alcance** (§5) — un profesor podría notar la inconsistencia de que packages no ofrecen el mismo modelo abierto; aceptable para alpha, a revisar después.

---

## 8. Registro de sesiones

### Sesión 1 — 2026-07-27 (Opus 5) — ✅ COMPLETA

**Los 4 supuestos de §7 se ejecutaron tal cual estaban escritos** (tasa MP fija del tramo inmediato, sin comisión DanzClass en transferencia, profesor recibe siempre el 100%, paquetes fuera de alcance). Ninguno se cuestionó ni cambió durante la implementación.

#### Completado

| Entregable | Detalle |
|---|---|
| `supabase/migrations/061_class_payment_methods.sql` | `accepts_mp`/`accepts_transfer` (`BOOLEAN NOT NULL DEFAULT true`) + `classes_payment_method_check`. El `ADD CONSTRAINT` va dentro de un `DO $$` con chequeo en `pg_constraint` porque Postgres no soporta `ADD CONSTRAINT IF NOT EXISTS` y las migraciones del repo deben poder replayearse desde cero (regla del stack local, CLAUDE.md). |
| `packages/shared/src/lib/commission.ts` | Reescrito. Nuevas constantes `MP_FEE_RATE`/`MP_FEE_IVA_RATE`/`MP_TOTAL_RATE`; `paymentBreakdown(amount, tier, method)` con gross-up vía helper interno `grossUpForMp()`; `PaymentBreakdown` gana `mpFeeCovered` y `method`. `platformCommission`/`paysCommission` intactas. `canPayByTransfer` **no se borró**: quedó marcada `@deprecated` para clases individuales, con nota de que sigue siendo válida para paquetes. |
| `packages/shared/src/types/index.ts` | `accepts_mp`/`accepts_transfer` en `Class`. **No hizo falta un tipo nuevo para `method`**: ya existía `PaymentMethod = 'transfer' \| 'mp'` (línea ~311, agregado con la migración 053) y `commission.ts` lo importa. |
| `tests/unit/commission.test.ts` | Reescrito: 23 tests (antes 8). Suite total 146 → **161 tests, todos verdes**. Cubre las 4 filas de la tabla §1.3 en ambas variantes (con/sin plan) con los totales exactos, invariante "el profesor nunca absorbe nada", "transferencia nunca cuesta más que MP", tope de $700, redondeo a peso, y precios `0`/negativo/`NaN`/`Infinity`. |

**Verificación de la migración contra el stack local** (Docker ya estaba levantado; se aplicó con `psql` directo en vez de `db:reset` para no borrar los datos locales existentes):

1. Aplicada dos veces seguidas → idempotente (segunda pasada solo emite `NOTICE ... skipping`).
2. `accepts_mp=false, accepts_transfer=false` → rechazado con `23514 violates check constraint "classes_payment_method_check"` ✅ (el caso que pedía el plan).
3. `accepts_mp=false, accepts_transfer=true` → pasa el CHECK (falla recién en el FK de `teacher_id`, esperado con `profiles` vacío) → la constraint no es demasiado estricta.
4. Insert real (con usuario semilla, en transacción revertida) sin especificar las columnas → ambas quedan en `true`: **confirmado que las clases existentes conservan las dos vías sin backfill**.

⚠️ Nota sobre el stack local: `supabase_migrations.schema_migrations` llega solo hasta `051`, pero el schema **sí tiene** las columnas de 052–060 (se aplicaron a mano en sesiones anteriores sin registrar la versión). `061` se aplicó igual, también sin registrar. No afecta a producción, pero un `db:reset` es la única forma de reconciliar ese historial.

#### Fuera del checklist original, hecho igual (spillover consciente)

El plan autorizaba dejar el typecheck roto o silenciarlo con `as any`. **Se prefirió dejar el árbol verde y correcto**, lo que obligó a tocar 3 archivos de Sesiones 2–3. Todos los cambios son mínimos y en la dirección correcta del modelo nuevo, pero **hay que saber que ya están hechos** para no duplicarlos:

- `api/mercadopago/create-payment/route.ts` → `paymentBreakdown(..., 'mp')`. **Cambia el monto realmente cobrado**: el alumno ahora paga el gross-up (ej. $15.904 en vez de $15.300 para una clase de $15.000 sin plan). Esto es exactamente el bug que motivó el rediseño (antes el profesor perdía silenciosamente la comisión de MP). Se verificó de paso que `marketplace_fee: commission` **sigue siendo el valor correcto** con gross-up: MP descuenta su tasa sobre el total transado, así que `total*(1-r) ≈ base + commission` → al profesor le queda `base` exacto y a DanzClass la comisión. No requiere cambio. Lo que **sí** falta de Sesión 2 sigue pendiente (gate `accepts_mp`, soporte 2x).
- `components/payment/PaymentClient.tsx` (web) y `payment/[enrollmentId].tsx` (mobile) → `paymentBreakdown(..., 'mp')` **+ una línea nueva "Comisión de procesamiento"** en el desglose. La línea extra no era opcional: sin ella el desglose mostraba `Clase + Comisión DanzClass` sumando $15.300 bajo un total de $15.904 — números que no cuadran en una pantalla de dinero. Se corrigió además el copy "Con un plan no pagas comisión" → "…no pagas la comisión de servicio de DanzClass" (con plan **sí** se paga el gross-up de MP; prometer lo contrario es justo lo que §4 pide no hacer).

#### Pendiente / no realizado

- **Nada de Sesión 1 quedó pendiente ni se canceló.**
- La reestructuración real de la UI de pago (dos métodos según `accepts_*`, quitar `canPayByTransfer` como gate, preview de precio en los formularios) sigue **íntegra en Sesión 3**. El estado actual es coherente pero transicional: con plan, la tarjeta grande sigue mostrando el monto de transferencia (`base`) mientras el botón de MP muestra el total con gross-up. No es un error de cálculo, es la UI vieja que aún no distingue métodos.
- `packages/shared/src/types/database.ts` **no se tocó**: ya estaba desactualizado desde antes (no tiene `commission_amount`, `plan_hidden_at`, etc.). El proyecto trabaja con `as any` en las queries; sincronizarlo es deuda preexistente, no de esta feature.
- Typecheck web limpio ✅. Mobile: 21 errores, **todos preexistentes** (shim de lucide / Avatar / StarRating / `any` implícitos) — 0 relacionados con esta sesión.

---

### Sesión 2 — 2026-07-27 (Opus 5) — ✅ COMPLETA

Backend de pago. Todo el checklist de §4/Sesión 2 quedó hecho, más **tres bugs de dinero** que aparecieron al implementarlo (dos de ellos, silenciosos y ya en producción).

#### Completado

| Entregable | Detalle |
|---|---|
| `api/mercadopago/create-payment/route.ts` | Gate `accepts_mp` (400 `mp_not_accepted_for_class`) y **soporte 2x**: se quitó el bloqueo `twox_not_supported`; ahora busca el `class_2x_requests` emparejado del alumno, exige `payment_assignee === userId` (403 `not_payment_turn`) y cobra el **precio 2x** (400 `twox_price_missing` si el profesor no lo configuró — cobrar el individual sería cobrarle a uno lo que cubre a dos). Códigos de error nuevos: `mp_not_accepted_for_class`, `not_payment_turn`, `twox_not_matched`, `twox_price_missing`. |
| `lib/payments.ts` | Refactor: se extrajo `confirmEnrollment()` (estado + QR + notificación + push) y se agregaron `confirmTwoxPartner()` / `unconfirmTwoxPartner()`. **La relación 2x se lee desde la tabla dentro del helper**, así que los tres caminos de confirmación (profesor, IA, webhook MP) heredan el fix sin cambiar sus `select`. No re-notifica a un compañero ya confirmado (idempotente ante reenvíos del webhook) ni resucita a uno `cancelled`. |
| `api/payment/confirm/route.ts` | `reject` y `revert` ahora llaman `unconfirmTwoxPartner`: si un pago 2x se rechaza, el compañero **no puede quedar confirmado** por un pago que ya no vale (vuelve a `pending_payment` y se le revoca el QR). Esto no estaba en el plan; es el reverso obligado del fix de §3. |
| `api/class-2x/match/route.ts` | El `update` que fija `payment_assignee` ya no ignora su error: si falla, borra los dos enrollments recién creados y responde 500. Ignorarlo es lo que mantuvo oculto el bug de la migración 062 (ver abajo). |
| `packages/shared` | `grossUpForMp()` pasa a ser exportada (la necesita el webhook, ver bug 1). Nuevo `twoxClassPrice(cls)` en `pricing.ts` — precedencia `price_2x ?? price_suelta_2x`, la misma que ya usaban `ClassDetailClient` y `FriendsTwoxList`. |
| `supabase/migrations/062_fix_2x_payment_assignee.sql` | Ver bug 3. Idempotente, aditiva, con backfill defensivo. Aplicada y verificada (dos pasadas) contra el stack local. |
| Tests | Unit: 161 → **182** (+21: `twoxClassPrice` y la equivalencia `grossUpForMp(base+commission) === total` para 3 tiers × 6 precios). **Nuevo tipo de test: integración** — `tests/integration/twox-payment.spec.ts` + `playwright.integration.config.ts` + `npm run test:integration`. Importa directo los módulos de servidor y escribe en el stack local Docker; crea usuarios/clase/par 2x reales y los borra al final. |

#### Bugs de dinero encontrados y corregidos (no estaban en el plan)

1. **El webhook habría rechazado TODOS los pagos MP tras el gross-up de la Sesión 1.** `confirmClassPayment()` valida que lo aprobado por MP coincida con lo esperado, y calculaba `esperado = amount + commission_amount`. Pero `payments` guarda el **reparto**, no el total: el gross-up no se persiste. Con el modelo nuevo el alumno paga `$15.904` y la fila dice `15.000 + 300` → mismatch en cada pago → **ninguna inscripción se habría auto-confirmado** (quedaban todas para revisión manual). Fix: el webhook reconstruye el total con `grossUpForMp(amount + commission_amount)`, la misma función y el mismo redondeo que usó `create-payment`. Hay un test unitario que ancla esa equivalencia justamente para que no vuelva a divergir.
2. **`payments.status = 'void'` no existe.** El CHECK de `001_initial_schema.sql` solo permite `('pending','verified','rejected')`, pero **6 sitios** del código escriben `'void'` (`/api/class/enroll`, `/api/class/leave`, el cron `cleanup-classes`…) sin chequear el error → esos updates **fallan en silencio hoy en producción**: al salirse de una clase o re-inscribirse, el pago viejo queda `pending` en vez de anulado, contaminando la lista de "por verificar" del profesor y el cálculo de deudores. **No lo toqué**: es preexistente, ajeno a esta feature, y ampliar el CHECK haría que 6 escrituras hasta hoy inertes empiecen a surtir efecto — hay que revisar antes qué consume `payments.status`. Fix propuesto (una línea) en "Pendiente" más abajo.
3. **`class_2x_requests.payment_assignee` nunca se creó** (migración 062). `002` crea la tabla sin esa columna; `013` la redeclara con `CREATE TABLE IF NOT EXISTS ... payment_assignee ...`, pero como la tabla ya existe Postgres **salta el statement completo** (el `IF NOT EXISTS` es de la tabla, no de las columnas) → la columna no se agrega jamás. Mismo patrón de bug de reproducibilidad que 006 / 035 / 049–051. Consecuencia: `match` escribe el turno de pago y el error se descarta; `transfer-payment` compara contra una columna inexistente/NULL y responde 403 siempre; y el pago 2x por MP de esta sesión no podía funcionar. Se descubrió porque el test de integración ejecuta la query real contra PostgREST. ⚠️ **Verificar en producción** si la columna existe (query en el header de la migración) — si no existe, el 2x lleva roto desde el día uno también ahí.

#### Decisiones tomadas

- **La lógica 2x vive en `lib/payments.ts`, no en cada ruta.** El plan proponía pasar `partner_enrollment_id` desde cada llamador; leerlo dentro del helper evita tres `select` distintos que se pueden desincronizar y hace que cualquier camino futuro de confirmación herede el comportamiento.
- **`create-payment` rechaza el 2x sin precio configurado** en vez de caer al precio individual (que es lo que hace hoy la pantalla de pago por transferencia, con un banner de advertencia). Cobrar por MP el precio de uno cuando el pago cubre a dos es un error de dinero irreversible; el aviso de la UI ya existe.
- **No se tocó la UI de pago** (sigue `showMp = teacherMpConnected && !is2x`, sin gate `accepts_mp`). Habilitar MP para 2x en la pantalla sin el gate por clase mostraría el botón en clases con `accepts_mp=false` y el alumno chocaría con un error del backend. Va completo en Sesión 3. Lo único que se tocó fue el **mapa de mensajes de error** (web + mobile) para los códigos nuevos.

#### Pendiente / anotado para próximas sesiones

- **Sesión 3 hereda todo el trabajo de UI**, ahora con el backend listo: el botón MP para 2x (`showMp = cls.accepts_mp && teacherMpConnected && (!is2x || esMiTurno)`) ya tiene endpoint que lo soporta.
- **`PaymentClient` usa solo `cls.price_2x`** para el monto 2x, ignorando `price_suelta_2x` → en una clase periódica con 2x de sesión suelta muestra el precio individual con el banner de "el profesor no configuró precio 2x". Ya existe el helper `twoxClassPrice()` que resuelve la precedencia; **aplicarlo en web y mobile en la Sesión 3** para que la pantalla y el cobro por MP coincidan.
- ✅ **`payments.status='void'`** (bug 2): **resuelto en la sesión de cierre de deuda técnica del 2026-07-28** (migración `064_payments_void_status.sql`, ver §8). Al revisar los consumidores antes de habilitar el valor se encontró un bug adicional no anticipado aquí: 3 de los 6 sitios que escriben `status='void'` excluían `status IN ('confirmed','void')` de la anulación — pero `'confirmed'` nunca es un valor válido de `payments.status` (es un valor de `enrollments.status`, confundido al escribir el filtro), así que la exclusión era un no-op y habría anulado pagos ya `verified` la primera vez que el write funcionara. Corregido a `'verified'` en los 3 sitios (`enroll/route.ts` + 2 en `cleanup-classes.ts`) antes de habilitar el CHECK.
- ✅ **`class_2x_requests` permite duplicados por usuario+clase.** **Resuelto** en la misma sesión (migración `063_fix_2x_requests_rls_and_dedup.sql`): dedup defensivo + índice único parcial `(user_id, class_id) WHERE status <> 'cancelled'`.
- ✅ **La tabla también quedó con dos juegos de policies RLS** — la fuga de lectura (cualquier autenticado veía todas las solicitudes 2x) **se cerró** en la misma migración `063`, eliminando la policy permisiva de `013` y las 3 policies duplicadas (INSERT/UPDATE/DELETE, funcionalmente idénticas a las de `002`).
- **Refunds/chargebacks** siguen sin revertir la inscripción (deuda ya conocida de la Fase 1–5 original, sin tocar). Con 2x ahora son dos inscripciones a revertir.
- Typecheck web limpio ✅. Mobile: 21 errores, los mismos preexistentes de la Sesión 1. 182 unit tests + 1 test de integración, todos verdes.

---

### Sesión 3 — 2026-07-27 (Opus 5) — ✅ COMPLETA

UI de las dos vías de pago, en web y mobile. Todo el checklist de §4/Sesión 3 quedó hecho salvo la prueba manual en navegador con sesión real (requiere login/sandbox: es la Sesión 5). Aparecieron **tres defectos** que la reescritura destapó, dos de ellos preexistentes en producción.

#### Completado

| Entregable | Detalle |
|---|---|
| `components/class/PaymentMethodsField.tsx` (web) + `components/class/PaymentMethodsField.tsx` (mobile) | **Componente nuevo, compartido por los 4 formularios.** Dos checkboxes (MP / transferencia), MP deshabilitado con link a `/profile/payment-info` si el profesor no conectó OAuth, aviso si marca transferencia sin datos bancarios cargados, y **preview de precio en vivo** que recalcula con `paymentBreakdown` mientras el profesor tipea: para el precio principal, el de clase suelta y el 2x muestra "recibes $P" + lo que paga el alumno por cada vía (con plan / sin plan en MP). |
| `payment/PaymentClient.tsx` (web) + `payment/[enrollmentId].tsx` (mobile) | Gating reescrito: `showMp = accepts_mp && teacherMpConnected && esMiTurno`, `showTransfer = accepts_transfer`. **`canPayByTransfer` dejó de usarse en el flujo de clases** (sigue vivo solo para paquetes). El botón MP ya no se oculta en 2x — el backend de la Sesión 2 lo soporta. Desglose de MP con **líneas separadas** para la comisión de servicio de DanzClass y el costo de procesamiento de Mercado Pago. |
| `CreateClassForm` / `EditClassForm` (web) + `class/create.tsx` / `class/[id]/edit.tsx` (mobile) | `accepts_mp`/`accepts_transfer` en el schema zod (web) y en `validate()` (mobile), espejando el CHECK de la 061. Persistidos en el insert/update, con fallback a `accepts_transfer=true` si MP se descarta por falta de conexión. Las pages de crear/editar pasan `mpConnected` y `hasPaymentInfo`. |
| `ClassDetailClient` (web) + `class/[id]/index.tsx` (mobile) | Línea "Pago: Mercado Pago · transferencia" bajo el precio, y bloqueo del CTA "Reservar" cuando no queda ninguna vía viable. |
| `api/class/enroll/route.ts` | Nuevo guard `no_payment_method` (400). Ver defecto 3. |

#### Decisiones tomadas

- **La tarjeta grande de la pantalla de pago dejó de mostrar un "total".** Con las dos vías abiertas y montos distintos, cualquier número único era falso para una de ellas. Ahora muestra **"Precio de la clase"** — que es justamente la invariante del modelo (lo que recibe el profesor con cualquier método) — y **cada bloque de método muestra su propio total**: el botón de MP cobra el gross-up, el bloque de transferencia dice "transfiere exactamente $P, sin cargos adicionales".
- **Comisión de DanzClass y costo de MP van en líneas separadas**, nunca sumadas en un único "cargo por pagar con tarjeta". Es lo que pide §4/Sesión 3 para no facturar como propio un cargo de la pasarela (*surcharging*), y hace verdadero el copy de los planes: con plan se ahorra la comisión de servicio, **no** el gross-up de MP.
- **El botón "Que pague mi compañer@" salió del bloque de transferencia** (web). Estaba anidado ahí dentro, así que en una clase que solo acepta MP el asignado no tenía forma de ceder el turno. Ceder el turno es ortogonal al método de pago.
- **`accepts_mp` marcado no basta**: los cuatro formularios lo persisten como `mpConnected && accepts_mp`, y si eso deja la clase sin vías cae a `accepts_transfer=true`. La constraint de la DB nunca se viola desde la UI.

#### Defectos encontrados y corregidos (no estaban en el plan)

1. **La pantalla de pago mobile no encontraba el emparejamiento 2x del compañero.** Filtraba `.in('user_id', [user.id, enrollData.partner_enrollment_id])` — pero `partner_enrollment_id` es un **id de enrollment**, nunca un `user_id`, así que para el alumno que está del lado `matched_with` la consulta no devolvía nada. Con `twoxRequest = null`, `isMyTurnToPay` cae a `true` por su propio `||`: la pantalla le ofrecía pagar a quien **no** tenía el turno, y ocultaba el aviso "tu compañer@ va a pagar". El backend lo rechaza (403 `not_payment_turn` desde la Sesión 2), pero la UI mentía. Corregido con el mismo `.or(user_id.eq…,matched_with.eq…)` que ya usaba la page web.
2. **`price_suelta_2x` se ignoraba al cobrar un 2x** (deuda anotada en la Sesión 2, ahora saldada). Web y mobile leían `cls.price_2x` a secas: en una clase periódica cuyo 2x es de sesión suelta, mostraban el precio individual con el banner de "el profesor no configuró precio 2x" — y mobile además **persistía ese monto equivocado** en `payments.amount` al subir el comprobante. Ambos usan ahora `twoxClassPrice()`.
3. **Una clase podía quedar sin ninguna vía de pago viable en runtime.** El CHECK de la 061 exige un flag marcado, pero `accepts_mp=true` con el profesor sin OAuth conectado no habilita nada: con `accepts_transfer=false` el alumno reservaba un cupo que no podía pagar. Se cubre en tres capas: CTA bloqueada en el detalle (web + mobile), mensaje explícito en la pantalla de pago, y guard **server-side** `no_payment_method` (400) en `/api/class/enroll`.

#### ⚠️ Orden de despliegue obligatorio — aplicar 061 y 062 ANTES de deployar el código

Detectado en la auditoría de cierre de la Sesión 3. **Deployar este código a producción sin aplicar antes la migración `061` rompe la inscripción y la creación de clases para todo el mundo**, no las degrada: varias rutas nombran las columnas nuevas en un `select`/`insert` explícito y PostgREST responde error de columna inexistente (42703), que el código interpreta como "clase no encontrada".

| Sitio | Qué hace | Si falta la 061 |
|---|---|---|
| `api/class/enroll/route.ts` | `select(... accepts_mp, accepts_transfer)` | La query devuelve `null` → **404 "Clase no encontrada o no disponible" en toda inscripción** |
| `api/mercadopago/create-payment/route.ts` (Sesión 2) | `select(... accepts_mp)` | Ningún pago por MP se puede iniciar |
| Los 4 formularios de clase | `insert`/`update` con `accepts_mp`/`accepts_transfer` | Crear y editar clases falla |

La `062` es igual de bloqueante para el 2x (`payment_assignee`). **Actualizado en la sesión de cierre de deuda técnica (2026-07-28): agregar `063` y `064` a la misma tanda.** `063` (RLS + dedup de `class_2x_requests`) no bloquea nada si falta — el código sigue funcionando con las policies viejas, solo queda la fuga de lectura sin cerrar —, pero `064` (habilita `payments.status='void'`) sí es necesaria para que `/api/class/leave`, `/api/class/enroll` y el cron dejen de fallar en silencio al anular pagos, y para que la categoría "Anulado" de `MyClassesClient`/`my-classes.tsx` tenga sentido (sin ella, cualquier pago que debería anularse queda `pending` como hasta ahora). El orden correcto es: **aplicar 061 + 062 + 063 + 064 en Supabase → recién entonces deployar**. Las 4 son aditivas e idempotentes, así que aplicarlas antes con el código viejo corriendo es inocuo.

#### Pendiente / anotado para próximas sesiones

- ✅ **La transferencia no tenía ruta de servidor** — **resuelto en la sesión de cierre de deuda técnica del 2026-07-28** (§8): nuevo `POST /api/payment/submit-transfer` valida `accepts_transfer`, ownership del enrollment, turno de pago 2x y calcula el monto server-side (mismo patrón que `create-payment`). `PaymentClient.tsx` (web) y `payment/[enrollmentId].tsx` (mobile) ahora solo suben el archivo a Storage desde el cliente y delegan el registro del pago a la ruta.
- ✅ **El preview de precio no cubría `price_suelta_2x`** — **resuelto** en la misma sesión: cuarta fila agregada a `PaymentMethodsField` (web + mobile), cableada en los 4 formularios. El input del campo ya existía en los 4 (`priceSuelta2x`/`setPriceSuelta2x` en mobile, `register('price_suelta_2x')` en web) — solo faltaba pasarlo como prop al preview.
- **QA en navegador con sesión real no se ejecutó**: el dev server local solo permite verificar rutas públicas sin login. Los cuatro formularios y las dos pantallas de pago quedan cubiertos por typecheck + los tests existentes, pero la verificación visual (dark mode, dos vías activas, preview actualizándose al tipear) va en la Sesión 5.
- **`/plans` todavía no menciona el beneficio real** ("sin comisión de servicio de DanzClass al pagar con Mercado Pago"). Es un ítem de la Sesión 4, no se adelantó.
- Typecheck web limpio ✅. Mobile: 21 errores, los mismos preexistentes de las Sesiones 1–2 (shim de lucide / Avatar / StarRating / `any` implícitos), 0 en los archivos nuevos. **182 unit tests + 1 test de integración, todos verdes** (no se agregaron tests: esta sesión no introdujo lógica pura nueva, el preview usa `paymentBreakdown`, que ya está cubierto).

---

### Sesión 4 — 2026-07-27 (Sonnet 5) — ✅ COMPLETA

Copy legal y de planes. Checklist de §4/Sesión 4 completo. Sesión liviana de redacción, sin cambios de lógica — cero riesgo de romper cálculos (el gross-up y la comisión no se tocaron, solo se describen con precisión).

#### Completado

| Entregable | Detalle |
|---|---|
| `apps/web/src/app/terms/page.tsx` §6 (ES+EN) | Reescrita para reflejar el modelo por-clase: intro nueva ("el profesor decide, para cada clase, cuáles vías acepta"), transferencia ya no dice "solo para estudiantes con plan activo", nuevo párrafo ancla ("el profesor recibe siempre el 100%") y los dos costos que puede pagar el alumno separados en su propia lista — **costo de procesamiento de Mercado Pago** (aplica a cualquier alumno que pague por esa vía, con o sin plan) vs. **comisión de servicio DanzClass** (2%, tope $700, solo sin plan + MP) — con un párrafo aparte reforzando que transferencia no tiene cargo para nadie. Ajustado también el párrafo de impuestos para aclarar que el costo de procesamiento de MP no es ingreso de DanzClass (pasa íntegro a Mercado Pago) — antes el texto solo mencionaba la comisión, lo cual ya no bastaba para describir de qué se compone el monto que ve el alumno. `LAST_UPDATED_ES`/`LAST_UPDATED_EN` actualizadas a 27 de julio de 2026. |
| `apps/web/src/app/privacy/page.tsx` | **Revisada, sin cambios.** La sección de datos de pago (ES ~L96/109/119, EN ~L226/239/249) ya describía el procesamiento por Mercado Pago y la comisión sin condicionarlo al plan del alumno en ningún punto — era compatible con el modelo nuevo desde antes de esta sesión. |
| `packages/shared/src/types/index.ts` — `SUBSCRIPTION_PLANS` | Nuevo bullet en el plan Básico: `'Sin comisión de servicio al pagar clases con Mercado Pago'`. No se agregó al plan Pro porque ya hereda vía el bullet existente `'Todo lo del plan Básico'`. Redacción deliberadamente literal al beneficio real (comisión de **servicio**) — nunca "sin cargos de Mercado Pago", porque el gross-up de procesamiento de MP sigue aplicando con cualquier plan. Este array alimenta directamente `apps/web/src/app/(app)/plans/page.tsx` (no requirió tocar la page). |
| `apps/mobile/app/(app)/plans/index.tsx` | Mismo bullet agregado al array `PLANS` local (mobile mantiene su propia copia duplicada de los planes, deuda técnica preexistente y ya documentada — no es parte de esta sesión resolverla). |

#### Decisiones tomadas

- **No se tocó `/plans/page.tsx` (web) ni el footer de ninguna de las dos pantallas de planes.** El plan solo pedía la línea de beneficio en la lista de features, que ya se renderiza automáticamente desde el array; agregar además una nota de footer sobre el gross-up habría sido explicar dos veces lo mismo en la misma pantalla.
- **El bullet va solo en Básico, no repetido en Pro.** Pro ya incluye `'Todo lo del plan Básico'` como su primer ítem — duplicar el texto sería ruido, no claridad.
- **`/privacy` se dejó intacta a propósito** en vez de tocarla "por las dudas": el texto existente ya no hace ninguna afirmación que el modelo nuevo vuelva falsa (no dice "solo para estudiantes con plan" en ningún lugar de la sección de pagos). Editar sin necesidad habría sido riesgo de introducir un error donde no lo había.

#### Pendiente / anotado para próximas sesiones

- **Este texto legal sigue siendo borrador, no verificado por un abogado chileno** — mismo estado que el resto de `/terms` desde la Fase 1–5 original. No se resuelve en código; es una gestión del usuario antes de anunciar la feature públicamente.
- **Sesión 5 (QA con sandbox de Mercado Pago) es la única pendiente del documento.** No es autónoma: necesita cuentas de prueba comprador/vendedor de MP que solo el usuario puede crear. Incluye además la verificación visual en navegador que las Sesiones 1–3 no pudieron hacer (dark mode, las dos vías activas a la vez, preview de precio actualizándose al tipear).
- Recordatorio heredado de la Sesión 3, todavía sin resolver: **aplicar las migraciones `061` y `062` en Supabase producción antes de deployar** cualquier código de este plan (ver la advertencia de orden de despliegue en el registro de la Sesión 3).
- Typecheck web limpio ✅ (`npm run typecheck --workspace=apps/web`). **182 unit tests, todos verdes** — no se agregaron tests (sesión de solo copy, sin lógica nueva). No se corrió typecheck de mobile en esta sesión (el archivo tocado es un array de literales de string, sin superficie de tipos nueva).

---

### Sesión de cierre de deuda técnica — 2026-07-28 (Sonnet 5) — ✅ COMPLETA

No es una de las 5 sesiones numeradas del plan original: el usuario pidió dedicar una sesión completa a cerrar **todo cabo suelto y bug sin resolver** que las Sesiones 2–3 habían dejado anotado (la Sesión 5 es manual y el usuario prefirió no dejar deuda evitable esperándola). Cuatro ítems cerrados, todos con la migración/código aplicado y verificado contra el stack local; ninguno requiere sandbox de MP.

#### Completado

| Entregable | Detalle |
|---|---|
| `supabase/migrations/063_fix_2x_requests_rls_and_dedup.sql` | Cierra la fuga de lectura de `class_2x_requests` (`013_2x_requests.sql` dejó activa, sin saberlo, la policy `"Auth users can view 2x requests"` — cualquier autenticado, además de la restrictiva `2x_select` de `002`; al evaluarse con OR mandaba la permisiva) y el agujero de duplicados (`UNIQUE(user_id, class_id, session_id)` de `002` no restringe nada porque `session_id` es siempre NULL). Dedup defensivo (conserva la fila `matched` o la `looking` más reciente) + índice único parcial `(user_id, class_id) WHERE status <> 'cancelled'`. Verificado contra el stack local: idempotente, dos inserts activos para la misma clase chocan con `23505`, y cancelar + volver a buscar 2x funciona sin bloqueo. |
| `supabase/migrations/064_payments_void_status.sql` | Habilita `payments.status='void'`, que 6 sitios del código ya escribían sin que nunca funcionara (`payments_status_check` de `001` solo permitía pending/verified/rejected). Antes de habilitarlo se encontró y corrigió un bug de dinero que este fix por sí solo habría introducido: ver más abajo. |
| `apps/web/src/app/api/class/enroll/route.ts`, `apps/web/src/app/api/cron/cleanup-classes/route.ts` (×2) | Bug encontrado al auditar el impacto de habilitar `'void'`: estos 3 sitios excluían de la anulación `status IN ('confirmed','void')`, pero `'confirmed'` **nunca** es un valor de `payments.status` (confusión con `enrollments.status`) — la exclusión era un no-op. Sin corregirlo, la primera vez que el `UPDATE ... status='void'` funcionara habría anulado silenciosamente pagos ya `verified` (cobros reales y cerrados) cada vez que un alumno se reinscribiera tras salir de una clase que había pagado — corrompiendo retroactivamente el panel Financiero y el de conciliación. Corregido a `'verified'`, igual que ya hacían los otros 2 sitios del mismo archivo (`cleanup-classes.ts` líneas 284/318, que sí estaban bien). |
| `MyClassesClient.tsx` (web) + `my-classes.tsx` (mobile) | Nueva categoría "Anulado" (`void`) en `PAYMENT_PILL`/`PAYMENT_PILL_COLORS` y en las 3 funciones de clasificación por archivo (`paymentStatusLabel`/`getStatusKey`/`exportTeacherCSV` en web; `getPaymentKey` + los dos usos inline en mobile) — sin esto, un pago recién anulable habría seguido cayendo en "Pendiente" (cualquier fila de `payments` no rechazada se agrupaba ahí antes de este fix). |
| `apps/web/src/app/api/payment/submit-transfer/route.ts` (nuevo) | El `INSERT`/`UPDATE` de `payments` + `UPDATE` de `enrollments` al subir un comprobante de transferencia salía directo del cliente (RLS lo permitía al dueño del enrollment) — `accepts_transfer=false` solo se hacía cumplir ocultando el bloque en la UI. Nueva ruta, mismo patrón que `/api/mercadopago/create-payment`: valida `accepts_transfer` de la clase, ownership del enrollment, turno de pago si es 2x (`payment_assignee`), y calcula el monto server-side (`effectiveClassPrice`/`twoxClassPrice`) en vez de confiar en el cliente. `PaymentClient.tsx` (web) y `payment/[enrollmentId].tsx` (mobile) ahora solo suben el archivo a Storage (necesitan los bytes) y delegan el registro del pago a esta ruta. |
| `PaymentMethodsField.tsx` (web + mobile) | Preview de precio ganó una cuarta fila para `price_suelta_2x` (2x de una sesión suelta dentro de una clase periódica) — antes cubría el precio principal, `price_suelta` y `price_2x`, pero no esta cuarta combinación. Cableado en los 4 formularios de clase (`CreateClassForm`/`EditClassForm` web, `class/create.tsx`/`class/[id]/edit.tsx` mobile); el campo de input ya existía en los 4, solo faltaba pasarlo como prop al preview. |
| `TwoxRequestButton.tsx` (web) + `class/[id]/index.tsx` (mobile) | Manejo de error agregado en la creación de una solicitud 2x: antes, si el insert chocaba contra el nuevo índice único (usuario con una búsqueda ya activa para esa clase) o fallaba por cualquier otra razón, el error se descartaba en silencio y el botón simplemente no cambiaba de estado sin explicación. Ahora muestra un mensaje inline (web) / `Alert` (mobile). |

#### Verificación

Todo contra el stack local Docker (`supabase_db_DanzClass`), sin tocar producción:

- Migraciones `063` y `064` aplicadas dos veces cada una → idempotentes.
- `063`: probado con datos sintéticos en una transacción revertida — segundo insert activo duplicado choca con `23505`; tras cancelar el primero, un nuevo insert activo pasa sin problema; policies resultantes en `class_2x_requests` son exactamente las 4 de `002` (`2x_select`, `2x_insert_own`, `2x_update_own`, `2x_delete_own`), sin la permisiva de `013`.
- `064`: constraint verificado con `pg_get_constraintdef` — incluye `'void'`.
- `npm run typecheck --workspace=apps/web` limpio.
- `npm run test:unit`: **182/182 verdes** (sin tests nuevos — esta sesión no tocó lógica de cálculo, solo gating/clasificación/UI).
- `npm run test:integration`: el spec de 2x sigue verde (no se tocó `lib/payments.ts` ni el flujo de confirmación).
- `npx tsc --noEmit` en `apps/mobile`: **21 errores, exactamente los mismos preexistentes** documentados en sesiones anteriores (shim de lucide / Avatar / StarRating), 0 nuevos.
- QA visual en navegador **no se hizo** (requiere sesión real, igual que el resto de la UI de esta feature) — queda para la Sesión 5, igual que ya estaba anotado.

#### Fuera de esta sesión, deliberadamente no tocado

- **Verificar si `class_2x_requests.payment_assignee` (migración `062`) ya existe en producción** — sigue pendiente, requiere acceso a producción que esta sesión no tiene. Query en el header de `062`.
- **Revisión legal chilena de `/terms`** — sigue como borrador, sin cambios en esta sesión.
- **QA con sandbox de Mercado Pago (Sesión 5)** — sin cambios, sigue siendo la única pendiente que requiere al usuario.
- Con esto, **no queda ningún ítem de "pendiente/anotado" abierto en los registros de las Sesiones 2 y 3** salvo los que explícitamente requieren producción o al usuario.
