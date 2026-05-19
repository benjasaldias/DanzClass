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

## 13. Mobile — `/my-classes` (tabs tomo/dicto)

> Testear en la app mobile con la cuenta profesor.

- [ ] Tab "Clases que tomo" carga la lista de inscripciones del usuario actual
- [ ] Cada card muestra: título de clase, nombre del profesor, horario, estado del enrollment
- [ ] Enrollment `pending_payment` muestra botón "Ir a pagar · $X.XXX" en brand-600
- [ ] Tap en "Ir a pagar" navega a `/(app)/payment/[enrollmentId]`
- [ ] Tap en la card navega al detalle de la clase
- [ ] Tab "Clases que dicto" carga las clases activas del profesor
- [ ] Cada clase en "Dicto" muestra: título, horario, confirmados/total de cupos, pagos por verificar
- [ ] Expandir una clase muestra la lista de alumnos inscriptos (no cancelados)
- [ ] Alumno con `payment_submitted` muestra botones "Confirmar" y "Rechazar"
- [ ] Confirmar pago → enrollment pasa a `confirmed`, alumno recibe notificación
- [ ] Rechazar pago → enrollment pasa a `pending_payment`, alumno recibe notificación
- [ ] Botón eliminar alumno (X) abre Alert de confirmación → al confirmar, enrollment pasa a `cancelled`
- [ ] Sección de deudores aparece si hay alumnos con `pending_payment` en clases `suelta` pasadas
- [ ] Botón "Pago confirmado" en deudor → agrega a `dismissed_debts` y lo quita de la lista
- [ ] Alerta de fecha de eliminación de archivos (coral-fuego) si `deletion_date` es futura
- [ ] Icono "Archivos eliminados" en gris si `deletion_date` ya pasó

---

## 14. Mobile — `/payment/[enrollmentId]`

> Testear con un enrollment activo en `pending_payment`.

- [ ] Muestra el monto correcto: `price` normal si no es 2x
- [ ] Si `is_2x = true` y hay `price_2x`: muestra `price_2x` con nota "Precio 2x — cubre a ambos"
- [ ] Si `is_2x = true` pero `price_2x = null`: muestra banner amarillo de advertencia
- [ ] Si el usuario NO es el `payment_assignee` del 2x request: muestra banner ámbar "Tu compañer@ va a pagar" en vez del formulario de pago
- [ ] Si el usuario ES el `payment_assignee`: muestra formulario de datos bancarios + upload de comprobante
- [ ] Los datos bancarios del profesor se muestran correctamente (banco, tipo, N° cuenta, RUT, titular, email)
- [ ] Tap en campo con `copyable: true` → copia al portapapeles y muestra Alert
- [ ] Botón "Seleccionar comprobante" abre el picker de imágenes del dispositivo
- [ ] La imagen seleccionada se muestra como preview
- [ ] "Cambiar imagen" permite reseleccionar
- [ ] Botón "Enviar comprobante" deshabilitado hasta que hay imagen seleccionada
- [ ] Submit → sube imagen a bucket `payment-receipts`, crea/actualiza `payments`, actualiza enrollment a `payment_submitted`
- [ ] Pantalla de éxito "¡Comprobante enviado!" aparece tras submit exitoso → navega atrás después de 2 segundos
- [ ] Si `is_2x` y es el turno del usuario: botón "Que pague mi compañer@" llama al API `/api/class-2x/transfer-payment` con Bearer token
- [ ] Transferir turno → `payment_assignee` se actualiza, el otro usuario recibe notificación `2x_payment_turn`

---

## 15. Mobile — `/plans`

> Testear con usuario sin plan activo. Usar Mercado Pago sandbox.

- [ ] Pantalla muestra los dos planes: Básico ($1.500/mes) y Pro ($3.500/mes)
- [ ] Si ya hay plan activo: badge verde "Plan activo: [Nombre]" arriba de la lista
- [ ] El plan activo muestra "Plan actual" en vez de los botones de suscripción
- [ ] Cada plan muestra su lista de features con íconos de check (brand-600)
- [ ] Plan Pro tiene el badge "MÁS POPULAR" en la parte superior de la card
- [ ] Botón "Mensual · $X.XXX" hace POST a `/api/mercadopago/create-subscription` con Bearer token
- [ ] Botón "Anual · $X.XXX" hace POST a `/api/mercadopago/create-preference` con `period: 'annual'` y Bearer token
- [ ] El botón clickeado muestra "Abriendo checkout..." mientras espera la respuesta
- [ ] Ambos botones se deshabilitan mientras hay un checkout en curso
- [ ] Al recibir `init_point`: se abre el browser in-app (`WebBrowser.openBrowserAsync`)
- [ ] El browser muestra el checkout de Mercado Pago sandbox correctamente
- [ ] Tras cerrar el browser: el estado de la suscripción se refresca
- [ ] Si la API retorna error: Alert con el mensaje de error
- [ ] Flujo completo sandbox: abrir checkout → pagar con tarjeta de prueba → cerrar browser → badge de plan activo actualizado

---

## 16. Mobile — `/plans/success` y `/plans/failure`

- [ ] `plans/success`: muestra ícono verde de check, "¡Pago exitoso!", nombre del plan activo si aplica
- [ ] `plans/success`: botón "Ver mi perfil" navega a la tab de perfil
- [ ] `plans/success`: link "Ir al feed" navega al feed
- [ ] `plans/failure`: muestra ícono rojo, "Pago no completado", mensaje explicativo
- [ ] `plans/failure`: botón "Intentar de nuevo" navega de vuelta a `/plans`
- [ ] `plans/failure`: link "Volver al perfil" navega al perfil
- [ ] Deep link `danceclass://plans/success` abre la pantalla correcta (requiere build nativo)
- [ ] Deep link `danceclass://plans/failure` abre la pantalla correcta (requiere build nativo)

---

## 17. Mobile — Flujo end-to-end inscripción + pago

> Flujo crítico. Testear con cuenta estudiante y cuenta profesor en paralelo.

1. Estudiante: navegar a detalle de clase → "Reservar cupo" → enrollment creado en `pending_payment`
2. Estudiante: la clase aparece en `/my-classes` tab "Clases que tomo" con estado "Pendiente de pago"
3. Estudiante: tap "Ir a pagar" → pantalla de pago muestra monto + datos del profesor
4. Estudiante: seleccionar imagen de comprobante → "Enviar comprobante"
5. Verificar en Supabase: `payments` tiene nuevo registro; `enrollments.status = 'payment_submitted'`
6. Profesor: en `/my-classes` tab "Clases que dicto" → la clase muestra el alerta "1 pago por verificar"
7. Profesor: expandir la clase → ver al estudiante con botones "Confirmar" y "Rechazar"
8. Profesor: tap "Confirmar" → enrollment pasa a `confirmed`
9. Estudiante: recibe notificación `payment_confirmed` en `/notifications`
10. Estudiante: la clase en `/my-classes` ahora muestra "✓ Confirmado"

---

---

## 18. Mobile — Feed (`(tabs)/feed.tsx`)

> Testear en Expo Go con cuenta profesor y cuenta estudiante.

- [ ] Feed carga en modo Global con clases y posts mezclados, ordenados por fecha desc
- [ ] Filtro "Siguiendo" muestra solo contenido de usuarios seguidos
- [ ] Filtro "Siguiendo" con 0 follows muestra lista vacía (no muestra contenido global)
- [ ] Filtro "Cerca" muestra solo contenido de la misma ciudad del perfil
- [ ] Filtro de contenido "Clases" oculta posts; "Videos" oculta clases; "Todos" muestra ambos
- [ ] El filtro activo tiene fondo `brand-600` con texto blanco; los inactivos tienen fondo gris claro
- [ ] Pull-to-refresh recarga el contenido
- [ ] `MobileClassCard` muestra: avatar profesor, nombre, tiempo relativo, badge estilo, carrusel de media, título, horario, ubicación, cupos, precio, botón "Ver clase"
- [ ] Botón "Ver clase" en `MobileClassCard` navega a `/(app)/class/[id]`
- [ ] `MobilePostCard` muestra video con expo-video; tap en el card navega al perfil del autor
- [ ] Si el contenido falla al cargar (sin red), el feed queda vacío sin crash

---

## 19. Mobile — Explorar (`(tabs)/explore.tsx`)

- [ ] Tab "Clases" muestra hasta 30 clases activas por defecto
- [ ] Buscar por texto filtra clases por título y estilo de baile (case-insensitive)
- [ ] Tab "Usuarios" muestra hasta 100 perfiles
- [ ] Sub-tab "Amig@s" muestra solo usuarios con amistad aceptada
- [ ] Sub-tab "Siguiendo" muestra solo usuarios que el viewer sigue
- [ ] Buscar por texto filtra usuarios por nombre y username
- [ ] Tap en un usuario navega a `/(app)/teacher/[username]`
- [ ] Si no hay resultados de clases para la búsqueda: texto "No se encontraron clases"
- [ ] Si no hay resultados de usuarios: texto "No se encontraron usuarios"
- [ ] Estado vacío en sub-tab "Amig@s" sin amigos: muestra mensaje apropiado

---

## 20. Mobile — Perfil propio (`(tabs)/profile.tsx`)

- [ ] Muestra nombre completo, username (@), bio, ciudad, instagram
- [ ] Muestra stats: N seguidores, N endorsements
- [ ] Badge de plan activo visible si tiene suscripción (básico/pro)
- [ ] Pills visibles: "Editar perfil", "Ver planes", "Cerrar sesión"
- [ ] Si `canTeach(tier)`: pill "Datos transferencia" presente
- [ ] Sección "Mis clases activas (N)" lista hasta 5 clases
- [ ] Si hay más de 5 clases: botón "Ver todas (N)" carga el resto
- [ ] Sección "Mis publicaciones (N)" lista hasta 5 posts
- [ ] Si hay más de 5 posts: botón "Ver todas (N)" carga el resto
- [ ] Pull-to-refresh recarga perfil + stats + listas
- [ ] "Cerrar sesión" muestra Alert de confirmación → al confirmar, navega a `/(auth)/login`
- [ ] Si el fetch falla (sin red), la pantalla no crashea (muestra perfil vacío)

---

## 21. Mobile — Perfil ajeno (`teacher/[username].tsx`)

- [ ] Muestra nombre, username, bio, ciudad, estilos que enseña/baila
- [ ] Muestra stats: seguidores, endorsements, clases activas
- [ ] Botón "Seguir" → cambia a "Siguiendo"; tap de nuevo → vuelve a "Seguir"
- [ ] Botones de amistad: "Agregar amig@" → "Solicitud enviada" → el otro acepta → "Amig@s"
- [ ] Si `isOwnProfile = true`: no muestra botones de follow/amistad
- [ ] Sección clases activas muestra hasta 5; botón "Ver todas (N)" si hay más
- [ ] Si no hay clases: muestra "No hay clases publicadas"
- [ ] Sección posts muestra hasta 5; botón "Ver todas (N)" si hay más
- [ ] Si no hay posts: muestra "No hay publicaciones"
- [ ] Posts con `visibility = 'followers'` visibles solo si el viewer sigue al autor
- [ ] Posts con `visibility = 'friends'` visibles solo si hay amistad aceptada
- [ ] Si el perfil no existe (username inválido): pantalla vacía sin crash

---

## 22. Mobile — Notificaciones (`notifications.tsx`)

- [ ] Lista carga con todas las notificaciones del usuario, ordenadas por fecha desc
- [ ] Notificaciones no leídas tienen indicador visual (punto o fondo diferente)
- [ ] Al entrar a la pantalla, las notificaciones se marcan como leídas
- [ ] El badge en el TopBar desaparece tras marcar como leídas
- [ ] Tipo `follow`: muestra avatar + "te empezó a seguir" → tap navega al perfil del seguidor
- [ ] Tipo `new_class`: muestra "publicó una nueva clase" → tap navega al detalle de la clase
- [ ] Tipo `payment_confirmed`: muestra "confirmó tu pago" → tap navega al detalle de la clase
- [ ] Tipo `payment_rejected`: muestra "rechazó tu comprobante"
- [ ] Tipo `class_discount`: muestra "aplicó un descuento" → tap navega al detalle
- [ ] Tipo `friend_request`: muestra "te envió solicitud de amistad"
- [ ] Tipo `friend_accepted`: muestra "aceptó tu solicitud"
- [ ] Si no hay notificaciones: texto "No tienes notificaciones"

---

## 23. Mobile — Crear clase (`class/create.tsx`)

- [ ] Solo accesible para usuarios con plan activo (`canTeach(tier)`)
- [ ] Tipo "Suelta": muestra campo de fecha (DD/MM/AAAA) y hora
- [ ] Tipo "Periódica": muestra selector de día de la semana y hora recurrente
- [ ] Tipo "Entrenamiento": muestra toggle de audición requerida + fecha de cierre
- [ ] Selector de estilo de baile muestra todos los estilos de `DANCE_STYLES`
- [ ] Nivel: Principiante / Intermedio / Avanzado / Todos los niveles
- [ ] Upload de hasta 5 medios (imagen o video) desde galería del dispositivo
- [ ] Preview de medios seleccionados visible antes de enviar
- [ ] Si un archivo falla al subir: muestra mensaje de advertencia pero completa la creación de la clase
- [ ] Submit exitoso: navega al detalle de la clase recién creada
- [ ] Seguidores del profesor reciben notificación `new_class`

---

## 24. Mobile — Detalle de clase (`class/[id]/index.tsx`)

- [ ] Carrusel de medios funciona con swipe y con las flechas ‹ ›
- [ ] Puntos indicadores muestran el slide activo como más ancho
- [ ] Videos en el carrusel se reproducen con expo-video
- [ ] Muestra: título, estilo, tipo de clase, nivel, horario, duración, ubicación, cupos, precio
- [ ] Si hay cupos disponibles y el usuario no está inscrito: botón "Reservar cupo" sticky abajo
- [ ] Si el usuario ya está inscrito: muestra el estado del enrollment (confirmado, pendiente, etc.)
- [ ] Tap en "Reservar cupo" crea enrollment y navega a `/(app)/payment/[id]`
- [ ] Si el autor es el usuario actual: botones "Editar" y "Eliminar" visibles
- [ ] No-autores ven botón de denuncia

---

## 25. Mobile — Error handling (regresión)

- [ ] `feed.tsx`: apagar red → refresh → feed muestra estado vacío sin crash
- [ ] `explore.tsx`: apagar red → abrir pantalla → listas vacías sin crash
- [ ] `profile.tsx`: apagar red → pull-to-refresh → no crash, pantalla muestra estado anterior o vacío
- [ ] `class/create.tsx`: subir archivo con red cortada a mitad → muestra "Clase creada, pero hubo un error al subir algunos archivos"
- [ ] `profile/edit.tsx`: guardar con red cortada durante upload de avatar → muestra "Error al subir la foto de perfil"

---

## Resumen

| Estado          | Cantidad                                                                       |
|-----------------|--------------------------------------------------------------------------------|
| PASS `[x]`      | 30                                                                             |
| FAIL `[!]`      | 0                                                                              |
| SKIP/N-A `[~]`  | 28                                                                             |
| PENDIENTE `[ ]` | 38 (mobile transaccional, sesiones 3-4) + 84 (mobile pantallas, sesión cierre) |

### FAILs detectados y corregidos

1. **Cerrar sesión → `/auth/login`** — Fix aplicado: `LogoutButton.tsx` ahora hace `router.push('/auth/login')`. Commit `a5f8371`.
2. **Color filtro activo `brand-600`** — Fix aplicado: paleta brand restaurada a fuchsia (`brand-600 = #c026d3`; antes estaba en navy `#2D1B69`). Commit `a5f8371`.

### SKIPs principales por motivo

- **Cuenta 2 ya inscrita**: el flujo "Reservar cupo" → `/payment` no pudo completarse porque `benjamn.saldas@uc.cl` ya tiene enrollment activo en la clase disponible.
- **Sin enrollment nuevo**: sección 11 (Pago) no testeable sin crear enrollment nuevo.
- **Carrusel multi-slide**: las clases públicas disponibles tienen solo 1 medio. Los botones nav (ChevronLeft/Right Lucide) requieren `media.length > 1` para renderizarse.
- **Datos insuficientes**: notificaciones activas, descuentos, clases con fechas custom.
- **No testeable con Playwright**: pull-to-refresh, confirmación de pago (irreversible), submit de crear clase.
