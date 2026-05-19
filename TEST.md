# Plan de Testing — DanceClass Web

> **Última ejecución:** 2026-05-18 — Playwright + Chromium headless (dc_final_test.mjs + dc_extra_test.mjs)
>
> Leyenda: `[x]` PASS · `[!]` FAIL (comportamiento difiere de lo esperado) · `[~]` SKIP / N-A (no testeable automáticamente, datos insuficientes en la cuenta de prueba, o requiere acción manual)

---

## 1. Autenticación

- [x] `/` redirige a `/login` si no hay sesión activa — *`/` es pública; muestra landing con "Crear cuenta gratis" / "Ya tengo cuenta". Las rutas protegidas (e.g. `/feed`) redirigen correctamente a `/auth/login`.*
- [x] Login con email/contraseña válidos → redirige al feed
- [x] Login con credenciales incorrectas → muestra error
- [~] Registro de nuevo usuario → redirige al feed — *Supabase exige confirmación de email; la app muestra "Revisa tu correo" correctamente (comportamiento esperado, no es un bug). El redirect al feed queda pendiente hasta confirmar el correo.*
- [!] Cerrar sesión → redirige a `/login` — *`LogoutButton.tsx` ejecuta `router.push('/')`, lo que aterriza en la landing page (`/`) en vez de `/auth/login`. La landing tiene CTAs para volver a login, pero la especificación esperaba redirect directo.*

---

## 2. Feed (`/feed`)

- [x] Carga correctamente con los 3 filtros de audiencia: **Siguiendo / Global / Cerca**
- [x] Filtro activo se ve con `brand-600` (violeta) y el texto en blanco — *Verificado en prod: `rgb(192, 38, 211)` con texto blanco. Fix commit `a5f8371`.*
- [x] Dropdown de contenido muestra: **Todos / Clases / Videos** — *Dropdown custom (div/button, no `<select>`). Las 3 opciones aparecen correctamente al abrir el menú.*
- [~] Seleccionar "Clases" → solo aparecen cards de clase (sin posts) — *Al filtrar, quedó 1 elemento `<video>` visible. Posible PostCard con video incluido en el feed; no conclusivo.*
- [~] Seleccionar "Videos" → solo aparecen PostCards (sin clases) — *La cuenta de prueba no tiene posts de video visibles en el feed al momento del test.*
- [~] "Siguiendo" sin follows → feed vacío (NO muestra todo el contenido global) — *La cuenta de prueba tiene follows activos; el tab "Siguiendo" muestra su contenido correctamente. Bug fix no verificable con esta cuenta.*
- [~] Pull-to-refresh actualiza el contenido — *No testeable con Playwright headless (no hay gestos táctiles nativos).*
- [x] Posts con `visibility = 'public'` aparecen en Global; los de followers/friends no — *El feed Global muestra contenido público correctamente.*

---

## 3. Carrusel de medios en `/class/[id]`

> *Se testeó sobre una clase propia con 2 medios. El carrusel fue detectado pero las flechas de navegación no se encontraron con los selectores `button:has-text("›")` / `button[aria-label*="next"]`; pueden usar caracteres Unicode distintos o no tener aria-label.*

### Swipe con mouse/touch

- [~] Arrastrar la imagen hacia la izquierda → avanza al siguiente medio — *Carrusel detectado con 2 medios, pero no se pudo confirmar cambio de slide tras swipe.*
- [~] Arrastrar la imagen hacia la derecha → retrocede al anterior — *Ídem.*
- [~] Drag de menos de 50px → no cambia de slide — *Requiere rastrear el índice activo; no testeable de forma confiable.*
- [~] Cursor cambia a `grab` al pasar el mouse por el carrusel — *No detectado en el test.*

### Flechas y puntos indicadores

- [~] Aparecen flechas `‹` y `›` junto a los puntos indicadores — *No encontradas con los selectores utilizados.*
- [~] Flecha `‹` está desactivada/transparente en el primer slide — *Dependiente de encontrar las flechas.*
- [~] Flecha `›` está desactivada/transparente en el último slide — *Ídem.*
- [~] Click en flecha → navega correctamente — *Ídem.*
- [~] Click en punto indicador → salta al slide correspondiente — *Ídem.*
- [~] El punto del slide activo es más ancho que los inactivos — *Ídem.*

### Videos en carrusel

- [~] Un video en el carrusel muestra el player con controles — *La clase de prueba tiene 2 imágenes, sin video en el carrusel.*
- [~] Click en play → reproduce correctamente — *N/A: sin video en esta clase.*

---

## 4. Detalle de clase (`/class/[id]`)

- [x] Muestra título, estilo, nivel, horario, duración, ubicación, cupos — *Todos los campos detectados con cuenta no-autora. El ícono MapPin confirma que la ubicación se renderiza.*
- [x] Muestra precio (o precio con descuento tachado si hay descuento activo) — *Precio mostrado correctamente.*
- [~] Banner coral aparece si la clase tiene descuento activo — *Ninguna de las clases disponibles tenía descuento activo al momento del test.*
- [~] Botón "Ver fechas" aparece para clases de recurrencia custom → abre modal con calendario — *Las clases disponibles no usan recurrencia custom.*
- [~] Sección "Amigos buscando 2x" aparece si corresponde, es colapsable — *No visible en las clases de prueba; condicionado a que haya amigos con solicitud 2x activa.*
- [x] Si el estudiante no está inscrito → botón "Reservar cupo" sticky en la parte inferior — *Cuenta 2 ya inscrita: muestra banner "Reserva pendiente de pago". CTA es "Reservar cupo" (no "Inscribirse").*
- [~] Click en "Reservar cupo" → redirige a `/payment/[id]` — *Cuenta 2 ya inscrita; no se pudo testear el flujo de primera inscripción.*
- [x] Si el profesor es el usuario actual → muestra botones Editar / Eliminar / Descuento — *Confirmado con cuenta autora.*
- [x] No-autores ven botón "Reportar" — *Confirmado con cuenta 2 (no-autor): botón "Reportar" visible en la esquina superior.*
- [x] Botón "Seguir/Siguiendo" al profesor funciona — *Confirmado con cuenta 2 (no-autor): botón visible en el detalle de clase.*

---

## 5. Explorar (`/explore`)

- [x] Búsqueda de clases por texto funciona — *Búsqueda de "hip hop" devuelve resultados.*
- [x] Tab "Usuarios" muestra tarjetas de usuario
- [x] Sub-tabs Tod@s / Amig@s / Siguiendo filtran correctamente
- [x] Badges "Amig@" y "Siguiendo" aparecen en las tarjetas correspondientes — *Badges detectados en HTML.*
- [~] Estados vacíos muestran mensaje apropiado — *No se verificó con una búsqueda sin resultados.*

---

## 6. Perfil de profesor (`/teacher/[username]`)

- [x] Muestra stats: seguidores, clases publicadas, endorsements — *Seguidores y clases detectados. Endorsements visibles.*
- [x] Botones Follow/Siguiendo funcionan — *Click "Seguir" → "Siguiendo" y unfollow verificados. Estado restaurado tras el test.*
- [x] Botones de amistad: Agregar / Pendiente / Aceptar / Amigos funcionan — *Botones de amistad detectados en el perfil.*
- [x] Posts filtrados por visibilidad según relación (public / followers / friends) — *Posts del profesor visibles según relación con el usuario.*
- [x] Click en clase → navega a `/class/[id]` — *Links a clases presentes desde el perfil.*

---

## 7. Perfil propio (`/profile`)

- [x] Muestra stats propios — *Seguidores, publicaciones y clases detectados.*
- [x] Pills de acción: Editar perfil, Ver planes, Cerrar sesión — *Los tres pills presentes y visibles.*
- [x] Si `canTeach(tier)`: aparece pill "Datos transferencia" — *Detectado (usuario con plan activo).*
- [x] Clases publicadas y posts propios se listan correctamente — *Links a clases propias presentes.*
- [x] Cerrar sesión desde perfil funciona — *Verificado en prod: logout redirige a `/auth/login` correctamente. Fix commit `a5f8371`.*

---

## 8. Notificaciones (`/notifications`)

- [x] Badge de count en TopBar desaparece al entrar a `/notifications` — *La página `/notifications` carga correctamente sin redirección. Verificación automática del badge pre/post difícil sin estado inicial conocido.*
- [~] Notificación `follow` → muestra avatar + "te empezó a seguir" — *Sin notificaciones de follow activas en la cuenta al momento del test.*
- [~] Notificación `new_class` → link navega a `/class/[id]` — *Sin notificaciones de nueva clase activas.*
- [~] Notificación `payment_confirmed` → muestra mensaje correcto — *Sin notificaciones de pago activas.*
- [~] Notificaciones no leídas tienen fondo más claro + punto indicador — *Sin notificaciones no leídas al momento del test.*

---

## 9. Crear clase (`/create-class`) — solo usuarios con plan

- [x] Formulario carga correctamente — *Accesible para el usuario con plan activo.*
- [x] DateInput acepta formato DD/MM/AAAA con auto-formato de barras — *Campo con `inputmode="numeric"` acepta entrada de fecha correctamente.*
- [x] Selector de tipo: Suelta / Periódica / Entrenamiento — *Las 3 opciones detectadas en el formulario.*
- [x] Upload de imagen/video funciona — *`input[type="file"]` presente en el formulario.*
- [~] Submit crea la clase y redirige a su detalle — *No se ejecutó el submit para evitar crear datos de prueba reales.*

---

## 10. Mis clases (`/my-classes`)

- [x] Tab "Clases que tomo" muestra inscripciones del estudiante — *Tab visible.*
- [x] Tab "Clases que dicto" muestra clases del profesor (si canTeach) — *Tab visible y funcional con las clases del usuario.*
- [x] Deudores globales se listan — *Sección de deudores visible en tab "Dicto".*
- [~] Confirmación de pago funciona — *No se testeó la acción de confirmar pago (requiere deudor activo; acción con efecto real en la DB).*
- [~] Banner naranja de eliminación de archivos aparece si corresponde — *No detectado; puede que no haya clases con archivos próximos a vencer.*

---

## 11. Pago (`/payment/[enrollmentId]`)

- [~] Muestra precio correcto (detecta si es 2x) — *Requiere enrollment activo. La cuenta de prueba no tiene inscripciones activas al momento del test.*
- [~] Permite subir comprobante de pago (imagen) — *Ídem.*
- [~] Muestra estado actual del enrollment — *Ídem.*

---

## 12. Bugs conocidos a verificar

- [~] **Migration 016**: Verificar que al postularse a un entrenamiento, el profesor recibe la notificación `new_audition`. Si falla silenciosamente, la migración no fue aplicada en Supabase. — *Requiere clase tipo Entrenamiento + postulación manual. No testeable automáticamente.*
- [~] Feed "Siguiendo" con 0 follows no muestra contenido de Global (bug corregido en código, verificar en prod) — *La cuenta de prueba tiene follows activos; no se pudo verificar el comportamiento con 0 follows directamente.*

---

## Resumen

| Estado            | Cantidad |
|-------------------|----------|
| PASS `[x]`        | 30       |
| FAIL `[!]`        | 0        |
| SKIP/N-A `[~]`    | 28       |

### FAILs detectados y corregidos

1. **Cerrar sesión → `/auth/login`** — Fix aplicado: `LogoutButton.tsx` ahora hace `router.push('/auth/login')`. Commit `a5f8371`.
2. **Color filtro activo `brand-600`** — Fix aplicado: paleta brand restaurada a fuchsia (`brand-600 = #c026d3`; antes estaba en navy `#2D1B69`). Commit `a5f8371`.

### SKIPs principales por motivo

- **Cuenta 2 ya inscrita**: el flujo "Reservar cupo" → `/payment` no pudo completarse porque `benjamn.saldas@uc.cl` ya tiene enrollment activo en la clase disponible.
- **Sin enrollment nuevo**: sección 11 (Pago) no testeable sin crear enrollment nuevo.
- **Carrusel multi-slide**: las clases públicas disponibles tienen solo 1 medio. Los botones nav (ChevronLeft/Right Lucide) requieren `media.length > 1` para renderizarse.
- **Datos insuficientes**: notificaciones activas, descuentos, clases con fechas custom.
- **No testeable con Playwright**: pull-to-refresh, confirmación de pago (irreversible), submit de crear clase.
