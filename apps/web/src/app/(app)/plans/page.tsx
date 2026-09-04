import { redirect } from 'next/navigation'

/**
 * Planes ocultos durante el lanzamiento gratuito (2026-09-04).
 *
 * Toda cuenta nace con Pro sin costo (migración `078_free_pro_launch.sql`), así
 * que no hay nada que vender acá: mostrar precios contradiría lo que el usuario
 * ya tiene. La ruta se conserva —en vez de borrarla— porque hay enlaces viejos
 * y CTAs internos que apuntan a `/plans` (los de `!canTeach`, hoy inalcanzables
 * porque todos son Pro), y un 404 sería peor que un redirect.
 *
 * La pantalla original está intacta en `_disabled-plans-page.tsx`, en esta misma
 * carpeta. Las rutas de cobro (`/api/mercadopago/create-subscription`,
 * `create-preference`, el webhook y `/plans/success`) tampoco se tocaron: siguen
 * funcionando el día que se reactive la venta.
 */
export default function PlansPage() {
  redirect('/profile')
}
