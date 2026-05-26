# Sesión 9 — Launch Readiness Checklist (24-48 h pre-launch)

> **Objetivo:** la última pasada antes de mandar el primer invite. Esta sesión NO debe descubrir features faltantes — esas debieron cerrarse antes. Solo confirmar que todo lo que ya se construyó está vivo, configurado y monitoreado.

## Instrucciones obligatorias
- **No** abrir nuevos issues durante esta sesión salvo blockers críticos.
- Cualquier hallazgo de severidad alta = abortar launch.
- Al terminar, **actualizar `CLAUDE.md`** y **`resumen.md`** con la fecha de lanzamiento y la versión del commit congelado.

---

## L-0 — Go / No-go: P0 cerrados

| ID | Descripción | Estado |
|---|---|---|
| S-1 | /design-system-preview removed | [ ] |
| P-1 | env vars Vercel verificadas (incluida MP producción token) | [ ] |
| D-1 | migración 024 aplicada en producción | [ ] |
| D-2 | migración 025 aplicada en producción | [ ] |
| C-4 | eliminación de cuenta implementada | [ ] |
| M-3 | build EAS preview Android instalable | [ ] |
| L-2 | política de eliminación documentada en /privacy | [ ] |

Si cualquiera es ❌ → **no-go**.

---

## L-1 — Smoke test producción

Cuenta de prueba "alpha-test@danzclass.com":

- [ ] Registrar cuenta nueva web
- [ ] Confirmar email
- [ ] Login
- [ ] Editar perfil (nombre, ciudad, estilos)
- [ ] Suscribirse Pro mensual (sandbox o producción real con $1)
- [ ] Webhook actualiza tier en DB ≤ 30 s
- [ ] Crear clase suelta
- [ ] Otra cuenta inscribirse
- [ ] Subir comprobante
- [ ] Profesor confirma
- [ ] Notificación llega a alumno
- [ ] Calificar profesor (5 estrellas)
- [ ] Ver rating en perfil del profesor
- [ ] Mobile: login en APK → ver misma data → operaciones cross-platform consistentes

---

## L-2 — Política de eliminación de cuenta (P0)

Ver `01-critical-bugs.md` C-4.

- [ ] Pantalla `/profile/delete-account` web
- [ ] Pantalla mobile equivalente
- [ ] `/api/account/delete` route con re-auth
- [ ] Texto en `/privacy` explicando: qué se elimina, qué se conserva, en cuánto tiempo
- [ ] Cancela suscripción MP

---

## L-3 — Documentos legales actualizados

- [ ] `/terms` actualizado con fecha
- [ ] `/privacy` actualizado con fecha y contacto válido
- [ ] Email de contacto **funciona** (probar enviando uno de prueba)
- [ ] Política de eliminación incluida

---

## L-4 — Comunicación a usuarios

**Antes del invite:**

1. Lista de invitados alpha — máximo 30 personas para empezar.
2. Email/Whatsapp template:
   - **Qué es DanzClass** (1 párrafo).
   - **Por qué eres alpha tester** (estás temprano, esperamos bugs).
   - **Cómo reportar issues** (link a formulario o email).
   - **Qué NO esperar** (push notifications no, anuncios no, app stores aún no).
   - Link de descarga APK (Android) o web (todos).
3. Comunidad de Discord / Whatsapp group dedicado para bugs.

---

## L-5 — Soporte y reportes de bug

- [ ] Email `contacto@danzclass.com` (o equivalente) configurado y funcionando
- [ ] (Opcional alpha) Tally form / Linear public board para issues
- [ ] Banner in-app discreto: "¿Encontraste algo raro? [Reportar]"
- [ ] Sentry capturando errores en tiempo real

---

## L-6 — Rollback plan

**Si en las primeras 24h algo falla catastróficamente:**

1. **Frontend Vercel rollback:** botón en dashboard → revertir al deploy anterior. ~2 min.
2. **Migración DB rollback:** cada migración debe tener su "down" — si no, documentar SQL inverso en CLAUDE.md.
3. **Mobile EAS rollback:** publicar build OTA con versión anterior.
4. **MP webhook**: si MP queda activo y hay bugs, dejar el webhook responder 200 OK silenciosamente y procesar manualmente.

---

## L-7 — Métricas de éxito alpha

Establecer baseline:

| Métrica | Objetivo semana 1 | Objetivo semana 4 |
|---|---|---|
| Usuarios registrados | 20 | 100 |
| Usuarios que pagan suscripción | 5 | 30 |
| Clases publicadas | 10 | 50 |
| Pagos confirmados | 5 | 30 |
| Errores cliente / día (Sentry) | < 10 | < 20 |
| Tickets de soporte | < 20 | < 50 |
| Días sin downtime > 5 min | 7/7 | 28/28 |

Revisar semanalmente y ajustar la estrategia.

---

## L-8 — Frozen commit y tag

- [ ] Crear tag `alpha-v0.1.0` en el commit que se va a deployar.
- [ ] Anotar en `CLAUDE.md` la fecha y el commit hash.
- [ ] No mergear nada nuevo a `main` durante las primeras 48 h post-launch (excepto fixes críticos).

---

## L-9 — Última verificación de env vars

En Vercel → Production (no Preview, no Development):

- [ ] `APP_URL` = `https://dc-project-web.vercel.app`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `MERCADOPAGO_ACCESS_TOKEN` (empieza con `APP_USR-`, no `TEST-`)
- [ ] `MERCADOPAGO_WEBHOOK_SECRET`
- [ ] `CRON_SECRET`
- [ ] `SUPERADMIN_USER_ID`
- [ ] `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- [ ] `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- [ ] `NEXT_PUBLIC_SENTRY_DSN`
- [ ] `SENTRY_DSN` (server)

En Supabase:

- [ ] Site URL: `https://dc-project-web.vercel.app`
- [ ] Redirect URLs: `https://dc-project-web.vercel.app/**`, `danceclass://**`
- [ ] Email templates en español

En MP dashboard:

- [ ] Webhook URL apunta a `https://dc-project-web.vercel.app/api/mercadopago/webhook`
- [ ] Webhook signing secret coincide con `MERCADOPAGO_WEBHOOK_SECRET`

En Expo:

- [ ] EXPO_PUBLIC_SUPABASE_URL
- [ ] EXPO_PUBLIC_SUPABASE_ANON_KEY

En Cloudinary:

- [ ] Upload preset `Unsigned` mode
- [ ] Folder `posts`

---

## L-10 — Backup pre-launch

- [ ] `supabase db dump > backups/pre-alpha-2026-XX-XX.sql`
- [ ] Guardar en lugar seguro (no en el repo)

---

## L-11 — Comunicación interna del lanzamiento

- [ ] Aviso al equipo (si hay) con horario de launch
- [ ] Pre-anuncio "Mañana vamos vivos" 24 h antes
- [ ] Anuncio "Ya estamos vivos" + link

---

## Reporte de cierre

### ✅ Logrado

| Item | Estado |
|---|---|

### ⏳ Pendiente (no bloqueante)

| Item | Razón |
|---|---|

### 🚀 Lanzamiento

- **Fecha y hora**: `____________________`
- **Commit tag**: `____________________`
- **Vercel deploy**: `____________________`
- **EAS build version**: `____________________`
- **Usuarios invitados**: `__`
- **Responsable rollback**: `____________________`

### 📝 Memoria a actualizar

- [ ] `CLAUDE.md` — sección "Estado actual" actualizada a "Alpha pública"
- [ ] `CLAUDE.md` — sección "Rollback procedures"
- [ ] `resumen.md` — bloque "Sesión 2026-XX-XX — Launch Alpha 0.1"
