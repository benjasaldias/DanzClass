# Sesión 8 — Performance y observabilidad

> **Objetivo de la sesión:** una app rota en producción que nadie reporta es peor que una que crashea visible. Esta sesión instala "ojos en el sistema": logs estructurados, error tracking, alertas de cron, métricas básicas.

## Instrucciones obligatorias
- Tier gratuito de Sentry o equivalente es suficiente para alpha.
- No instalar herramientas que requieran código sensible en el cliente sin revisar (PII).
- Al terminar, **actualizar `CLAUDE.md`** y **`resumen.md`**.

---

## O-1 — Error tracking (Sentry) — sin esto el alpha es ciego (P1)

**Acción:**
1. Crear cuenta Sentry (tier free: 5k errores/mes, suficiente).
2. Crear proyecto Next.js (web) + React Native (mobile).
3. Instalar:
   ```bash
   cd apps/web && npm install @sentry/nextjs
   cd apps/mobile && npx expo install @sentry/react-native
   ```
4. Configurar:
   - DSN en env var (`NEXT_PUBLIC_SENTRY_DSN` para client, `SENTRY_DSN` para server).
   - Sample rate `tracesSampleRate: 0.1` (10 % de transactions, suficiente para alpha).
   - Source maps en build de Vercel y EAS.
5. Filtrar errores conocidos (RLS expected denials, network offline) para no inundar.

**Verificación:**
- Forzar un error en `/api/test/error` → ver en Sentry dashboard en ≤ 1 minuto.

---

## O-2 — Cron monitoring: alertas si falla (P1)

**Acción:**
1. En cada cron route, al final:
   ```ts
   await fetch(`https://hc-ping.com/<UUID>`)  // Healthchecks.io free
   ```
   o usar Vercel Cron Monitoring (paid) o BetterStack.
2. Crear "monitor" en Healthchecks.io para cada cron (diario 03:00 UTC y 04:00 UTC).
3. Si pasa 26 horas sin ping → email/Slack al admin.

**Verificación:**
- Forzar fallo del cron (env var rota) → al día siguiente recibir alerta.

---

## O-3 — Logging estructurado (P2)

**Hallazgo:**
- Hoy: `console.log('[webhook] ...')` y similar.
- En producción Vercel, estos logs son visibles pero no filtrables fácilmente.

**Acción:**
1. Helper `logger.ts`:
   ```ts
   export const logger = {
     info: (event: string, meta?: Record<string, unknown>) =>
       console.log(JSON.stringify({ level: 'info', event, ...meta, ts: Date.now() })),
     error: (event: string, error: unknown, meta?: Record<string, unknown>) =>
       console.error(JSON.stringify({ level: 'error', event, error: String(error), ...meta, ts: Date.now() })),
   }
   ```
2. Reemplazar `console.log` en API routes críticas.
3. Vercel deja query por nivel/event.

---

## O-4 — Vercel analytics / web vitals (P2)

**Acción:**
- Habilitar Vercel Analytics (gratis para hobby).
- Permite ver LCP, FID, CLS, TTFB por ruta.
- Detectar páginas lentas tempranamente.

---

## O-5 — Imágenes optimizadas (P1)

**Hallazgo:**
- `<img src="...">` en feed sin `next/image`.
- `next/image` permite optimización automática (resize, format conversion, lazy).

**Acción:**
- Migrar `<img>` a `<Image>` de Next en ClassCard, PostCard, Avatar, ClassDetailClient.
- Configurar `remotePatterns` en `next.config.js` para Cloudinary y Supabase Storage domains.
- Mobile: usar `expo-image` (caching out of box).

---

## O-6 — Bundle size (P2)

**Acción:**
1. Correr `npm run build` con `@next/bundle-analyzer`.
2. Identificar imports grandes (lucide-react completo, date-fns no tree-shaken, mercadopago SDK en client).
3. Optimizar:
   - `import { X } from 'lucide-react'` (no namespace import).
   - `import format from 'date-fns/format'` (tree-shake).
   - Verificar que `mercadopago` solo se importa en API routes.

---

## O-7 — Database query analysis (P2)

**Acción:**
1. Supabase dashboard → Performance → Slow queries.
2. Identificar las top 10 queries.
3. Agregar índices donde aplique:
   - `enrollments(student_id, class_id)` — probable
   - `notifications(user_id, read_at)` — para sin leer
   - `classes(teacher_id, status)`
   - `posts(user_id, visibility, created_at DESC)`

---

## O-8 — N+1 queries en `MyClassesClient` (P1)

**Hallazgo:**
- En tab Dicto, por cada clase se hace un sub-fetch de enrollments (probable, verificar).
- Si profesor tiene 20 clases, 20 fetches secuenciales = lentitud.

**Acción:**
- Refactor a una única query con JOIN o Supabase nested select.
- Medir antes y después con Chrome DevTools Network.

---

## O-9 — Realtime updates en notificaciones (P2)

**Hallazgo:**
- Hoy el badge de notificaciones requiere refresh.
- Supabase Realtime puede subscribir cambios en `notifications` y actualizar el badge en vivo.

**Acción:**
- Suscripción Realtime en `TopBar` o root layout para `notifications WHERE user_id = current_user`.
- Cuando llega nuevo INSERT, incrementar contador.

---

## O-10 — Rate de Supabase (P2)

**Hallazgo:**
- Free tier Supabase: 50K requests/día, 500 simultaneous connections.
- Cada page render = X queries → con 100 usuarios alpha, puede acercarse al límite.

**Acción:**
1. Monitorear via dashboard → "API requests this month".
2. Si proyecta exceder, upgrade a Pro ($25/mo) antes de alpha.
3. Considerar caching server-side con `revalidate` en Next.

---

## O-11 — Cloudinary bandwidth (P2)

**Hallazgo:**
- Free tier: 25 GB bandwidth/mes.
- Si feed carga 1 MB de videos por usuario por sesión, 25 GB = 25k vistas.
- Alpha con 100 usuarios x 10 vistas/día = 30k al mes → al límite.

**Acción:**
- Activar `auto_quality` (ya en preset).
- Generar `f_jpg,q_auto` thumbnail para feed; cargar video completo solo en detalle.
- Monitor mensual.

---

## O-12 — Web — caché de imágenes Cloudinary CDN (P2)

**Hallazgo:**
- URLs de Cloudinary tienen versionado (`v=...`). Si no se reusan, cada visita pega CDN cold cache.

**Acción:**
- Confirmar que URLs almacenadas en DB son las "stable" (sin `v=` o con `v=1`).

---

## O-13 — Service Worker / PWA (P2)

**Hallazgo:**
- `manifest.json` existe pero ¿hay service worker registrado?
- PWA mejora retención: usuarios pueden "instalar" la web app en móvil sin esperar el build EAS.

**Acción:**
- Configurar `next-pwa` o equivalente.
- Test "Add to Home Screen" en mobile browser.

---

## O-14 — Cron timeout (P1)

**Hallazgo:**
- Vercel cron tiene timeout de ~60 s en hobby tier, 300 s en pro.
- `cleanup-classes` hace múltiples queries + inserciones. Con 1000 clases activas puede timeoutear.

**Acción:**
- Medir tiempo de ejecución actual en producción (ver logs Vercel).
- Si cerca de límite: dividir en jobs más pequeños (cleanup-media, send-reminders, cleanup-stale).

---

## O-15 — Backups Supabase (P0 para alpha)

**Acción:**
1. Verificar que el plan Supabase tiene backups automáticos (Pro plan los tiene daily).
2. Free tier: backup manual con `supabase db dump` semanal.
3. Documentar procedimiento de restore en CLAUDE.md.

---

## Reporte de cierre

### ✅ Logrado

| Item | Archivos |
|---|---|
| O-3: Logger estructurado JSON | `apps/web/src/lib/logger.ts` |
| O-3: Cron cleanup-classes usa logger | `apps/web/src/app/api/cron/cleanup-classes/route.ts` |
| O-3: Cron cleanup-unconfirmed usa logger | `apps/web/src/app/api/cron/cleanup-unconfirmed/route.ts` |
| O-3: Webhook MP usa logger | `apps/web/src/app/api/mercadopago/webhook/route.ts` |
| O-2: Healthchecks.io ping en ambos crons | Mismos archivos — `pingHealthcheck()` con `HEALTHCHECK_CLEANUP_CLASSES_UUID` / `HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID` |
| O-5: Cloudinary en `remotePatterns` | `apps/web/next.config.js` |
| O-1: `@sentry/nextjs` en package.json + config | `sentry.client.config.ts`, `sentry.server.config.ts`, `src/instrumentation.ts`, `next.config.js` (withSentryConfig con try/catch) |
| O-8: N+1 queries verificado — no existe | `my-classes/page.tsx` usa `Promise.all` con nested selects; sin loops de fetches |
| O-9: Badge de notificaciones en tiempo real | `components/ui/NotificationBell.tsx` (client, Supabase Realtime INSERT) + `TopBar.tsx` actualizado |
| O-14: Cron timeout analizado | Cron actual es rápido para alpha (≤100 usuarios); no hay bucles por usuario, solo queries batch |

### ⏳ Pendiente (requiere acción externa)

| Item | Razón |
|---|---|
| O-1 DSN configurado | Usuario debe crear cuenta Sentry free y obtener el DSN |
| O-2 UUIDs de Healthchecks.io | Usuario debe crear cuenta en healthchecks.io y crear 2 monitores |
| O-4 Vercel Analytics | Habilitar desde el dashboard de Vercel (1 click) |
| O-7 DB slow queries | Revisar Supabase dashboard → Performance → Slow queries post-deploy |
| O-10 Supabase rate | Monitorear "API requests" en Supabase dashboard durante alpha |
| O-13 PWA/Service Worker | Post-alpha — requiere `next-pwa` y testing en mobile browser |
| O-15 Backups | Free tier Supabase no tiene backups automáticos; hacer dump manual semanal o upgrade a Pro |

### 📌 Acciones del usuario pendientes

- [ ] Crear cuenta Sentry free → obtener DSN → agregar `NEXT_PUBLIC_SENTRY_DSN` en Vercel
- [ ] Crear cuenta Healthchecks.io → crear 2 monitores (daily 03:00 UTC y 04:00 UTC, grace 2h) → agregar `HEALTHCHECK_CLEANUP_CLASSES_UUID` y `HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID` en Vercel
- [ ] En Vercel dashboard → Analytics → Enable (gratis para hobby tier)
- [ ] Verificar que Supabase Realtime está habilitado para la tabla `notifications` (Supabase dashboard → Table Editor → notifications → Realtime toggle ON)
- [ ] (Opcional) Upgrade Supabase a Pro ($25/mes) si las métricas de API requests se acercan al límite del free tier

### 📝 Memoria actualizada

- [x] `CLAUDE.md` — sección observabilidad
- [x] `resumen.md` — bloque sesión 8
