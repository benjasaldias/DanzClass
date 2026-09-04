'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { canTeach } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface PublishFabProps {
  tier: SubscriptionTier
}

/**
 * Botón flotante "Publicar" — vidrio translúcido, esquina inferior derecha,
 * justo sobre el ítem "Perfil" del BottomNav. Reemplaza el antiguo ítem
 * "Publicar" del nav. Solo visible para quienes pueden enseñar.
 */
export default function PublishFab({ tier }: PublishFabProps) {
  const pathname = usePathname()
  if (!canTeach(tier)) return null
  // Ocultar dentro del propio flujo de publicación para no estorbar.
  if (pathname?.startsWith('/publish') || pathname?.startsWith('/create-class')) return null
  // Y en el detalle de un chat: el FAB es `fixed bottom-right` y el compositor
  // del chat termina justo ahí, así que **tapaba el botón de enviar** — el
  // click ni siquiera llegaba (lo interceptaba el contenedor del FAB). Ya
  // pasaba antes con cualquier profesor; el lanzamiento gratuito (todas las
  // cuentas Pro, 2026-09-04) lo volvió universal y lo destapó el smoke E2E del
  // chat. `/chats` (la lista) sí lo muestra: ahí no hay compositor.
  if (pathname?.startsWith('/chat/')) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg">
      <Link
        href="/publish"
        aria-label="Publicar"
        className="pointer-events-auto absolute bottom-fab right-4 flex h-14 w-14 items-center justify-center rounded-2xl
                   border border-white/50 bg-white/70 text-brand-600 shadow-[0_10px_30px_-6px_rgba(45,27,105,0.35)] backdrop-blur-xl
                   transition-all hover:scale-105 hover:bg-white active:scale-95
                   dark:border-white/10 dark:bg-dark-surface/70 dark:text-brand-200 dark:shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6)] dark:hover:bg-dark-surface2"
      >
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </Link>
    </div>
  )
}
