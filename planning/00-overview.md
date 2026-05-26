# DanzClass — Plan de Pre-Lanzamiento Alpha

> **Estado:** Pre-Alpha cerrada. Auditoría realizada el 2026-05-25.
> **Objetivo:** Asegurar que la app sea **estable, coherente, robusta y suficientemente pulida** para una alpha pública real (≤ 100 usuarios reales pagando + invitados).

---

## 1. ¿Qué significa "lista para alpha"?

Alpha **NO** es perfecta. Alpha **SÍ** es:

1. **Sin pérdida de dinero ni datos** del usuario en flujos críticos: inscripción, pago, suscripción, audición.
2. **Sin escaladas de privilegios**: ningún usuario puede ver/editar/eliminar datos de otro fuera de las reglas de visibilidad declaradas.
3. **Sin estados inválidos persistentes**: ninguna combinación de inputs deja a un usuario "trabado" sin manera de salir.
4. **Onboarding completable**: registro → confirmación → suscripción → inscripción → pago → confirmación, sin callejones sin salida.
5. **Observable**: si algo falla, vemos qué falló (logs, errores en cliente, monitoreo de cron).
6. **Reversible**: existe plan documentado para revertir migración 025 y/o desactivar features (descuentos, ensayos, 2x) sin tirar la app.

Alpha **NO** requiere:
- Push notifications, OCR, dashboard analytics.
- Paridad 100 % web/mobile (puede haber features web-only durante alpha).
- Performance optimizado para 10 k usuarios — basta con ser usable en 100.

---

## 2. Cómo está organizada esta planificación

```text
planning/
├── 00-overview.md                     ← este archivo (contexto + criterios de éxito + cómo trabajar)
├── 01-critical-bugs.md                ← bugs y comportamientos frágiles que pueden romper la app
├── 02-auth-security-rls.md            ← middleware, RLS, env vars, superadmin, datos sensibles
├── 03-payments-and-money.md           ← Mercado Pago, suscripciones, 2x, descuentos, deudas
├── 04-data-integrity-and-edge-cases.md ← migraciones, fechas, race conditions, soft-deletes
├── 05-mobile-parity-and-platforms.md  ← gaps mobile, build EAS, deep links, push
├── 06-ui-ux-polish.md                 ← empty states, dark mode residuos, copy, validaciones
├── 07-testing-and-qa.md               ← coverage actual, plan de QA manual, regresiones
├── 08-performance-and-observability.md ← cron, logging, monitoreo, errores cliente
├── 09-launch-readiness-checklist.md   ← checklist final, comunicación, rollback, soporte
└── 90-feature-suggestions.md          ← ideas post-alpha (no bloqueantes)
```

Cada archivo de fase tiene:
- **Hallazgos** — con ruta + línea cuando aplica.
- **Acciones** — priorizadas P0 (bloqueante) / P1 (alto) / P2 (deseable).
- **Verificación** — cómo confirmar que el fix funciona.
- **Reporte de cierre** — plantilla que debe completarse al terminar la sesión.

---

## 3. Reglas para cada sesión de implementación

### 3.1 Antes de empezar una sesión

1. Leer la sesión correspondiente completa (`planning/0X-<fase>.md`).
2. Releer `CLAUDE.md` para refrescar convenciones (dark mode, fechas, RLS patterns).
3. Confirmar con el usuario qué scope se aborda (¿todos los P0? ¿solo seguridad?).

### 3.2 Durante la sesión

1. Trabajar **por hallazgo**: leer el bug, reproducir cuando aplica, fixear, verificar.
2. **No mezclar fases**: si en 01-critical-bugs aparece un tema de UI, anotarlo y mantenerse enfocado.
3. **Anti-regresiones**: cada vez que se toca un componente compartido (web + mobile + shared), revisar los 3.
4. **Tests Playwright**: agregar/actualizar test para cada bug crítico arreglado (no para polish).
5. **Migraciones**: siempre adjuntar el `.sql` en `supabase/migrations/` con número correlativo y nota de que **debe aplicarse en producción** manualmente.

### 3.3 Al terminar la sesión

**Obligatorio**:

1. **Actualizar `CLAUDE.md`** — añadir notas técnicas no derivables del código (decisiones, gotchas, patrones nuevos).
2. **Actualizar `resumen.md`** — añadir bloque de sesión con fecha, archivos modificados, migración aplicada, descripciones de fix.
3. **Generar reporte de cierre** según plantilla al final de cada `0X-<fase>.md`:
   - ✅ Logrado (con archivos)
   - ⏳ Pendiente (con razón)
   - ❌ Fallado (con causa y plan alternativo)
   - 🔁 Regresiones detectadas
   - 📌 Acciones del usuario pendientes (env vars, migraciones, deploys)
4. **Verificar que las migraciones SQL nuevas estén aplicadas en Supabase producción**.
5. **Commit** con mensaje claro: `fix(alpha-01): <resumen breve>` o `feat(alpha-03): <resumen>`.

---

## 4. Priorización global (resumen ejecutivo de hallazgos)

| ID | Fase | Hallazgo | Prioridad |
|---|---|---|---|
| S-1 | 02 | `/design-system-preview` accesible público en producción | **P0** |
| S-2 | 02 | Middleware deja `/class/*` totalmente público (depende de guards server-side por página) | P1 |
| S-3 | 02 | `notifications_insert_any` con `WITH CHECK (true)` permite spoofing de notificaciones cross-user | P1 |
| S-4 | 02 | `SUPERADMIN_USER_ID` como env var sin fallback ni audit log | P2 |
| S-5 | 02 | Service role usado en muchos routes — superficie de exposición amplia | P2 |
| P-1 | 03 | `MERCADOPAGO_WEBHOOK_SECRET` y `CRON_SECRET` deben verificarse en Vercel | **P0** |
| P-2 | 03 | Renovación anual MP no automática (gap explícito); usuario debe re-pagar manualmente | P1 |
| P-3 | 03 | `/api/class/enroll` no verifica que la clase tenga `start_date` o `ends_at` válidos para periódica | P1 |
| P-4 | 03 | 2x payment_assignee — solo el assignee puede transferir, pero no hay timeout si nunca paga | P2 |
| D-1 | 04 | Migración `024_add_start_date_to_classes.sql` ⚠️ **NO confirmado aplicada en prod** | **P0** |
| D-2 | 04 | Migración `025_billing_day.sql` ⚠️ **NO confirmado aplicada en prod** | **P0** |
| D-3 | 04 | `getClassSessions` para periódicas sin `start_date` usa ancla virtual (puede mostrar fechas incorrectas en `biweekly`) | P1 |
| D-4 | 04 | Cron `cleanup-classes` deduplicación por Set en memoria — si corre 2 veces el mismo día puede duplicar `class_reminder` | P2 |
| D-5 | 04 | `ratings.upsert` no valida que la clase finalizó (solo que el enrollment está confirmed) | P2 |
| C-1 | 01 | `/api/class/leave` cancela enrollment sin validar pagos pendientes — puede dejar pago "huérfano" | P1 |
| C-2 | 01 | `is_full` se calcula con `status !== 'cancelled'` pero la vista `class_spots` usa otra lógica → puede divergir | P1 |
| C-3 | 01 | Soft-delete de clase: media sigue en Storage hasta cron diario, ocupa quota | P2 |
| C-4 | 01 | Eliminación de cuenta no implementada → bloqueo legal para Apple/Google Play | **P0** |
| M-1 | 05 | Sistema 2x mobile incompleto — solo lectura de friends-2x, no descuentos mobile a 100 % | P1 |
| M-2 | 05 | FAB para crear clase en feed mobile no existe (tab eliminado) | P1 |
| M-3 | 05 | Build EAS no confirmado — `eas init`, projectId, env vars en Expo dashboard | **P0** |
| M-4 | 05 | Deep linking de `danceclass://plans/success` requiere Supabase auth redirect URL configurada | P1 |
| U-1 | 06 | `LogoutButton` solo en `/profile` (no en menú); usuario nuevo puede no encontrarlo | P2 |
| U-2 | 06 | `confirm()` nativo del browser usado en algunos lugares — debería ser `ConfirmDialog` | P2 |
| U-3 | 06 | Validación de inputs frontend a veces no espeja backend (precio, fechas, longitudes) | P1 |
| T-1 | 07 | Coverage E2E parcial: faltan flujos críticos (registro completo, pago MP en sandbox) | P1 |
| T-2 | 07 | No hay CI corriendo Playwright en cada push → fácil romper sin notarlo | P1 |
| O-1 | 08 | Sin Sentry / error tracking → errores cliente invisibles | P1 |
| O-2 | 08 | Cron sin alertas si falla → recordatorios silenciosamente perdidos | P1 |
| L-1 | 09 | Soporte / contacto: solo email en `/privacy` — sin canal directo de bugs alpha | P1 |
| L-2 | 09 | Política de eliminación de cuenta — requiere implementarse antes de Play Store | **P0** |

**Bloqueantes absolutos (P0)** que deben cerrarse antes del alpha:
- S-1, P-1, D-1, D-2, C-4, M-3, L-2

---

## 5. Orden sugerido de ejecución

```
Sesión 1 → planning/02-auth-security-rls.md  ✅ (2026-05-26)
Sesión 2 → planning/04-data-integrity-and-edge-cases.md  ✅ (2026-05-27)
Sesión 3 → planning/01-critical-bugs.md  ✅ (2026-05-28)
Sesión 4 → planning/03-payments-and-money.md  ✅ (2026-05-29)
Sesión 5 → planning/05-mobile-parity-and-platforms.md
Sesión 6 → planning/07-testing-and-qa.md
Sesión 7 → planning/06-ui-ux-polish.md
Sesión 8 → planning/08-performance-and-observability.md
Sesión 9 → planning/09-launch-readiness-checklist.md  (≤ 48 h antes del launch)
Sesión 10 (opcional) → planning/90-feature-suggestions.md
```

El orden está calibrado para:
1. Cerrar primero superficie de ataque y datos (02, 04) — sin esto cualquier fix de UI se construye sobre arena.
2. Eliminar bugs reproducibles (01) — el usuario los va a encontrar el primer día.
3. Asegurar money flow (03) — perder un pago de un alumno de pago es perder al usuario.
4. Mobile (05) — si no hay app en stores, no hay alpha móvil.
5. Tests/CI (07) — para no romper lo arreglado.
6. Polish (06) — el detalle que da confianza.
7. Observability (08) — para reaccionar cuando algo falle en producción.
8. Launch (09) — última pasada antes de invitar usuarios.

---

## 6. Criterios de "go / no-go" para invitar al primer usuario

| Criterio | Verificación |
|---|---|
| Todos los **P0** cerrados | Reporte de cierre de las sesiones 1-4 sin pendientes P0 |
| Cuenta de prueba completa el flujo: registro → confirmación email → suscripción Pro → publicar clase → otra cuenta se inscribe → paga → confirmar pago | Manual + Playwright |
| Webhook MP recibe evento real en producción y activa suscripción | Log de Vercel + verificación en DB |
| Cron diario corre 1 vez sin errores en producción | Log de Vercel |
| Mobile build EAS production instalable en iPhone real | Probar APK + IPA |
| Pantalla de eliminación de cuenta funcional | Manual |
| `/design-system-preview` removida o protegida | Visitar URL → 404 o login |
| Sentry (o equivalente) capturando errores | Forzar un error → ver en dashboard |
| Documento de contacto/bug-reporting en `/privacy` o pantalla in-app | Visible para usuario |

Si **cualquiera** falla → no-go.

---

## 7. Resto del set de archivos en este directorio

Lee los archivos en orden numérico. Cada uno es autocontenido: puede ejecutarse como una sesión independiente de Claude Code mientras se mantenga la disciplina del reporte de cierre al final.
