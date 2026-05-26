# Sesión 3 — Pagos, dinero y suscripciones

> **Objetivo de la sesión:** ningún usuario debe perder un peso ni quedar pagando algo que ya no usa. Validar end-to-end el flujo de Mercado Pago, 2x, descuentos y deudas.

## Instrucciones obligatorias
- Tests en sandbox MP **obligatorios** antes de cerrar la sesión.
- Cualquier cambio en `external_reference` requiere coordinación con el webhook.
- Al terminar, **actualizar `CLAUDE.md`** (especialmente la sección "Integración MP") y **`resumen.md`**.

---

## P-1 — Confirmar env vars críticas en Vercel (P0)

**Hallazgo:**
- `CLAUDE.md` indica todas configuradas, pero la última verificación es de hace varias semanas.
- Variables: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SUPERADMIN_USER_ID`, `APP_URL`, `NEXT_PUBLIC_*`, `NEXT_PUBLIC_CLOUDINARY_*`.

**Acción:**
1. Listar env vars en producción Vercel: `vercel env ls --environment production` o desde el dashboard.
2. Confirmar que `MERCADOPAGO_ACCESS_TOKEN` empieza con `APP_USR-` (producción, no `TEST-`).
3. Si está en TEST, todos los pagos son de juguete — **bloqueante**.
4. Documentar en una tabla la última fecha verificada de cada variable.

**Verificación:**
- Hacer un pago real de Básico ($1.500) → ver cobro en la cuenta MP del usuario admin.

---

## P-2 — Renovación anual no automática (P1)

**Archivos:**
- [apps/web/src/app/api/mercadopago/create-preference/route.ts](../apps/web/src/app/api/mercadopago/create-preference/route.ts)
- [apps/web/src/app/api/mercadopago/webhook/route.ts](../apps/web/src/app/api/mercadopago/webhook/route.ts) — bloque `eventType === 'payment'` con `months = 12`

**Hallazgo:**
- El anual usa `Preference` (pago único), no `PreApproval`. Tras 12 meses no hay re-cobro: el usuario simplemente pasa a `tier='none'`.
- Si el usuario espera renovación automática y no le avisamos, percibe el corte como bug.

**Acción:**
1. **Decisión de producto:** decidir explícitamente si anual es renovable o solo "pago de un año, después renueva manual".
2. Si no renovable: 
   - Notificación `subscription_expiring` 7 días antes de `expires_at`.
   - Email automático (post-alpha si no hay infra de email).
   - Banner en `/profile` "Tu plan vence el DD/MM/YYYY — renovar".
3. Si renovable: migrar a PreApproval anual (MP soporta `frequency_type: 'months', frequency: 12`).

**Verificación:**
- Crear suscripción anual de prueba → manipular `expires_at` a "hoy + 5 días" → ver banner + notificación.

---

## P-3 — Validar consistencia de clase antes de inscribir (P1)

**Archivos:**
- [apps/web/src/app/api/class/enroll/route.ts](../apps/web/src/app/api/class/enroll/route.ts)

**Hallazgo:**
- El endpoint no valida:
  - Clase suelta con `date` en el pasado.
  - Clase periódica con `ends_at` ya vencida.
  - Clase entrenamiento con `requires_audition=true` y el alumno no fue aceptado (debería ser bloqueado).
  - Clase con `audition_closed=true` pero el alumno no fue aceptado.
- El frontend oculta el botón, pero un POST directo a la API podría burlar.

**Acción:**
1. En `/api/class/enroll`:
   - Si `class.type === 'suelta'` y `class.date < today` → 400 `class_expired`.
   - Si `class.type !== 'suelta'` y `class.ends_at < today` y no `ends_indefinitely` → 400 `class_expired`.
   - Si `class.requires_audition`:
     - Verificar que existe `auditions` con `applicant_id === userId` y `status === 'accepted'`.
     - Si no → 403 `audition_required`.

**Verificación:**
- Vía curl: POST `/api/class/enroll` con `classId` de clase vencida → 400.
- POST con clase entrenamiento sin audición aceptada → 403.

---

## P-4 — Sistema 2x: timeout si compañero nunca paga (P2)

**Archivos:**
- [apps/web/src/app/api/class-2x/match/route.ts](../apps/web/src/app/api/class-2x/match/route.ts)
- [apps/web/src/app/api/class-2x/transfer-payment/route.ts](../apps/web/src/app/api/class-2x/transfer-payment/route.ts)

**Hallazgo:**
- Cuando A y B se emparejan, A es `payment_assignee` por default.
- Si A nunca paga (procrastina) y B tampoco transfiere, el enrollment queda en `pending_payment` indefinidamente.
- El cupo está ocupado para terceros (el `class_spots` cuenta `!== cancelled`).

**Acción:**
1. Decidir política de timeout:
   - Si `created_at + 7 días < now` y aún `pending_payment` → cron cancela el enrollment automáticamente.
   - Notifica a ambos: "Tu inscripción 2x fue cancelada por no completar pago en 7 días."
2. Agregar lógica al cron `cleanup-classes` o crear `cleanup-stale-2x`.

**Verificación:**
- Manipular `created_at` de un enrollment 2x → correr cron manualmente → ver cancelación.

---

## P-5 — Descuentos sin notificar al alumno que pagó precio completo (P2)

**Archivos:**
- [apps/web/src/app/api/class/discount/route.ts](../apps/web/src/app/api/class/discount/route.ts)

**Hallazgo:**
- Si un profesor aplica descuento después de que un alumno ya pagó, el alumno no recibe reembolso ni notificación.
- En transparencia, debería:
  - Notificación al alumno con la diferencia.
  - Opción para el profesor de aplicar el descuento solo "a inscripciones futuras".

**Acción:**
1. UI en `DiscountModal`: toggle "Aplicar también a alumnos ya inscritos sin pagar".
2. Si toggle ON: la próxima vez que esos alumnos vean `PaymentClient`, ven el precio nuevo.
3. Para alumnos que ya pagaron: documentar en `/terms` que descuentos no son retroactivos.

**Verificación:**
- Aplicar descuento → alumno con `enrollment.pending_payment` ve precio nuevo en `PaymentClient`.

---

## P-6 — Deuda detection es solo para sueltas pasadas — extender a periódicas (P2)

**Archivos:**
- [apps/web/src/app/api/class/enroll/route.ts](../apps/web/src/app/api/class/enroll/route.ts) líneas finales

**Hallazgo:**
- El "debt check" considera solo sueltas con `date < today`. No considera:
  - Periódicas con `ends_at < today` y enrollments no pagados.
  - Entrenamientos con `billing_day` ya pasado del mes anterior.

**Acción:**
1. Extender el check a periódicas vencidas no pagadas.
2. Para entrenamientos: definir cuándo un mes "está vencido" (probablemente `billing_day + 7 días`).

---

## P-7 — Cancelación de suscripción — comportamiento opaco (P1)

**Archivos:**
- [apps/web/src/app/api/subscriptions/cancel/route.ts](../apps/web/src/app/api/subscriptions/cancel/route.ts)
- [apps/web/src/components/plans/CancelSubscriptionButton.tsx](../apps/web/src/components/plans/CancelSubscriptionButton.tsx)

**Hallazgo:**
- Verificar: al cancelar:
  - ¿Se llama a MP para anular el `PreApproval`?
  - ¿`expires_at` se mantiene (gracia) o se acorta a `now`?
  - ¿La UI le explica al usuario "Tienes acceso hasta DD/MM/YYYY"?

**Acción:**
1. Confirmar (leer el código) que se hace `preApproval.update({ status: 'cancelled' })` en MP.
2. Confirmar que `subscriptions.status='cancelled'` pero `expires_at` no se modifica.
3. UI clara: "Tu suscripción está cancelada — tendrás acceso hasta el DD/MM/YYYY. No se realizarán nuevos cobros."
4. Si el usuario re-suscribe antes del `expires_at`, ¿qué pasa? Documentar el caso.

---

## P-8 — Webhook idempotencia: ¿qué pasa si MP reenvía el mismo evento? (P1)

**Archivos:**
- [apps/web/src/app/api/mercadopago/webhook/route.ts](../apps/web/src/app/api/mercadopago/webhook/route.ts)

**Hallazgo:**
- `activateSubscription` chequea `mp_subscription_id` ya existente → OK para idempotencia de **creación**.
- Pero `subscription_authorized_payment` (renovación mensual) **suma `+ 1 mes` cada vez**. Si MP reenvía el mismo authorized_payment, `expires_at` se extiende doble → cliente paga 1 mes, recibe 2.

**Acción:**
1. Para renovación: guardar el `authorized_payment_id` (id del cobro mensual) en una tabla `subscription_renewals (id, sub_id, mp_payment_id UNIQUE, processed_at)`.
2. Antes de extender `expires_at`, verificar que ese `mp_payment_id` no fue procesado.

**Verificación:**
- Disparar el mismo webhook 2 veces seguidas → solo una extensión.

---

## P-9 — Falta UI/flujo para reembolsos (P2)

**Hallazgo:**
- No hay forma de que el profesor "rechace" un pago tras haberlo confirmado.
- No hay forma de que el alumno solicite reembolso si el profesor canceló la clase.
- Producto puede manejarse externamente (transferencia inversa) por ahora, pero documentarlo.

**Acción:**
1. Documentar en `/terms`: "Los reembolsos se manejan directamente entre alumno y profesor por transferencia bancaria."
2. Botón "Solicitar reembolso" en `EnrolledTab` que abre mailto al profesor.
3. (Post-alpha) Sistema de reembolsos in-app.

---

## P-10 — Monto del pago no se "congela" al momento de la inscripción (P2)

**Hallazgo:**
- `PaymentClient` lee `classData.price` (o `price_2x`) en runtime.
- Si el profesor edita el precio mientras el alumno está en el modal de pago, el alumno ve el nuevo precio sin aviso.

**Acción:**
- Decidir si "el precio congela al inscribirse" (guardar `amount_at_enrollment` en `enrollments`) o "el precio es el actual al momento de pagar".
- Si congelado: agregar columna `enrollments.amount_at_enrollment INTEGER` y migrarla.
- Si actual: añadir disclaimer en el modal "El precio puede haber cambiado desde tu inscripción".

---

## P-11 — Plan free / sin tier no debería poder ver `/plans/success` por error (P2)

**Hallazgo:**
- Si el webhook tarda (caso conocido), el usuario llega a `/plans/success` sin tier aún. La UI puede ser confusa.

**Acción:**
- En `/plans/success`: polling con `setTimeout` cada 2 seg hasta máx 30 seg para detectar que `subscription.tier !== 'none'`.
- Si timeout → mostrar "Tu pago se está procesando. Revisa en unos minutos."

---

## P-12 — Webhook signature: dataId vacío bypasa validación (P1)

**Archivos:**
- [apps/web/src/app/api/mercadopago/webhook/route.ts](../apps/web/src/app/api/mercadopago/webhook/route.ts) — función `verifySignature`

**Hallazgo:**
- Si `data.id` query string está vacío, `manifest = "id=&request-id=...&ts=..."`. Si el atacante crafta una request con ese manifest y firma con un secreto que conoce... no aplica si el secreto está protegido.
- Pero si MP envía un evento sin `data.id` (raro), pasa la validación con manifest vacío. Verificar.

**Acción:**
- Si `dataId === ''` y `eventDataId === ''` → return 400 early.

---

## P-13 — Falta confirmación visual fuerte tras pago aprobado (P2)

**Hallazgo:**
- `PaymentClient` muestra "Comprobante enviado" tras upload, pero el alumno no sabe cuándo el profesor confirmó.
- Notificación `payment_confirmed` se envía, pero ¿el alumno revisa notifications?

**Acción:**
- Tras confirmación del profesor, mostrar banner verde grande en `/my-classes` Tab Tomo: "Tu pago de X fue confirmado — ¡estás dentro!"
- Auto-marcar la notificación como leída al verla.

---

## Reporte de cierre

### ✅ Logrado

| ID | Cambio | Archivo | Test |
|---|---|---|---|

### ⏳ Pendiente

| ID | Razón |
|---|---|

### ❌ Fallado

| ID | Causa | Plan alternativo |
|---|---|---|

### 📌 Acciones del usuario pendientes

- [ ] Verificar `MERCADOPAGO_ACCESS_TOKEN` es de producción (no TEST)
- [ ] Hacer pago real de $1.500 para validar end-to-end
- [ ] Configurar Webhook URL en MP dashboard apuntando a producción
- [ ] (Si aplica) Aplicar migración nueva para `subscription_renewals` o `amount_at_enrollment`

### 📝 Memoria a actualizar

- [ ] `CLAUDE.md` — sección "Integración Mercado Pago" con cualquier nuevo guard
- [ ] `CLAUDE.md` — política de renovación anual decidida
- [ ] `resumen.md` — sesión de pagos
