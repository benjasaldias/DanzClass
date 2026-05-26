# Sugerencias de features post-alpha

> **NO** son requisitos para alpha. Son ideas para construir confianza, mejorar retención y crecer en las siguientes fases. Priorizadas por impacto/esfuerzo subjetivo del autor (revisar con datos reales después de alpha).

---

## Retención

### F-1 — Push notifications (Expo) — ALTA impacto, MEDIA esfuerzo
Sin push, recordatorios y notificaciones de pago confirmado pasan desapercibidos. Es el upgrade más alto-leverage post-alpha.

### F-2 — Email templates customizados — BAJA esfuerzo
Hoy Supabase manda emails default (confirmación, reset). Custom + branded subimos confianza inmediatamente.

### F-3 — Onboarding interactivo (primera vez en feed) — MEDIA esfuerzo
Tour de 4 pasos: "1. Sigue a profes que te interesan • 2. Configura tu ciudad • 3. Marca tus horarios disponibles • 4. Empieza a inscribirte". Aumenta activación.

### F-4 — Streak / gamificación leve — BAJA esfuerzo
Badge "5 clases este mes" o "20 clases tomadas en total" en el perfil. Bajo riesgo, alto delight.

### F-5 — Calendario downloadable .ics — BAJA esfuerzo
Botón "Agregar a calendario" en clase inscrita — exporta .ics que se importa a Google Calendar / Apple Calendar.

---

## Monetización

### F-6 — Plan gratuito con límites estrictos — ALTA impacto
Hoy un usuario "none" no puede inscribirse. Considerar permitir 1 inscripción/mes como "trial" → tasa de conversión.

### F-7 — Comisión por transacción — ALTA impacto, ALTA esfuerzo, ALTA riesgo legal
En lugar de suscripción del profesor, comisión 5–10 % por pago. Requiere ser intermediario de pagos (no solo intermediario informativo) → cambia el modelo legal completamente. Pensar bien.

### F-8 — Marketplace de coreografías / cursos pre-grabados — MEDIA esfuerzo
Profe vende un video curso, alumno paga una vez y accede de por vida. Buena complementación al sistema de clases en vivo.

---

## Crecimiento

### F-9 — Compartir nativo desde Stories Instagram — ALTA impacto
Profes ya usan Instagram. Botón "Compartir clase a Instagram Stories" con preview branded sería viral.

### F-10 — Referral program — BAJA esfuerzo
"Invita un amigo → ambos reciben 1 mes Pro gratis". Mide CAC.

### F-11 — SEO landing pages por estilo de baile y ciudad — MEDIA esfuerzo
Pre-renderear `/clases/house/santiago` con clases activas. Google indexa → tráfico orgánico.

### F-12 — Embeddable widget de clases — BAJA esfuerzo
Profe pega un iframe en su Linktree/web personal para mostrar sus próximas clases.

---

## Producto

### F-13 — Chat directo alumno ↔ profesor — ALTA impacto, MEDIA esfuerzo
Hoy todo el contexto se pierde en WhatsApp. Chat in-app reduce fricción.

### F-14 — Reseñas con texto (no solo estrellas) — ALTA impacto
"5 estrellas" sin contexto no convence. Reseñas escritas son social proof potente.

### F-15 — Galería de videos de la clase post-evento — BAJA esfuerzo
Profe sube 1-2 videos cortos después de cada clase. Alumno los ve en su perfil "mis clases". Aumenta sensación de comunidad.

### F-16 — Sistema de niveles para alumnos — MEDIA esfuerzo
Alumno declara su nivel (principiante/intermedio/avanzado) → matching con clases. Hoy es ad-hoc.

### F-17 — Filtro "Buenos para principiantes" — BAJA esfuerzo
Curado: profe marca "Apto principiantes". Filtro en explore. Útil para no-bailarines que entran.

### F-18 — Calendario público del profesor — BAJA esfuerzo
URL pública `/teacher/[username]/schedule` que muestra todas sus próximas clases con CTA inscribirse. Útil para compartir.

---

## Operación

### F-19 — Panel financiero para profesor — MEDIA esfuerzo
Resumen mensual: ingresos totales, alumnos únicos, clases dictadas, ranking. Hoy `MyClassesClient` lo asoma pero falta detalle.

### F-20 — Exportar historial de pagos a CSV — BAJA esfuerzo
Profesor descarga CSV para su contadora.

### F-21 — Recordatorio de pago al alumno (no solo al profesor) — BAJA esfuerzo
Si pasaron 24 h y no subió comprobante → notif "Te falta subir tu comprobante para X". Reduce deudas.

### F-22 — Reportes admin más finos — MEDIA esfuerzo
Panel `/admin` con: top reportados, clases canceladas en últimos 7 días, usuarios sin confirmar pendientes, deudores totales.

---

## Performance / técnica

### F-23 — Migrar a React Query / SWR — MEDIA esfuerzo
Hoy hay muchos `useEffect + setState`. Query lib daría caching, invalidation, refetch automático.

### F-24 — Server Actions de Next 14 — BAJA esfuerzo
Migrar mutaciones (inscribirse, calificar) a server actions en lugar de API routes. Menos boilerplate.

### F-25 — Supabase Edge Functions para webhooks — MEDIA esfuerzo
Vercel function fría tarda 1-2 s. Edge function ~100 ms. MP retry policy es estricto.

### F-26 — Tests de carga (k6 / Artillery) — BAJA esfuerzo
Antes de escalar, simular 1000 usuarios concurrent. Detectar bottlenecks.

---

## Comunidad

### F-27 — Eventos / festivales — MEDIA esfuerzo
Tipo de entidad nueva: "Evento" (no es clase recurrente, es un día específico, varios profes). Festivales urbanos chilenos son grandes y poco organizados online.

### F-28 — Reels / videos cortos del feed — ALTA impacto
TikTok-style: scroll vertical de videos cortos de las clases. Reemplazaría el feed actual a futuro.

### F-29 — Stories efímeras — MEDIA esfuerzo
"Hoy doy clase a las 19 hs" con expiración 24h. Replica el comportamiento que ya hacen en Instagram, dentro de la app.

### F-30 — Crews / grupos privados — ALTA esfuerzo
Profesor crea su "crew" y alumnos se afilian. Posts privados al crew. Útil para escuelas establecidas.

---

## Internacionalización

### F-31 — Soporte multi-país (Argentina, Perú, México) — ALTA esfuerzo
Cambios: moneda dinámica (CLP, ARS, USD), MP por país, RUT vs DNI vs CURP, ciudades por país. Post-tracción Chile.

### F-32 — Inglés (al menos en /privacy y /terms) — BAJA esfuerzo
Para Apple/Google review pueden pedir.

---

## Notas finales

- Construir 2-3 de estas por mes, no todas a la vez.
- Validar con usuarios alpha **antes** de invertir en F-7, F-13, F-27, F-30 (las pesadas).
- F-1 (push), F-2 (emails), F-9 (Instagram share) son los "quick wins" con mayor ratio impacto/esfuerzo.
