# Sesión 1 — Bugs críticos y comportamientos frágiles

> **Objetivo de la sesión:** detectar y arreglar comportamientos que **rompen** flujos del usuario en producción. Cero tolerancia con estados inválidos persistentes (datos huérfanos, dinero perdido, UI bloqueada).

## Instrucciones obligatorias
- Reproducir cada bug antes de fixearlo (en dev local o staging).
- Para cada fix, agregar test Playwright en `tests/e2e/` cuando aplique.
- Al terminar la sesión, **actualizar `CLAUDE.md` y `resumen.md`**.
- Completar el reporte de cierre al final del archivo.

---

## C-1 — `/api/class/leave` cancela enrollment sin contemplar pagos pendientes (P1)

**Archivo:** [apps/web/src/app/api/class/leave/route.ts](../apps/web/src/app/api/class/leave/route.ts)

**Hallazgo:**
- El endpoint cancela el enrollment y notifica al primero en lista de espera, pero **no toca el registro de `payments`** asociado.
- Si el alumno tenía un `payment` con `status='pending'` o `submitted` y se sale, el pago queda huérfano en DB sin estado limpio.
- Peor: si el alumno se re-inscribe (upsert de `/api/class/enroll`) reactiva la fila `cancelled` a `pending_payment` y puede haber un `payment` previo asociado con monto distinto al de hoy (si la clase cambió de precio o aplicó descuento).

**Riesgo:**
- Contabilidad del profesor en `/my-classes/historial` muestra pagos de clases que el alumno ya no toma.
- Doble cobro si el profesor confirma manualmente el pago viejo.

**Acción:**
1. En `/api/class/leave`: al cancelar enrollment, marcar el payment asociado más reciente como `cancelled` o `void` (sin borrar — auditoría).
2. En `/api/class/enroll` al re-inscribir un enrollment cancelado, **borrar la referencia al payment anterior** y forzar nuevo flujo de pago.
3. Auditar `MyClassesClient` tab Historial para que pagos `void` se rendericen distinto (gris, "cancelado por baja").

**Verificación:**
- Alumno A se inscribe → sube comprobante (`payment_submitted`) → sale → vuelve a inscribirse. Resultado esperado: estado fresco, payment anterior visible solo en historial como "cancelado".

---

## C-2 — Cupos calculados en cliente divergen de `class_spots` (P1)

**Archivos:**
- [apps/web/src/components/feed/ClassCard.tsx](../apps/web/src/components/feed/ClassCard.tsx)
- [apps/mobile/components/feed/MobileClassCard.tsx](../apps/mobile/components/feed/MobileClassCard.tsx)
- [apps/web/src/app/api/class/enroll/route.ts](../apps/web/src/app/api/class/enroll/route.ts) (línea ~60)

**Hallazgo:**
- `ClassCard` y `MobileClassCard` calculan `takenCount = enrollments.filter(status !== 'cancelled').length` en cliente.
- La vista `class_spots` (server) hace su propia lógica de conteo.
- Si la query del feed no incluye **todos** los enrollments (paginación / RLS oculta algunos), el contador de cliente es menor que el real → muestra cupos disponibles cuando no los hay → click "Reservar" → 409 `no_spots`.

**Riesgo:**
- Usuarios ven "Quedan 2 cupos" pero al inscribirse reciben error → frustración + tickets de soporte.

**Acción:**
1. Eliminar cálculo client-side de `takenCount`.
2. Servir `spots_available` desde `class_spots` view en la misma query de feed (join lateral o vista materializada).
3. Si imposible por costo de query, mantener cálculo client-side pero **siempre validar nuevamente en `/api/class/enroll` antes de inscribir** (ya lo hace — confirmar que el error 409 se muestra correctamente como "se llenó hace segundos, intenta otra clase").

**Verificación:**
- Simular: clase con 1 cupo. Usuario A y B abren el feed simultáneamente. Ambos ven 1/2. A se inscribe. B intenta inscribirse → debe ver mensaje claro de "Se acaba de llenar" sin dejar UI en estado loading.

---

## C-3 — Soft-delete de clase deja media huérfana hasta cron diario (P2)

**Archivos:**
- [apps/web/src/app/api/cron/cleanup-classes/route.ts](../apps/web/src/app/api/cron/cleanup-classes/route.ts)
- [apps/web/src/components/class/EditClassForm.tsx](../apps/web/src/components/class/EditClassForm.tsx) (zona peligrosa)

**Hallazgo:**
- `UPDATE classes SET status='cancelled'` preserva historial pero los archivos en `class-media` Storage **no se eliminan** hasta el cron de las 03:00 UTC.
- Si una clase tiene 5 videos pesados (cerca del límite de 50 MB), y se eliminan 10 clases por día, hasta 2.5 GB pueden quedar acumulándose hasta 24 h.
- El bucket Cloudinary (posts-media) tiene el mismo patrón pero sin cron de limpieza visible.

**Acción:**
1. Al soft-deletar clase, ejecutar inmediatamente el delete de Storage (las URLs ya están en `class_media`).
2. Mantener el cron como red de seguridad / fallback.
3. Auditar `posts` con `deleted_at` (si existe): si no hay cleanup → crear uno o documentar la falta como deuda técnica conocida.

**Verificación:**
- Crear clase con 3 imágenes → eliminar → revisar Supabase Storage → bucket vacío para esa clase.

---

## C-4 — Eliminación de cuenta no implementada (P0 — bloqueante legal) ⚠️

**Hallazgo:**
- `/privacy` enumera los "Derechos ARCO" (acceso, rectificación, cancelación, oposición) pero no hay **ninguna pantalla** para que el usuario elimine su cuenta.
- **Apple Store (desde 2022)** y **Google Play (desde 2024)** requieren botón visible de eliminación de cuenta dentro de la app o un link claro en la web.
- Lanzar la app sin esto = rechazo en submit.

**Acción:**
1. Crear pantalla `/profile/delete-account` (web) y `profile/delete-account.tsx` (mobile).
2. Endpoint `POST /api/account/delete` que:
   - Verifica que el usuario es quien dice ser (re-auth con password o magic link).
   - Soft-delete: marca `profile.deleted_at`, anonimiza username, full_name, email, avatar.
   - Cancela suscripción MP (`PreApproval.update({ status: 'cancelled' })`).
   - Conserva `enrollments`, `payments` para auditoría legal/contable (con `deleted_user_label`).
   - Hard-delete después de 30 días por cron (ver Política de Privacidad).
3. Documentar el flujo en `/privacy` y agregar texto in-app: "Al eliminar tu cuenta perderás acceso a tus inscripciones. Los pagos confirmados se mantendrán para auditoría."

**Verificación:**
- Cuenta de prueba elimina su cuenta → no puede loguear → su username queda `[deleted]` en posts viejos → MP no cobra el siguiente mes.

---

## C-5 — Comprobante de pago (`payment-receipts`) — sin validación de tamaño/tipo en backend (P1)

**Archivos:**
- [apps/web/src/components/payment/PaymentClient.tsx](../apps/web/src/components/payment/PaymentClient.tsx)
- bucket Supabase `payment-receipts` (10MB max, image/PDF)

**Hallazgo:**
- El frontend deja al usuario elegir el archivo y lo sube directo al bucket. La validación de tipo/tamaño está en la **policy de Storage** (10MB, image/PDF).
- Si el usuario sube un PDF malicioso o un EXE renombrado a `.jpg`, Supabase puede aceptarlo (mime detection débil).
- El profesor ve "Ver comprobante" → abre el archivo en su browser → ataque.

**Acción:**
1. Validar mime + magic bytes en cliente antes de upload.
2. Considerar route server-side `/api/payment/upload-receipt` que tome el archivo, valide tipo real con `file-type` lib, y lo suba con service role.
3. En `PaymentClient` cuando el profesor ve "Ver comprobante", agregar `target="_blank" rel="noopener"` y no inyectar como `<img>` sin alt confiable.

**Verificación:**
- Subir un `.exe` renombrado → debe ser rechazado client-side y por el server.

---

## C-6 — Banner de fecha de eliminación de archivos confunde alumnos (P2)

**Archivos:**
- [apps/web/src/components/class/MyClassesClient.tsx](../apps/web/src/components/class/MyClassesClient.tsx)
- [apps/mobile/app/(app)/(tabs)/my-classes.tsx](../apps/mobile/app/(app)/(tabs)/my-classes.tsx)

**Hallazgo:**
- El banner naranja muestra "Tus archivos serán eliminados el DD/MM/YYYY" en el tab Que Dicto.
- Si se muestra también al alumno (revisar lógica condicional), puede asustar pensando que su inscripción se pierde.

**Acción:**
- Confirmar que el banner solo se renderiza en `TeachingTab` (no en `EnrolledTab`).
- Si está bien, copiar nota a CLAUDE.md como "decisión consciente".

---

## C-7 — Estado UI roto cuando `currentUser` es null y se intenta acción protegida (P1)

**Archivos:**
- [apps/web/src/components/class/ClassDetailClient.tsx](../apps/web/src/components/class/ClassDetailClient.tsx)
- (mobile equivalent)

**Hallazgo:**
- En `/class/[id]` (público) un visitante anónimo no debería poder pulsar "Reportar", "Seguir profesor", "Postularme". El código las oculta, pero verificar:
  - ¿Algún botón **disabled** pero clicable mediante touch en mobile?
  - ¿Algún `onClick` que asume `currentUser` no-null y crashea?
- Probar: abrir `/class/[id]` en incógnito → intentar interactuar con cada control.

**Acción:**
- Auditar `ClassDetailClient` y el mobile equivalent para `currentUser?.` defensivos en todos los handlers.
- Si un botón no debería estar visible, no renderizarlo (no solo `disabled`).

---

## C-8 — `useEffect` de fetch sin cancel / cleanup → race conditions al navegar rápido (P1)

**Archivos:** prácticamente todos los `*Client.tsx` que hacen `await supabase.from(...)`.

**Hallazgo:**
- Si el usuario navega de `/class/A` a `/class/B` antes de que termine el fetch de A, el setState de A puede sobrescribir B (clase fantasma).
- React 19 mitiga algunos casos, pero no todos.

**Acción:**
1. Adoptar patrón `let cancelled = false; ... if (cancelled) return; ... return () => { cancelled = true }` en los fetches críticos.
2. Idealmente migrar a `useSWR` o `@tanstack/react-query` (post-alpha).

---

## C-9 — Inputs numéricos aceptan negativos, decimales, exponenciales (P1)

**Archivos:**
- [apps/web/src/components/class/CreateClassForm.tsx](../apps/web/src/components/class/CreateClassForm.tsx)
- [apps/web/src/components/class/EditClassForm.tsx](../apps/web/src/components/class/EditClassForm.tsx)

**Hallazgo:**
- `<input type="number">` acepta `-1500`, `1.5e10`, `1,5`, etc.
- Zod schema valida `z.number().positive()` pero ese flujo entra como `valueAsNumber`. Probar: ingresar `1.5e3` → ¿pasa el validate? ¿qué se guarda en DB?
- Mismo para `price_2x`, `discount_price`, `billing_day`, `max_spots`.

**Acción:**
1. Para precios: `z.number().int().min(0).max(10_000_000)` y `step="1"` en el input.
2. Para `billing_day`: `min={1} max={27}` + Zod range.
3. Para `max_spots`: `min={1} max={1000}` razonable.
4. Bloquear `e`, `+`, `-`, `,` en `onKeyDown` con regex permisivo `[0-9]`.

---

## C-10 — Falta de manejo "graceful" si Cloudinary/Supabase storage cae (P2)

**Hallazgo:**
- Si `uploadToCloudinary` falla, ¿qué pasa? El código intenta fallback a Supabase Storage, pero ¿el usuario lo nota?
- Si ambos fallan, ¿el modal queda en spinner? ¿el botón se re-habilita?

**Acción:**
- Auditar `CreatePostModal` (web + mobile) y `CreateClassForm` (upload de media).
- Garantizar: try/catch por archivo, mostrar toast por error individual, no bloquear el submit si al menos un archivo subió.

---

## C-11 — Imágenes/Videos sin lazy loading → feed lento con 20 clases (P2)

**Hallazgo:**
- `feed/page.tsx` carga con `.limit(20)`. Si cada clase tiene 5 imágenes, son ~100 requests en paralelo.
- `<img>` y `<video>` sin `loading="lazy"`.

**Acción:**
- `<img loading="lazy" decoding="async">` en `ClassCard`.
- `<video preload="metadata">` en lugar de `auto`.
- Thumbnails de video: Cloudinary genera con `f_jpg,q_auto` — usar en lugar del video completo en el feed.

---

## C-12 — Re-inscripción puede pagar precio viejo si descuento se agregó después (P2)

**Hallazgo:**
- El descuento se guarda en `classes.discount_price` y `discount_price_monthly`. Si el alumno se inscribió antes del descuento y aún no pagó, `PaymentClient` ¿toma el precio actual o el del momento de inscripción?
- Revisar: `PaymentClient.tsx` calcula amount on the fly. Esto puede ser **correcto** (precio actual aplica), pero confirmar y documentar.

**Acción:**
- Decidir política: "el precio mostrado al momento de pago es siempre el actual de la clase, incluyendo descuentos vigentes".
- Documentar en `/terms` y CLAUDE.md.

---

## Reporte de cierre — Sesión 2026-05-28

### ✅ Logrado

| Bug | Archivos modificados | Test agregado |
| --- | --- | --- |
| C-4 (P0) — Eliminación de cuenta | `031_account_deletion.sql`, `api/account/delete/route.ts`, `profile/delete-account/page.tsx`, `profile/delete-account.tsx` (mobile), `profile/page.tsx`, `(tabs)/profile.tsx` | No (manual suficiente para alpha) |
| C-1 (P1) — Leave sin cancelar payment | `api/class/leave/route.ts`, `api/class/enroll/route.ts` | No |
| C-9 (P1) — Inputs numéricos inválidos | `CreateClassForm.tsx`, `EditClassForm.tsx` | No |
| C-7 + C-2 (P1) — null currentUser + no_spots message | `ClassDetailClient.tsx` | No |
| C-5 (P1) — MIME validation comprobante | `PaymentClient.tsx` | No |
| C-6 (P2) — Banner naranja solo TeachingTab | Confirmado sin cambios | — |
| C-3 (P2) — Purgar Storage al soft-delete | `ClassDetailClient.tsx` | No |
| C-11 (P2) — Lazy loading feed | `ClassCard.tsx` | No |
| C-12 (P2) — Política precio al pago | Documentado en `CLAUDE.md` | — |

### ⏳ Pendiente (post-alpha)

| Bug | Razón | Sesión sugerida |
| --- | --- | --- |
| C-8 — useEffect race condition | Refactor global; alto riesgo de regresión | post-alpha (migrar a react-query) |
| C-10 — Graceful Cloudinary failure | Auditoría multi-componente; cosmético | post-alpha |

### ❌ Fallado

Ninguno.

### 🔁 Regresiones detectadas

Ninguna detectada (revisión manual).

### 📌 Acciones del usuario pendientes

- [ ] Aplicar `031_account_deletion.sql` en Supabase producción (sin esto `/api/account/delete` falla con error 42703)
- [ ] Probar flujo completo de eliminación de cuenta con una cuenta de prueba en producción
- [ ] Aplicar `030_dedup_class_reminders.sql` si aún no se ha hecho

### 📝 Memoria actualizada

- [x] `CLAUDE.md` — 8 nuevas notas técnicas (eliminación cuenta, política precios, noExp inputs, MIME, banner naranja, `/api/class/leave`, Storage purge, lazy loading)
- [x] `resumen.md` — bloque "Sesión 2026-05-28 — Bugs críticos pre-alpha (planning/01)"
