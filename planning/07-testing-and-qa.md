# Sesión 7 — Testing y QA

> **Objetivo de la sesión:** llegar al lanzamiento con una red de seguridad mínima viable: tests E2E de los flujos críticos, manual QA matrix, CI corriendo tests en cada PR.

## Instrucciones obligatorias
- Los tests nuevos deben correr verde antes de cerrar la sesión.
- CI debe estar configurado en GitHub Actions y corriendo en cada push a main.
- Al terminar, **actualizar `CLAUDE.md`** y **`resumen.md`**.

---

## T-1 — Inventario de tests existentes

| Archivo | Tipo | Estado | Coverage |
|---|---|---|---|
| `tests/e2e/auditions-billing-agenda.spec.ts` | E2E dev | ✅ | parcial |
| `tests/e2e/posts.spec.ts` | E2E dev | ✅ | básico |
| `tests/e2e/classes.spec.ts` | E2E dev | ✅ | básico |
| `tests/e2e/availability.spec.ts` | E2E dev | ✅ | básico |
| `tests/e2e/design-system-preview.spec.ts` | E2E dev | ⚠️ eliminar antes de prod (depende de la ruta) |
| `tests/e2e-production/smoke.public.spec.ts` | Smoke prod | ✅ | read-only |
| `tests/e2e-production/smoke.navigation.spec.ts` | Smoke prod | ✅ | read-only |
| `tests/e2e-production/smoke.auth.spec.ts` | Smoke prod | ✅ | read-only |
| `tests/e2e-production/smoke.features.spec.ts` | Smoke prod | ✅ | read-only |
| `tests/unit/availability.test.ts` | Unit | ✅ | helper |

---

## T-2 — Flujos críticos sin test (P1)

Cada uno debe tener al menos 1 test E2E happy-path + 1 negativo:

| Flujo | Happy path test | Negativo |
|---|---|---|
| Registro → confirmación email → login | ❌ falta | ❌ falta |
| Suscribirse a Pro mensual (sandbox MP) | ❌ | ❌ |
| Crear clase suelta → ver en feed → otra cuenta inscribirse → ambas suben/confirman pago | ❌ | ❌ |
| Inscribirse 2x → match → pagar | ⚠️ parcial | ❌ |
| Postular a entrenamiento → ser aceptado → auto-enrollment → pagar | ⚠️ parcial | ❌ |
| Aplicar descuento → seguidores reciben notif → alumno paga precio descontado | ❌ | ❌ |
| Lista de espera: unirse → otra cuenta cancela → recibir notif | ❌ | ❌ |
| Ensayo: crear → invitar → aceptar/rechazar → ver en agenda | ⚠️ parcial | ❌ |
| Eliminar cuenta (cuando esté implementado) | ❌ | ❌ |
| Reportar contenido → admin elimina | ❌ | ❌ |

**Acción:**
1. Implementar mínimo los 4 primeros (registro, suscripción, inscripción + pago, 2x) antes del alpha.
2. Resto en sprint post-alpha.
3. Para MP sandbox, requiere cuenta de prueba MP de comprador → secret en `.env.test`.

---

## T-3 — Unit tests faltantes (P1)

**Acción:** crear `tests/unit/`:

| Helper | Cobertura |
|---|---|
| `getClassSessions` | fechas en bordes (año nuevo, mes 31, biweekly sin start_date) |
| `formatDate` | YYYY-MM-DD parsing, timezone Chile |
| `formatTime` | 24h, edge cases (00:00, 23:59) |
| `isSleepHour` | cruce de medianoche, sleep_start === sleep_end |
| `canTeach`, `canEnroll`, `canUploadVideo`, `canTeachUnlimited` | todos los tiers |
| `subscription.ts → getActiveTier` | active, grace, expired |
| `availability.isBlockOccupied` | combinaciones sueño + ocupado |

---

## T-4 — CI: GitHub Actions corriendo tests en cada push (P1)

**Acción:**
1. Crear `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     typecheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: npm ci
         - run: npm run typecheck --workspace=apps/web
     test-unit:
       ...
     test-e2e:
       runs-on: ubuntu-latest
       steps:
         - run: npx playwright test --config=playwright.unit.config.ts
   ```
2. (Opcional) Tests E2E reales requieren Supabase + Next dev server → costoso en CI. Tal vez correr solo unit y smoke.

---

## T-5 — Test data / seeding (P2)

**Hallazgo:**
- `supabase/scripts/reset_test_data.sql` existe.
- Pero no hay un seed automatizado para tests E2E.

**Acción:**
1. Crear `tests/e2e/seed.ts` que limpia + popula datos antes de cada test suite.
2. Cuenta de prueba específicas: `teacher@test.com`, `student@test.com` con tier Pro.

---

## T-6 — QA manual checklist pre-launch (P0)

**Acción:** completar antes de invitar primer usuario externo:

### Auth y onboarding
- [ ] Registro web → confirma email → login → llega a feed con perfil vacío
- [ ] Registro mobile → confirma → login
- [ ] Password reset web → email → cambiar → login con nuevo
- [ ] Password reset mobile → mismo flow
- [ ] Términos y privacidad accesibles sin login
- [ ] Eliminar cuenta funciona y bloquea login

### Feed y exploración
- [ ] Feed siguiendo con/sin follows
- [ ] Feed global muestra clases activas y posts públicos
- [ ] Feed cerca filtra por ciudad
- [ ] Explore busca clases por título
- [ ] Explore busca usuarios

### Perfil
- [ ] Editar perfil: nombre, username, bio, ciudad, estilos, instagram
- [ ] Subir avatar y verificar persistencia
- [ ] Datos de transferencia (solo canTeach)
- [ ] Ratings: dar estrella, ver promedio
- [ ] Follow/unfollow
- [ ] Amistad: enviar request → aceptar/rechazar

### Clases
- [ ] Crear clase suelta
- [ ] Crear clase periódica (weekly, biweekly, monthly)
- [ ] Crear clase custom (3 fechas)
- [ ] Crear entrenamiento con audición
- [ ] Editar clase
- [ ] Eliminar clase (soft-delete + notif a inscritos)
- [ ] Postular a audición → ver en panel profesor → aceptar → ver auto-enrollment
- [ ] Inscribirse → pagar (sandbox) → profesor confirma
- [ ] Inscribirse 2x → match → pagar
- [ ] Lista de espera: unirse → cancelar inscripción → notif al primero

### Pagos
- [ ] Suscribirse Básico mensual (sandbox)
- [ ] Suscribirse Pro mensual
- [ ] Suscribirse Pro anual
- [ ] Cancelar suscripción → ver fecha de fin
- [ ] Webhook recibe evento real → tier actualiza

### Ensayos
- [ ] Crear ensayo → invitar amigos
- [ ] Aceptar / rechazar invitación
- [ ] Editar ensayo (creador)
- [ ] Ver coordinación grupal (disponibilidad)
- [ ] Ver en agenda
- [ ] Eliminar ensayo

### Agenda
- [ ] Vista semanal mobile
- [ ] Vista mes/semana web
- [ ] Disponibilidad: marcar bloques ocupados
- [ ] Configurar horas de sueño
- [ ] Colores correctos (sky/emerald/violet/slate)

### Notificaciones
- [ ] Recibir notif al ser inscrito
- [ ] Recordatorio 24h antes (cron)
- [ ] Marcar como leída
- [ ] Tap → navegar a destino correcto

### Admin
- [ ] Acceso restringido a SUPERADMIN_USER_ID
- [ ] Eliminar contenido reportado
- [ ] Descartar reporte

### Dark mode
- [ ] Toggle web persiste tras reload
- [ ] Toggle mobile persiste tras reload
- [ ] Todas las pantallas legibles en ambos modos
- [ ] Imágenes/avatares OK en ambos

### Mobile específico
- [ ] Pull to refresh en feed, agenda, my-classes, notifications
- [ ] Back button Android
- [ ] Keyboard avoiding en formularios
- [ ] Splash screen
- [ ] App icon
- [ ] Deep link `danceclass://plans/success` desde browser

### Edge cases
- [ ] Inscribirse a clase llena → mensaje claro
- [ ] Inscribirse a clase pasada → bloqueado
- [ ] Inscribirse a entrenamiento sin postular → bloqueado
- [ ] Pagar después de descuento → muestra precio nuevo
- [ ] Reset de password con email no registrado → mensaje genérico

---

## T-7 — Bug bash interno (P1)

**Antes** de invitar usuarios externos:

1. Reunir 3–5 personas (amigos, familia, beta-testers internos).
2. Cada uno usa la app 30 minutos con flujos reales.
3. Recolectar reportes en una hoja compartida.
4. Triagear: P0 (bloquea launch), P1 (lanzar con disclaimer), P2 (post-alpha).
5. Cerrar los P0 antes de continuar.

---

## T-8 — Sentry integration (overlapping con O-1) (P1)

Verificar que Sentry (cuando se instale) captura errores en tests también.

---

## Reporte de cierre (Sesión 2026-05-30)

### ✅ Logrado

| Test agregado | Archivo | Status |
|---|---|---|
| Unit tests: canTeach, canEnroll, canUploadVideo, canTeachUnlimited, canPostVideo, canUploadMedia | `tests/unit/shared-helpers.test.ts` | ✅ nuevo |
| Unit tests: pluralize | `tests/unit/shared-helpers.test.ts` | ✅ nuevo |
| Unit tests: formatDateLocal (no off-by-one) | `tests/unit/shared-helpers.test.ts` | ✅ nuevo |
| Unit tests: formatTime (24h→12h AM/PM, edge cases) | `tests/unit/utils.test.ts` | ✅ nuevo |
| Unit tests: formatDate (YYYY-MM-DD local parsing) | `tests/unit/utils.test.ts` | ✅ nuevo |
| Unit tests: getClassSessions (suelta, weekly, biweekly, monthly, custom) | `tests/unit/utils.test.ts` | ✅ nuevo |
| CI GitHub Actions: typecheck + unit tests + smoke (opcional) | `.github/workflows/ci.yml` | ✅ nuevo |
| E2E seed: seedClass, seedEntrenamiento, cleanSeed, cleanAllTestData | `tests/e2e/seed.ts` | ✅ nuevo |

### ⏳ Pendiente

| Test | Razón |
|---|---|
| Registro → confirmación email → login (E2E happy path) | Requiere servidor de email en CI + cuenta confirmada automáticamente — demasiado costoso para el alcance actual |
| Suscripción Pro sandbox MP (E2E) | Requiere cuenta MP comprador sandbox configurada en `.env.test` — pendiente de credenciales del usuario |
| Inscripción + pago E2E (happy path) | Requiere servidor dev corriendo en CI + datos seeded — fuera de alcance para CI actual |
| 2x match + pago E2E | Requiere dos cuentas simultáneas y servidor dev — post-alpha |
| T-8 Sentry integration | Se aborda en sesión 08 (Observability) |
| T-7 Bug bash interno | Acción del usuario |
| T-6 QA manual checklist | Acción del usuario |

### 📌 Acciones del usuario pendientes

- [ ] Habilitar GitHub Actions en el repositorio (Settings → Actions → Allow all actions)
- [ ] Crear variable `RUN_SMOKE_TESTS=true` en GitHub Actions si se quiere activar smoke tests en CI
- [ ] Crear secrets `E2E_USER_EMAIL` y `E2E_USER_PASSWORD` en GitHub Actions para smoke tests
- [ ] Crear cuentas de prueba MP comprador (sandbox) para tests E2E de pagos futuros
- [ ] Configurar `.env.test` con credenciales sandbox + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` de instancia de test
- [ ] Ejecutar bug bash interno (T-7) con 3–5 personas antes del launch

### 📝 Memoria a actualizar

- [x] `CLAUDE.md` — sección de testing con comandos
- [x] `resumen.md` — bloque de tests añadidos
