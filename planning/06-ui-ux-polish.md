# Sesión 6 — UI / UX / Polish

> **Objetivo de la sesión:** detalles que distinguen una app "que funciona" de una que **da confianza**. Empty states, copy, validaciones cliente coherentes con backend, accesibilidad básica, dark mode 100 %.

## Instrucciones obligatorias
- Al tocar componentes web + mobile, aplicar las 7 reglas de dark mode de CLAUDE.md.
- Cada pantalla afectada → screenshot en light + dark antes y después.
- Al terminar, **actualizar `CLAUDE.md`** (si se introducen nuevos patrones) y **`resumen.md`**.

---

## U-1 — Empty states sin texto guía (P1)

**Hallazgo:** muchas listas dicen "Sin clases" o "No hay nada" pero no orientan al usuario.

**Acción:** revisión por pantalla:

| Pantalla | Empty state actual | Sugerido |
|---|---|---|
| `/feed` siguiendo (sin follows) | "No hay clases" | "Sigue a profesores para ver sus clases en tu feed. [Explorar profesores]" |
| `/feed` cerca (sin ciudad) | "No hay clases" | "Configura tu ciudad para ver clases cerca. [Editar perfil]" |
| `/my-classes` que tomo (cero) | OK (link a explore) | Mantener |
| `/my-classes` que dicto (cero) | OK | Confirmar copy |
| `/my-classes` historial (cero) | ? | "Aún no tienes pagos registrados. Cuando confirmes tu primer pago aparecerá aquí." |
| `/my-classes` ensayos (cero) | ? | "Aún no organizaste ni te invitaron a ningún ensayo. [Crear ensayo]" |
| `/notifications` (cero) | ? | "Sin notificaciones — te avisaremos aquí cuando pase algo." |
| `/agenda` semana sin eventos | "Sin clases" | "Tu semana está libre — inscríbete a una clase desde el feed." |
| `/teacher/[username]` sin posts | "No hay publicaciones" | OK |
| `/explore` sin matches búsqueda | ? | "Ningún resultado para 'XX' — prueba con otro término." |

---

## U-2 — `confirm()` nativo en lugar de `ConfirmDialog` (P2)

**Hallazgo:** buscar `confirm(` en `apps/web/src` y `apps/mobile/`. Cualquier ocurrencia usando `window.confirm()` o `Alert.alert()` con OK/Cancel para acciones destructivas debería pasar al componente.

**Acción:**
- Reemplazar todas las ocurrencias con `ConfirmDialog` (web) y un mobile equivalente (o `Alert.alert` con titles + body explícitos).

---

## U-3 — Validaciones frontend ≠ backend (P1)

**Hallazgo:**
- Zod en formularios web es robusto, pero algunos campos en mobile no validan tan estrictamente.
- Ejemplo: `username` se permite mayúsculas en web pero el backend está en lowercase → conflicto.

**Acción:**
1. Centralizar todos los schemas Zod en `packages/shared/src/schemas/` y reusar en web y mobile.
2. Casos a validar:
   - `username`: regex `^[a-z0-9_]{3,20}$`, lowercase obligatorio
   - `full_name`: max 100 chars
   - `bio`: max 280 chars
   - `instagram_handle`: opcional, sin `@`
   - `phone` (audición): formato chileno `+56...` (regex)
   - `RUT` (payment-info): validador con dígito verificador
   - `email` re-validado en server

---

## U-4 — Inconsistencia de tipografías y tamaños (P2)

**Hallazgo:** mezcla de `text-lg`, `text-xl`, `text-2xl` sin sistema claro.

**Acción:**
- Definir escala tipográfica en CLAUDE.md (h1: text-2xl, h2: text-xl, body: text-base, caption: text-sm, micro: text-xs).
- Auditar componentes principales y normalizar.

---

## U-5 — Botones primarios/secundarios inconsistentes (P2)

**Hallazgo:**
- Web tiene `.btn-primary`, `.btn-secondary`, `.btn-ghost` en `globals.css`.
- Mobile no tiene equivalente — cada pantalla tiene su propio styling.

**Acción:**
- Crear `components/ui/Button.tsx` (mobile) con variantes `primary` / `secondary` / `ghost` / `destructive`.
- Refactor incremental de pantallas mobile.

---

## U-6 — Toasts/feedback sin sistema unificado (P2)

**Hallazgo:**
- Algunos errores aparecen como texto rojo inline, otros como Alert.alert, otros silenciosos.
- Usuario no sabe siempre qué pasó.

**Acción:**
- Web: instalar `sonner` o `react-hot-toast` para notificaciones unificadas.
- Mobile: helper `showToast(message, type)` que usa `Alert.alert` o un componente custom.

---

## U-7 — Accesibilidad básica (P1)

**Hallazgo:**
- Falta verificar:
  - Contraste WCAG AA en todos los pares de color (especialmente dark mode).
  - `aria-label` en botones solo-icono.
  - `alt` en imágenes.
  - Foco visible (`focus:ring`) en botones e inputs.
  - Navegación por teclado en formularios.

**Acción:**
- Pasar Lighthouse / Axe en cada pantalla pública.
- Corregir issues de severidad alta.

---

## U-8 — Loading states ausentes (P1)

**Hallazgo:**
- Muchas mutaciones (inscribirse, salir, pagar, calificar) no muestran spinner en el botón.
- Usuario hace doble click → mutación duplicada → estado inconsistente.

**Acción:**
- Cada `handle*` async debe:
  - Setear `isLoading=true` antes del await
  - Deshabilitar el botón y cambiar texto a "Procesando..."
  - Finally bloquea siempre
- Auditar componentes con muchas acciones: `ClassDetailClient`, `PaymentClient`, `MyClassesClient`, `AuditionsListClient`.

---

## U-9 — Mensajes de error genéricos (P2)

**Hallazgo:** "Error al inscribir" sin contexto.

**Acción:**
- Cada `catch` mapea código de error a mensaje específico:
  - 409 `already_enrolled` → "Ya estás inscrito en esta clase."
  - 409 `no_spots` → "Esta clase se llenó hace un momento. Prueba con otra."
  - 403 `subscription_required` → "Necesitas un plan para inscribirte. [Ver planes]"
- Pasar tests A/B con usuarios reales en alpha cerrado.

---

## U-10 — Mobile — color del status bar en dark mode (P2)

**Hallazgo:**
- En light mode el status bar suele ser dark content.
- En dark mode debería ser light content.
- Verificar `<StatusBar style="dark" />` cambia con el tema.

**Acción:**
- En `_layout.tsx` (mobile): `<StatusBar style={isDark ? 'light' : 'dark'} />`.

---

## U-11 — Web — favicon en dark mode (P2)

**Hallazgo:**
- El favicon es el logo en color brand. Sobre tab oscuro de Chrome puede no contrastar.

**Acción:**
- Generar versión inversa para dark mode con `<link rel="icon" media="(prefers-color-scheme: dark)">`.

---

## U-12 — Formularios — auto-save vs save manual (P2)

**Hallazgo:**
- `EditProfileForm` (web) — ¿guarda automáticamente o requiere botón "Guardar"?
- Si manual y el usuario sale sin guardar → pierde los cambios sin aviso.

**Acción:**
- Si manual, agregar `beforeunload` warning o `<Prompt>` cuando hay cambios sin guardar.
- Alternativa: auto-save por campo con debounce.

---

## U-13 — Mobile — KeyboardAvoidingView (P1)

**Hallazgo:**
- En `(auth)/login.tsx`, `(auth)/register.tsx`, formularios de crear/editar clase → el teclado puede tapar el botón de submit.

**Acción:**
- `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>` wrapper.
- `<ScrollView keyboardShouldPersistTaps="handled">` interior.

---

## U-14 — Copy de la app — consistencia (P2)

**Hallazgo:**
- "Clase" / "Curso" / "Entrenamiento" — los tres tipos.
- "Profesor" / "Profesora" / "Profesor/a" / "Profe" — voz inconsistente.
- "Tú" / "Usted" — formal vs informal.

**Acción:**
- Documento de tono y voz en CLAUDE.md o `docs/voice.md`.
- Decisión: tutear ("tú"), profesor genérico ("profe" cuando informal).
- Aplicar revisión completa de copy.

---

## U-15 — Avatares default con iniciales — manejo de unicode (P2)

**Hallazgo:**
- `Avatar.tsx` usa iniciales de full_name. Si nombre tiene emoji o caracteres raros, puede romper.
- Si nombre es vacío, ¿qué muestra?

**Acción:**
- Defensive: si no hay iniciales válidas, mostrar ícono User genérico.

---

## U-16 — Modales sin escape key (web) (P2)

**Hallazgo:**
- ¿`AuditionModal`, `DiscountModal`, `CreatePostModal`, `RatingModal`, `ConfirmDialog` cierran con Escape?

**Acción:**
- Usar `<dialog>` HTML5 nativo o asegurar `onKeyDown` con Escape en cada modal.

---

## U-17 — Web — modales sin focus trap (P2)

**Hallazgo:**
- Al abrir modal, foco debe ir al primer input.
- Tabular debe quedarse dentro del modal.

**Acción:**
- Usar librería `focus-trap-react` o implementación manual.

---

## U-18 — Dark mode 100 % — residuos (P1)

**Hallazgo:**
- `CLAUDE.md` documenta auditorías hechas, pero hay riesgo de regresiones en nuevos componentes.

**Acción:**
- Pasar cada pantalla en producción tanto en light como dark.
- Lista negra de detectados:
  - [ ] _llenar al hacer el sweep_

---

## U-19 — Imágenes/videos sin manejo de fallback (P2)

**Hallazgo:**
- Si `<img src="...">` falla (URL caída), se ve un placeholder roto.

**Acción:**
- `onError` en cada `<img>` que setea src a un placeholder.
- `expo-image` en mobile tiene `placeholder` prop útil.

---

## U-20 — Mobile — botón de share consistente (P2)

Ver M-9.

---

## Reporte de cierre

### ✅ Logrado

| ID | Cambio |
|---|---|
| U-1 | Empty states mejorados en `/feed` (siguiendo/cerca), `/notifications`, `/explore`, `/my-classes` (historial, ensayos), `/agenda`. Cada uno incluye copy orientador y link de acción cuando aplica. |
| U-3 | Validadores centralizados en `packages/shared/src/lib/validators.ts`: `validateUsername` (regex `^[a-z0-9_]{3,20}$`), `validateRut` (dígito verificador), `validateFullName`, `validateBio`, `validateInstagramHandle`, `validateChileanPhone`. Exportados desde `@danceclass/shared`. Integrados en `EditProfileForm` (web), `PaymentInfoForm` (web, RUT vía Zod), `profile/edit.tsx` (mobile). |
| U-7 | `aria-label` en botones de solo ícono revisado; `focus:ring` en botones interactivos. |
| U-8 | Confirmado que ClassDetailClient, PaymentClient, MyClassesClient, AuditionsListClient, ReportModal, DiscountModal, AuditionModal, RatingModal ya tienen loading states completos. |
| U-13 | `KeyboardAvoidingView` + `Platform.OS` añadido en `class/create.tsx`, `class/[id]/edit.tsx`, `profile/edit.tsx`, `profile/payment-info.tsx` (mobile). Login y register ya lo tenían. |
| U-15 | `Avatar.tsx` (web): `getInitials` reescrita con regex Unicode `\p{L}\p{N}` para nombres con emoji o caracteres raros. Fallback a ícono `User` (lucide) cuando no hay iniciales válidas. |
| U-16 | Hook `useEscapeKey` creado en `apps/web/src/hooks/useEscapeKey.ts`. Integrado en `ConfirmDialog`, `AuditionModal`, `DiscountModal`, `CreatePostModal`, `RatingModal`. |
| U-18 | Dark mode sweep: `CustomDatesCalendar`, `DashboardClient`, `CreatePostModal` (upload zone, labels). |
| U-2 | Verificado: no hay `window.confirm()` en el codebase. Todos los destructivos ya usan `ConfirmDialog`. |
| U-10 | Verificado: `StatusBar style={isDark ? 'light' : 'dark'}` ya implementado en `_layout.tsx` mobile. |

### ⏳ Pendiente (post-alpha)

| ID | Razón |
|---|---|
| U-4 | Escala tipográfica — cambio cosmético sin riesgo de regresión; aplazar para post-alpha. |
| U-5 | `Button.tsx` en mobile — requiere refactor incremental de todas las pantallas; riesgo de regresión alto. |
| U-6 | Sistema de toasts unificado — mejora UX pero no bloquea alpha. |
| U-9 | Mensajes de error más específicos — parcialmente implementado; dejar refinamiento post-alpha. |
| U-11 | Favicon dark mode — cosmético; no afecta funcionalidad. |
| U-12 | Auto-save / beforeunload warning — `EditProfileForm` ya requiere botón Guardar; añadir warning sería un nice-to-have. |
| U-14 | Documento de tono y voz — aplazar; revisar copy en bloque post-alpha. |
| U-17 | Focus trap en modales — mejora de accesibilidad avanzada; post-alpha. |
| U-19 | Imágenes sin fallback `onError` — mejorar con `next/image` placeholder; post-alpha. |
| U-20 | Ver M-9 — botón Share en mobile ya implementado. |

### 📝 Memoria actualizada

- [x] `CLAUDE.md` — `useEscapeKey`, `KeyboardAvoidingView`, validators compartidos, Avatar Unicode fallback
- [x] `resumen.md` — bloque sesión 2026-05-30 (UI/UX Polish)
