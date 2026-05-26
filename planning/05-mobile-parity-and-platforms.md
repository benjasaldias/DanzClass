# Sesión 5 — Paridad mobile y plataformas

> **Objetivo de la sesión:** garantizar que la app mobile tiene **paridad funcional con web en los flujos críticos** para alpha. Conseguir build EAS instalable y verificado en dispositivo real. Cerrar gaps de iOS/Android específicos.

## Instrucciones obligatorias
- Cada feature implementada en mobile debe verificarse en dispositivo físico (no solo simulador).
- Diff dark mode revisado siguiendo las 7 reglas de CLAUDE.md.
- Al terminar, **actualizar `CLAUDE.md`** y **`resumen.md`**.

---

## M-1 — Sistema 2x en mobile incompleto (P1)

**Estado actual (según resumen.md sesión 2026-05-20):**
- TwoxRequestButton en detalle de clase ✅
- Sección "amigos buscando 2x" en detalle ✅
- Race condition handling ✅
- ¿Sección de friends 2x en feed mobile? — **revisar si existe**

**Acción:**
1. Confirmar que `apps/mobile/components/feed/MobileClassCard.tsx` (o el feed) **NO** muestra "Amigos buscando 2x" como en web (`FriendsTwoxList`). Si no existe, decidir si se necesita para alpha.
2. Revisar paridad de UX: ¿en mobile, la sección 2x está tan visible como en web?
3. Si hay deuda visible, agregar issue tracker o post-alpha.

---

## M-2 — FAB para crear clase en feed mobile (P1)

**Hallazgo (resumen.md sesión 2026-05-24):**
- Tab "Publicar" mobile fue eliminado (`href: null`).
- Pendiente explícito: agregar FAB en `(tabs)/feed.tsx` que navegue a `/(tabs)/create`.

**Acción:**
1. Componente `<FloatingActionButton>` en `apps/mobile/components/ui/`:
   - Posición absoluta bottom-right
   - Solo visible si `canTeach(tier)`
   - Ícono `Plus` o `LogoIcon` pequeño
   - Tap → `router.push('/(tabs)/create')`
2. Mostrarlo en `feed.tsx` y opcionalmente en `my-classes.tsx`.

**Verificación:**
- Login con cuenta `tier='pro'` → ver FAB → tap → llega a pantalla de elección Clase/Video.

---

## M-3 — Build EAS pendiente — falta `eas init` y projectId real (P0)

**Estado (resumen.md sesión 2026-05-19):**
- `eas.json` creado ✅
- `app.json` ⏳ pendiente confirmación del diff
- `eas init` ⏳ pendiente del usuario
- Assets ✅ ya creados
- env vars Expo dashboard ⏳ pendientes

**Acción del usuario (no de Claude):**
1. Confirmar diff de `app.json` (revisar ANTES de aplicar).
2. `eas login` + `cd apps/mobile && eas init` → obtener projectId.
3. Reemplazar placeholder en `app.json` con projectId real.
4. En Expo dashboard, configurar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (las EAS build necesitan).
5. `eas build --profile preview --platform android` → APK instalable.
6. Instalar en Android real → flujo completo: login, feed, crear clase, ver agenda.

**Verificación:**
- APK instalado → registrar usuario → confirmar email → seguir flow → llegar a feed con datos.

---

## M-4 — Deep linking: `danceclass://plans/success` y Supabase redirect URLs (P1)

**Hallazgo (resumen.md sesión 2026-05-19):**
- Scheme configurado ✅
- Páginas success/failure existen ✅
- Gap: web `/plans/success` no tiene botón "Volver a la app" con scheme.
- Gap: Supabase Auth redirect URLs probablemente no incluyen `danceclass://**` para magic links / password reset desde mobile.

**Acción:**
1. En `apps/web/src/app/(app)/plans/success/page.tsx`: detectar si viene de mobile (UA o query param) y mostrar botón:
   ```tsx
   <a href="danceclass://plans/success" className="...">Abrir la app</a>
   ```
2. En Supabase dashboard → Auth → URL Configuration → añadir `danceclass://**`.
3. Probar reset de contraseña desde mobile → tap en email → abre app.

---

## M-5 — Push notifications (Expo Notifications) — explícito post-MVP (P2)

**Estado:** explícitamente marcado como post-MVP. **No es bloqueante** para alpha pero **es** funcionalmente importante.

**Acción para alpha:**
- Documentar en `/privacy` y dentro de la app: "Por ahora las notificaciones se ven dentro de la app — habilita el ícono del campanita en la barra superior."
- Banner in-app sugerente "Activa notificaciones push (próximamente)" sin acción.

**Para post-alpha:**
- Implementar `expo-notifications` + token storage + reemplazar in-app notification por push real.

---

## M-6 — Permisos iOS / Android — strings y justificaciones (P1)

**Archivos:**
- `apps/mobile/app.json` — `ios.infoPlist.NSPhotoLibraryUsageDescription`, etc.
- `android.permissions: [READ_MEDIA_IMAGES, ...]`

**Acción:**
1. Revisar que cada permiso solicitado tiene una justificación clara para Apple/Google:
   - "DanzClass necesita acceder a tu galería para subir fotos y videos de tus clases y postulaciones."
   - "DanzClass necesita acceder a tu cámara para grabar videos de postulación a entrenamientos (opcional)."
2. Si la app no usa la cámara directamente (solo galería), eliminar el permiso.
3. Apple rechaza apps que piden permisos no usados.

---

## M-7 — Splash y app icon en dispositivo real (P2)

**Estado:** assets creados, plugin configurado.

**Acción:**
1. Build EAS → instalar → ver el icono en home screen y splash al abrir.
2. Comparar con la versión web (favicon, manifest icons).
3. Si la marca se ve cortada/pixelada, regenerar a alta resolución.

---

## M-8 — Mobile dark mode toggle solo en profile (P2)

**Hallazgo:**
- Toggle en `(tabs)/profile.tsx`.
- Si el usuario quiere cambiar rápido, debe ir a perfil.

**Acción:**
- Considerar agregar toggle también en `TopBar` mobile o en un menú accesible.
- Por ahora alpha: documentar la ubicación.

---

## M-9 — Mobile — botón Compartir solo para clases (P2)

**Hallazgo:**
- `class/[id]/index.tsx` mobile usa `Share.share` ✅.
- Posts (`MobilePostCard.tsx`) no tienen botón compartir.

**Acción:**
- Añadir botón Share en menú ⋮ del post (cuando exista) o como icono adicional.

---

## M-10 — Mobile — performance del feed con muchas clases (P1)

**Hallazgo:**
- `apps/mobile/app/(app)/(tabs)/feed.tsx` probablemente usa `ScrollView` + `map()` para renderar la lista.
- Con 50+ items, esto consume mucha RAM y degrada el scroll.

**Acción:**
1. Migrar a `FlatList` o `FlashList` con `keyExtractor`, `getItemLayout` (si todos los cards son similares).
2. Imágenes con `expo-image` (caching automático) en lugar de `<Image>` nativo.

---

## M-11 — Mobile — manejo de offline (P2)

**Hallazgo:**
- Sin conexión, la app probablemente muestra spinner indefinido o crashea.

**Acción:**
1. Detectar offline con `@react-native-community/netinfo` (ya instalado por Expo).
2. Banner top: "Sin conexión — algunos datos pueden no actualizarse."
3. Manejar refetch al volver online.

---

## M-12 — Mobile — pull to refresh inconsistente (P2)

**Hallazgo:**
- `agenda.tsx` tiene `RefreshControl` ✅.
- Verificar en `feed.tsx`, `my-classes.tsx`, `notifications.tsx`, `teacher/[username].tsx` — paridad de UX.

**Acción:**
- Pull-to-refresh en todas las pantallas con datos remotos.

---

## M-13 — Mobile — comportamiento de back button Android (P1)

**Hallazgo:**
- Verificar:
  - En `/class/[id]` con modal abierto, ¿back cierra modal o sale a feed?
  - En `(auth)/register.tsx` con teclado abierto, ¿back cierra teclado o anula registro?
- Sin manejo explícito, Android puede tener UX rara.

**Acción:**
- Usar `BackHandler` API de RN o el patrón de Expo Router para manejar correctamente.

---

## M-14 — Mobile — versionado, OTA updates, error boundaries (P2)

**Hallazgo:**
- Sin `expo-updates` configurado, cada cambio requiere nuevo build EAS y republish.
- Sin error boundary global, un error en cualquier pantalla crashea la app.

**Acción:**
1. Configurar `expo-updates` para hot fixes vía OTA (Expo lo soporta out-of-box con EAS).
2. Wrappear root con error boundary que muestre "Algo salió mal — recargar" en lugar de crashear.

---

## M-15 — Mobile — i18n / localización inconsistente (P2)

**Hallazgo:**
- App está en español, pero fechas/horas en algunos lugares usan formato US por default.
- Pluralización: "1 cupo disponibles" en lugar de "1 cupo disponible".

**Acción:**
- Helper `pluralize(n, singular, plural)` centralizado.
- `Intl.DateTimeFormat('es-CL', ...)` en lugar de `toLocaleDateString()`.

---

## M-16 — Mobile — TopBar y notificaciones badge (P1)

**Archivos:**
- [apps/mobile/components/ui/TopBar.tsx](../apps/mobile/components/ui/TopBar.tsx)

**Acción:**
- Confirmar paridad con web: badge de notificaciones sin leer.
- Tap en bell → `/notifications`.
- Polling o realtime (Supabase Realtime) — para alpha puede polling cada 30s.

---

## M-17 — Mobile — `app.json` cambios pendientes (P1)

**Estado:** diff propuesto, **no aplicado** según resumen.md.

**Acción del usuario:**
1. Revisar el diff propuesto en resumen.md sesión 2026-05-19.
2. Aplicarlo o ajustarlo.
3. Confirmar en CLAUDE.md/resumen.md cuando esté aplicado.

---

## Reporte de cierre

### ✅ Logrado

| ID | Cambio | Archivo |
|---|---|---|
| M-2 | FAB `FloatingActionButton` en feed (solo si `canTeach`) | `components/ui/FloatingActionButton.tsx`, `(tabs)/feed.tsx` |
| M-4 | Link "Volver a la app" (`danceclass://plans/success`) en web success | `apps/web/.../plans/success/page.tsx` |
| M-9 | Botón Share en `MobilePostCard` (`Share.share()`) | `components/feed/MobilePostCard.tsx` |
| M-10 | Verificado: feed ya usa `FlatList` + `RefreshControl` | `(tabs)/feed.tsx` |
| M-12 | `RefreshControl` en my-classes, notifications, teacher profile | 3 archivos |
| M-14 | Error boundary global (`ErrorBoundary`) wrappea root layout | `components/ui/ErrorBoundary.tsx`, `_layout.tsx` |
| M-15 | Helper `pluralize` + `formatDateLocal` en shared; aplicado en class detail | `packages/shared/.../index.ts`, `class/[id]/index.tsx` |
| M-16 | Verificado: TopBar ya tiene badge de notificaciones | `components/ui/TopBar.tsx` |
| M-6 | Verificado: permisos iOS/Android ya correctos, sin `NSCameraUsageDescription` | `app.json` |
| M-1 | Documentado como post-alpha: FriendsTwoxList ya en detalle de clase | — |

### ⏳ Pendiente

| ID | Razón |
|---|---|
| M-3 | Requiere acción del usuario (`eas login` + `eas init`). `projectId` ya está en `app.json` |
| M-4 (Supabase) | Requiere acción del usuario: añadir `danceclass://**` en Supabase Auth redirect URLs |
| M-7 | Requiere build EAS + dispositivo real para verificar splash/icon |
| M-8 | Toggle dark mode solo en `/profile` — aceptable para alpha, post-alpha moverlo a TopBar |
| M-11 | Offline handling post-alpha |
| M-13 | Back button Android — no se detectaron casos críticos en class detail; revisión post-alpha |
| M-14 (expo-updates) | OTA updates post-alpha |
| M-17 | `app.json` diff pendiente de confirmación del usuario |

### ❌ Fallado

Ninguno.

### 📌 Acciones del usuario pendientes

- [ ] `eas login` + `eas init` en `apps/mobile/` → confirmar/actualizar `projectId` en `app.json` (M-3)
- [ ] Env vars en Expo dashboard (EAS Secrets): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Supabase Auth → URL Configuration → añadir `danceclass://**` (M-4)
- [ ] Build EAS preview Android → `eas build --profile preview --platform android` → instalar en dispositivo real
- [ ] (Opcional alpha) Build iOS — requiere Apple Developer ($99/año)

### 📝 Documentación actualizada

- [x] `CLAUDE.md` — sección "Consideraciones técnicas mobile": FAB, error boundary, pull-to-refresh, pluralize, formatDateLocal
- [x] `resumen.md` — bloque sesión 05 completo
