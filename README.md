# DanzClass

**Plataforma web y móvil para conectar profesores y estudiantes de baile urbano en Chile.**

🌐 [danzclass.com](https://danzclass.com) &nbsp;·&nbsp; Actualmente en **alpha pública**

---

## El problema que resuelve

El mercado de clases de baile urbano en Chile opera completamente de forma informal: los profesores publican sus clases en historias de Instagram, coordinan inscripciones por mensaje y reciben pagos via transferencia bancaria con captura de pantalla. No hay sistema de reservas, no hay control de cupos, no hay historial de pagos. DanzClass digitaliza todo ese flujo.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| **Monorepo** | npm workspaces (`apps/*`, `packages/*`) |
| **Web** | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| **Mobile** | Expo SDK 51 (Expo Router) · React Native · NativeWind |
| **Backend** | Supabase — PostgreSQL · Auth · Storage · Realtime |
| **Pagos** | Mercado Pago (suscripciones + pagos de clases) |
| **Video** | Cloudinary (upload y delivery) |
| **Tests** | Playwright (E2E + unit + smoke en producción) |
| **CI** | GitHub Actions (typecheck + unit + smoke opcional) |
| **Monitoreo** | Sentry · Healthchecks.io · Logger JSON estructurado |
| **Deploy** | Vercel (web) · EAS (mobile) |

---

## Arquitectura del monorepo

```
DcProject/
├── apps/
│   ├── web/          # Next.js 14 App Router
│   └── mobile/       # Expo SDK 51
├── packages/
│   └── shared/       # Tipos TypeScript, cliente Supabase base, helpers compartidos
├── supabase/
│   └── migrations/   # 37 migraciones SQL en producción
└── tests/
    ├── unit/         # Tests de helpers y lógica de negocio
    ├── e2e/          # Tests end-to-end con seed de datos
    └── e2e-production/ # Smoke tests read-only contra producción
```

---

## Funcionalidades implementadas

### Clases y reservas
- Tipos de clase: suelta (fecha única), periódica (semanal/mensual), personalizada (fechas custom) y **entrenamiento** (con convocatoria de audición)
- Inscripción centralizada con validaciones: control de cupos, deudas pendientes, clases vencidas, audición requerida
- Lista de espera con notificación automática al primer en cola cuando se libera un cupo
- Sistema **2x**: dos alumnos se emparejan para tomar una clase juntos con precio especial; race condition manejada vía API

### Pagos
- Flujo con comprobante: el alumno sube imagen/PDF, el profesor confirma o rechaza
- Historial de pagos con resumen mensual para profesores
- Suscripciones de profesor vía Mercado Pago (mensual y anual) con webhook idempotente
- Paquetes de clases: agrupa 2+ clases con precio especial, flujo de inscripción y pago unificado
- Bucket `payment-receipts` **privado** con signed URLs de 1 hora para proteger los comprobantes

### Descuentos y precios
- Descuentos espontáneos del profesor con notificación opt-in a alumnos inscritos
- Precio al momento de pago (no congelado en inscripción)
- Precio `price_suelta_2x` y `discount_price` como columnas separadas en `classes`

### Audiciones (entrenamiento)
- El profesor abre una convocatoria, los alumnos postulan con video
- Decisiones en borrador locales + publicación batch con notificaciones
- Auto-inscripción `pending_payment` para aceptados al cerrar la convocatoria
- Reabrir convocatoria sin perder decisiones anteriores

### Perfiles y comunidad
- Follows y sistema de amistad (friends)
- Valoraciones con estrellas (1–5) verificadas por inscripción confirmada
- Posts de video con visibilidad `public / followers / friends`
- Denuncias de contenido con notificación al superadmin y panel de administración
- Programa de referidos

### Ensayos grupales
- Crear ensayos con invitados, aceptar/rechazar
- Coordinación de disponibilidad: grid semanal 7×24 por participante
- Integración en agenda, notificaciones y chat grupal

### Chat en tiempo real
- Chat alumno–profesor por clase (Supabase Realtime)
- Chat grupal por ensayo
- Lista de conversaciones activas; limpieza automática 48 h post-evento

### Agenda inteligente
- Vista semanal consolidada: clases inscritas (sky), clases que dicto (emerald), ensayos (violet/slate)
- Disponibilidad horaria: bloques de ocupado + franja de sueño configurable
- Colores semánticamente diferenciados por tipo de evento

### Panel financiero (profesores)
- Ingresos totales y por período, alumnos únicos, tasa de pago
- Gráfico de barras de los últimos 6 meses
- Top 5 clases por ingreso generado

### Otras funcionalidades
- Widget embebible `<iframe>` para que el profesor muestre sus clases en su propia web
- Onboarding interactivo (4 pasos, una sola vez por usuario)
- Soft-delete de cuenta con anonimización de datos
- Recordatorios automáticos 24 h antes de cada clase (cron job)
- Modo oscuro completo en web y mobile
- Acceso anónimo a detalle de clases (para compartir links en redes sociales)

---

## Base de datos

37 migraciones SQL en producción sobre PostgreSQL (Supabase).

Tablas principales: `profiles`, `classes`, `class_sessions`, `enrollments`, `payments`, `notifications`, `follows`, `friendships`, `subscriptions`, `posts`, `auditions`, `waitlist`, `rehearsals`, `rehearsal_invites`, `user_busy_blocks`, `ratings`, `reports`, `class_packages`, `package_enrollments`, `chats`, `chat_messages`.

RLS habilitado en todas las tablas. Notificaciones cross-user vía API route con `service_role` (policy `insert_self` desde cliente). Bucket `payment-receipts` privado con política de acceso a uploader + teacher.

---

## Testing

```bash
npm run test:unit          # Tests de lógica pura (availability, helpers, utils)
npm run test:e2e           # E2E con seed de datos (requiere dev server en :3000)
npm run test:e2e:prod      # Smoke tests read-only contra producción
npm run typecheck --workspace=apps/web
```

CI en GitHub Actions: typecheck + unit en cada push a `main`.

---

## Decisiones técnicas destacadas

- **`DateInput` custom** en lugar de `<input type="date">`: Chrome ignora el atributo `lang`, por lo que se implementó un campo de texto con auto-formateo DD/MM/AAAA que almacena YYYY-MM-DD internamente.
- **Inscripción upsert**: si un alumno tenía una inscripción cancelada, se reactiva en lugar de crear un duplicado, evitando violaciones de la restricción UNIQUE.
- **Webhook MP idempotente**: tabla `subscription_renewals` con `mp_payment_id UNIQUE` previene que un evento reenviado por Mercado Pago duplique la extensión de la suscripción.
- **Video adaptivo**: `<video>` con `w-full h-auto max-h-[85vh]` renderiza el ratio nativo del video sin crop forzado.
- **`(supabase as any).from(...)`** para joins anidados que superan el límite de inferencia de TypeScript.
- **Signed URLs para comprobantes**: el bucket de recibos es privado; los componentes obtienen URLs temporales de 1 hora vía API route que valida ownership.
- **Security headers** en `next.config.js`: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Logger JSON estructurado** en todos los API routes críticos para indexación en Vercel Log Explorer.

---

## Autor

Desarrollado por **Benjamín Saldías** — diseño, producto y código.

[benjamingsaldiash@gmail.com](mailto:benjamingsaldiash@gmail.com)
