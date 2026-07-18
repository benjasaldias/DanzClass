# Marketplace Payments — Plan e implementación (Mercado Pago split)

> Documento de handoff para continuar el desarrollo del pago in-app con comisión.
> Estado a la fecha: **Fases 1–5 COMPLETAS** (código). Lo único pendiente para producción: **(1) probar F1–F4 con cuentas sandbox de Mercado Pago** (§5), y **(2) revisión legal chilena del ToS/tributario** (§6, es borrador). El usuario ya registró el Redirect URI en el panel de MP con scopes read/offline access/write/Application&User API's/Online Preferences.
> Última actualización: sesión 2026-07-18.

---

## 1. Objetivo de negocio

Un alumno **sin plan/suscripción** puede inscribirse en clases pagando **in-app por Mercado Pago**. DanzClass retiene una **comisión del 2% con tope de $700 CLP** y el resto se liquida al profesor. La comisión desaparece si el alumno tiene plan (básico o superior).

**Dos opciones de pago** conviven:

| Opción | Disponible para | Comisión |
|---|---|---|
| **A. Mercado Pago in-app** (con split) | Todos (si el profesor conectó su cuenta MP) | 2% tope $700 solo si el alumno **no tiene plan** |
| **B. Transferencia directa** al profesor (comprobante + confirmación manual) | **Solo alumnos con plan** (básico+) — bloqueada para sin-plan | — |

## 2. Decisión de arquitectura: **Mercado Pago Marketplace / split (OAuth)**

Elegida sobre "recaudar todo y liquidar después" **por el tema tributario**: con split, MP divide el pago **en origen** — el profesor recibe el precio de la clase directo en **su** cuenta MP conectada, y DanzClass recibe solo la comisión (`marketplace_fee`). La plata del profesor **nunca entra legalmente a la cuenta del dueño**, así que el SII grava solo la comisión, no el flujo bruto. **No hay tabla de payouts ni liquidación manual.**

Cada profesor conecta su cuenta MP vía **OAuth (Mercado Pago Connect)**. El pago del alumno se crea con el **access_token del profesor** + `marketplace_fee`.

### Semántica de montos (CRÍTICA — no romper)

- `payments.amount` = **base** = precio de la clase = **lo que recibe el profesor**. (El panel Financiero suma `payments.amount` como ingreso del profe; debe seguir correcto.)
- `payments.commission_amount` = comisión que retiene DanzClass (0 en transferencia y para alumnos con plan).
- **Total cobrado al alumno** (solo MP) = `amount + commission_amount` = también el `marketplace_fee` enviado a MP.

## 3. Setup del usuario (Mercado Pago + Supabase)

- ✅ `MERCADOPAGO_CLIENT_ID` y `MERCADOPAGO_CLIENT_SECRET` en Vercel + `apps/web/.env.local`.
- ✅ Migraciones `052` y `053` aplicadas en producción.
- ⚠️ **Registrar Redirect URI** en el panel de la app de Mercado Pago (Developers → tu app → Redirect URIs), exacto:
  - `https://danzclass.com/api/mercadopago/oauth/callback`
  - `https://dc-project-web.vercel.app/api/mercadopago/oauth/callback`
  - (MP suele rechazar `http://localhost` — probar el flujo OAuth en el deploy de Vercel.)
- Reutiliza `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` ya existentes (de suscripciones).

---

## 4. Lo implementado

### Helpers compartidos — `packages/shared/src/lib/commission.ts`
- `platformCommission(amount)` → 2% redondeado a peso entero, tope $700, 0 si inválido.
- `paysCommission(tier)` → true solo para `'none'`.
- `canPayByTransfer(tier)` → true solo con plan (`!== 'none'`).
- `paymentBreakdown(amount, tier)` → `{ base, commission, total }`.
- Tests: `tests/unit/commission.test.ts` (9, pasan). Tipo `Payment` + `PaymentMethod` en `packages/shared/src/types/index.ts`.

### Migraciones
- **`052_teacher_mp_connections.sql`** — tabla `teacher_mp_connections` (`teacher_id` PK, `mp_user_id` UNIQUE, `access_token`, `refresh_token`, `public_key`, `scope`, `live_mode`, `expires_at`) con **RLS ON sin policies** (solo service role, patrón `app_settings`). Columna pública `profiles.mp_connected BOOLEAN` para gatear el botón de pago sin exponer tokens.
- **`053_payment_marketplace_fields.sql`** — en `payments`: `payment_method` (`'transfer'|'mp'`, default `'transfer'`), `commission_amount INTEGER` (default 0), `mp_payment_id TEXT`, `mp_status TEXT`, + **índice único parcial** `payments_mp_payment_id_key` (idempotencia del webhook).

### Fase 1 — OAuth Connect de profesores
- `apps/web/src/lib/mercadopago/oauth.ts`:
  - `signState(userId)` / `verifyState(state)` — HMAC con `MERCADOPAGO_CLIENT_SECRET`, TTL 10 min (CSRF sin store).
  - `buildAuthorizeUrl(state)` → `https://auth.mercadopago.com/authorization?...`
  - `exchangeCodeForToken(code)` → POST `https://api.mercadopago.com/oauth/token`.
  - `getRedirectUri()` → `${APP_URL}/api/mercadopago/oauth/callback`.
- Rutas:
  - `GET /api/mercadopago/oauth/connect` — valida `canTeach`, redirige a MP.
  - `GET /api/mercadopago/oauth/callback` — verifica state (+ cookie match), intercambia el code, upsert tokens (admin client), `mp_connected=true`. Maneja `23505` (cuenta MP ya vinculada a otro profe → `?mp=account_in_use`).
  - `POST /api/mercadopago/oauth/disconnect` — borra tokens + `mp_connected=false` (Bearer + cookie).
- UI: `apps/web/src/components/profile/MpConnectCard.tsx` (Conectar/Desconectar + banner por `?mp=` status), montado en `apps/web/src/app/(app)/profile/payment-info/page.tsx` dentro de `<Suspense>`.

### Fase 2 — Campos de pago (ver migración 053 arriba).

### Fase 3a — WEB: creación de pago + UI dos-opciones
- **`/api/class/enroll`** — se quitó el gate `canEnroll`; **la inscripción es abierta a cualquier autenticado**. El tier decide método/comisión en el pago, no la inscripción.
  - ⚠️ `canEnroll()` en shared **sigue** devolviendo false para `'none'` — aún se usa en **paquetes** (`/api/packages/[id]/enroll`), **2x** y **mobile paquetes**. No se tocó; paquetes/2x siguen siendo solo-plan por ahora.
- **`/api/mercadopago/create-payment`** (POST `{ enrollmentId }`) — el core del split:
  - Auth (Bearer+cookie). Verifica pertenencia del enrollment + estado ≠ confirmed. Rechaza 2x (`twox_not_supported`).
  - Busca `teacher_mp_connections.access_token` del profe → si no hay, `teacher_not_connected` (400).
  - Monto **autoritativo server-side**: `paymentBreakdown(cls.price, getActiveTier(userId))`.
  - Crea preferencia Checkout Pro con `new MercadoPagoConfig({ accessToken: <token del profe> })` + `marketplace_fee: commission` (SDK `mercadopago@2.12.0` soporta `marketplace_fee?: number`).
  - `external_reference = 'enrollment:<enrollmentId>'`. `notification_url = ${appUrl}/api/mercadopago/webhook?seller=<teacherId>` (el `seller` es para que la Fase 4 lea el pago con el token correcto).
  - `back_urls`: success/pending → `/class/[id]?mp=ok|pending`, failure → `/payment/[id]?mp=failed`. `auto_return: 'approved'`.
  - Registra/actualiza `payments`: `payment_method='mp'`, `amount=base`, `commission_amount`, `status='pending'`, `recipient_teacher_id`, `scan_status='skipped'`. Devuelve `{ init_point, breakdown }`.
- **`payment/[enrollmentId]/page.tsx`** — pasa `tier` (getActiveTier) + `teacherMpConnected` (`teacher.mp_connected`) a `PaymentClient`.
- **`PaymentClient.tsx`** (web) — reescrito:
  - Card de monto con desglose (Clase + Comisión = Total) cuando `commission > 0`.
  - **Opción MP** (si `teacherMpConnected && !is2x`): botón `#009EE3` → `create-payment` → `window.location = init_point`.
  - **Opción transferencia**: gateada por `canPayByTransfer(tier)`. Sin plan = card bloqueada con CTA `/plans`. Edge sin-plan + profe-sin-MP = mensaje "no hay vía de pago".
  - Preserva 2x, comprobante, magic-bytes. El resubmit de comprobante resetea también los campos MP a `transfer`.
- **`ClassDetailClient.tsx`** — la CTA ya no muestra "Obtener plan" para sin-plan; cualquiera autenticado ve "Reservar cupo". (`canUserEnroll` sigue gateando paquetes y 2x.)

### Fase 3b — MOBILE
- **`app/(app)/class/[id]/index.tsx`** — `handleEnroll` sin el gate `canEnroll` (Alert eliminado); botón siempre "Reservar lugar". (`canEnroll(tier)` sigue en paquetes.)
- **`app/(app)/payment/[enrollmentId].tsx`** — paridad con web:
  - Fetch de `tier` (subscriptions) + `teacherMpConnected` (`cls.teacher.mp_connected`).
  - `handleMpPay` → `WEB_URL/api/mercadopago/create-payment` con Bearer → `WebBrowser.openBrowserAsync(init_point)` → `router.back()`.
  - Card de monto con desglose; opción MP (botón `#009EE3`); secciones de transferencia gateadas por `allowTransfer`; card bloqueada sin plan con CTA planes. `submitPayment` marca `payment_method='transfer'` y resetea campos MP en reenvío.

---

## 5. ✅ Fase 4 — Webhook (HECHO — el loop de confirmación)

Archivo: `apps/web/src/app/api/mercadopago/webhook/route.ts`. Typecheck limpio; camino de escritura validado contra el schema real en la DB local (pago→verified, enrollment→confirmed, notificación insertada, idempotencia OK).

**Lo implementado:**

1. **Selección de token en la rama `if (eventType === 'payment')`**: se lee `seller` del query string (`url.searchParams.get('seller')`, puesto por `create-payment` en el `notification_url`). Si hay `seller` → se busca `teacher_mp_connections.access_token` y se lee el pago con `new MercadoPagoConfig({ accessToken: <token profe> })` (el pago del split vive en la cuenta del profe). Si no → token de plataforma (suscripciones). El `Payment.get()` va en **try/catch** (devuelve 200 ante fallo, no gatilla reintentos infinitos).

2. **Ramas por `external_reference`**: si empieza con `enrollment:` → `confirmClassPayment()`; si no → lógica de suscripción existente (intacta).

3. **`confirmClassPayment(supabase, payment, ref)`** (helper nuevo en el mismo archivo):
   - Parsea `enrollmentId`. Busca el `payments` row por `enrollment_id` (creado como `pending` en create-payment).
   - **No aprobado** (pending/in_process/rejected/…) → solo persiste `mp_status`, no confirma.
   - **Idempotencia** → si el row ya está `status='verified'` con el mismo `mp_payment_id`, no re-notifica.
   - **Aprobado** → llama a `autoConfirmPayment({ ..., confirmedBy: null, mp: { paymentId, status } })` (helper compartido en `apps/web/src/lib/payments.ts`, el mismo que usan `/api/payment/confirm` y `/api/payment/scan`). Eso hace: `payments` → `status='verified'` + `verified_at`/`confirmed_at` + `mp_payment_id`/`mp_status`; `enrollments` → `status='confirmed'`; notificación **`payment_confirmed`** al alumno + push (best-effort).
   - **`confirmed_by` queda `null`** (el CHECK es `('ai','teacher','admin')`; MP se distingue por `payment_method='mp'` + `mp_payment_id`). Se optó por NO tocar el schema.

4. **`autoConfirmPayment`** (en `lib/payments.ts`) se extendió: `confirmedBy: 'teacher' | 'ai' | null` + `mp?: { paymentId, status }` opcional. Retrocompatible con los dos callers existentes.

**Pendiente de probar (requiere setup del usuario):** end-to-end con **cuentas sandbox de Mercado Pago** — comprador de prueba + cuenta vendedor de prueba conectada por OAuth. Verificar que: (a) el pago se aprueba y el webhook confirma la inscripción, (b) el split deja el `marketplace_fee` en la cuenta de la plataforma y el resto en la del profe, (c) la firma del webhook valida para pagos de marketplace (el `?seller=` extra **no** afecta el manifest, que usa `data.id`/`request-id`/`ts`).

### Deudas conocidas de F4 (post-MVP)
- **Refunds/chargebacks** (`payment.status` = `refunded`/`charged_back`) → no se revierte la inscripción todavía. Anotado para después.
- **Pantalla de éxito** (`/class/[id]?mp=ok`) podría mostrar un banner "procesando" mientras el webhook confirma (opcional, patrón `SubscriptionPolling` de plans). Hoy simplemente vuelve a la clase; la confirmación aparece cuando el webhook procesa.

---

## 6. ✅ Fase 5 — ToS / legal / conciliación (HECHO)

- **ToS** (`apps/web/src/app/terms/page.tsx`, ES+EN): **sección 6 reescrita** ("Pagos, comisiones y reembolsos" / "Payments, commissions, and refunds"). Cubre las dos vías de pago (in-app MP con split vs transferencia solo-plan), la comisión 2% tope $700, que **DanzClass no custodia fondos** (split en origen, MP liquida a cada parte), el encuadre tributario (el profe tributa por sus clases, DanzClass solo por la comisión), responsabilidad del profe de conectar una cuenta MP válida, y reembolsos (manuales por ahora). No se renumeraron las demás secciones (se expandió la 6 existente).
- **Privacidad** (`apps/web/src/app/privacy/page.tsx`, ES+EN): actualizados los bullets de datos de pago (sección 2), uso de datos (sección 3) y terceros (sección 4) — Mercado Pago ahora procesa suscripciones **y** pagos de clase in-app (marketplace/split); se guardan los **access/refresh tokens** de la conexión MP del profesor (no sus credenciales) + identificadores de pago y montos de comisión para registro/tributación.
- **Panel de conciliación** (superadmin): nueva pestaña **"Conciliación"** en `/admin?tab=reconciliation` (`components/admin/AdminReconciliationClient.tsx`). Suma `commission_amount` (ingreso tributable de DanzClass) y `amount` (base liquidada a profes) de `payments WHERE payment_method='mp' AND status='verified'`, con desglose por mes y por profesor. Query validada en local (excluye transferencias/no-verified, sumas correctas).

⚠️ **El texto legal es un borrador razonable, NO asesoría legal verificada.** Antes del lanzamiento público del pago in-app, que un **abogado/contador chileno** revise: el encuadre de "intermediario de recaudación" vs institución de pago, el tratamiento tributario (que el SII efectivamente grave solo la comisión bajo este modelo de split), y la cláusula de responsabilidad/reembolsos.

### Deuda de F5 (post-MVP)
- **Encargado de tratamiento** (Ley 21.719, vigente 01-dic-2026): contrato con MP como proveedor + garantías de transferencia internacional de datos. Pendiente cuando aplique.
- **Retención de tokens MP**: no hay cron que purgue `teacher_mp_connections` de profes que desconectan (el disconnect sí borra la fila; falta política de retención formal).

---

## 7. Estado / gating actual (resumen rápido)

- **Inscripción**: abierta a todos en **web** (`/api/class/enroll` + `ClassDetailClient`) y **mobile** (`class/[id]/index.tsx`). Paquetes y 2x siguen solo-plan.
- **Pago sin plan**: solo MP (transferencia bloqueada). **Pago con plan**: MP (comisión 0) o transferencia.
- **Profe sin MP conectado**: no aparece opción MP; sin-plan ve mensaje de que necesita plan o que el profe conecte MP.
- **Confirmación MP**: **automática vía webhook** (F4 hecha) — al aprobarse el pago, la inscripción pasa a `confirmed` y el alumno recibe notificación `payment_confirmed`. Transferencia igual que antes (flujo manual del profe). Falta validarlo con sandbox de MP.

## 8. Archivos tocados (índice)

```
packages/shared/src/lib/commission.ts                         (nuevo)
packages/shared/src/index.ts                                  (export)
packages/shared/src/types/index.ts                            (Payment + PaymentMethod)
tests/unit/commission.test.ts                                 (nuevo)
supabase/migrations/052_teacher_mp_connections.sql            (nuevo)
supabase/migrations/053_payment_marketplace_fields.sql        (nuevo)
apps/web/src/lib/mercadopago/oauth.ts                         (nuevo)
apps/web/src/app/api/mercadopago/oauth/connect/route.ts       (nuevo)
apps/web/src/app/api/mercadopago/oauth/callback/route.ts      (nuevo)
apps/web/src/app/api/mercadopago/oauth/disconnect/route.ts    (nuevo)
apps/web/src/app/api/mercadopago/create-payment/route.ts      (nuevo)
apps/web/src/components/profile/MpConnectCard.tsx             (nuevo)
apps/web/src/app/(app)/profile/payment-info/page.tsx         (MpConnectCard)
apps/web/src/app/api/class/enroll/route.ts                    (abre inscripción)
apps/web/src/app/(app)/payment/[enrollmentId]/page.tsx       (tier + mp_connected)
apps/web/src/components/payment/PaymentClient.tsx             (dos opciones)
apps/web/src/components/class/ClassDetailClient.tsx           (CTA sin-plan)
apps/mobile/app/(app)/class/[id]/index.tsx                    (abre inscripción)
apps/mobile/app/(app)/payment/[enrollmentId].tsx             (dos opciones)
apps/web/src/app/api/mercadopago/webhook/route.ts             (F4: confirmClassPayment)
apps/web/src/lib/payments.ts                                  (F4: autoConfirmPayment + mp)
apps/web/src/app/terms/page.tsx                               (F5: sección 6 ES+EN)
apps/web/src/app/privacy/page.tsx                             (F5: datos de pago ES+EN)
apps/web/src/components/admin/AdminReconciliationClient.tsx   (F5: panel conciliación)
apps/web/src/app/(app)/admin/page.tsx                        (F5: tab Conciliación)
```

**Pendiente para producción (no es código):**
1. Probar F1–F4 con **cuentas sandbox de Mercado Pago** (§5) — comprador de prueba + vendedor de prueba conectado por OAuth; verificar split, confirmación por webhook y firma.
2. **Revisión legal chilena** del ToS/tributario (§6) — el texto es borrador razonable, no asesoría verificada.
3. (Ya hecho por el usuario) Redirect URI + scopes en el panel de MP; `APP_URL=https://danzclass.com`.
