import { styleColor } from '@danceclass/shared'
import { cn } from '@/lib/utils'

interface StyleChipProps {
  style: string
  sub?: string | null
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * Pill de estilo de baile con su acento cromático propio (item: variedad
 * de color por género). Renderiza variantes claro/oscuro vía `dark:hidden`
 * para ser SSR-safe con la estrategia `class` de next-themes — sin flash ni
 * desajuste de hidratación.
 */
export default function StyleChip({ style, sub, size = 'sm', className }: StyleChipProps) {
  const light = styleColor(style, false)
  const dark = styleColor(style, true)
  const base = cn(
    'items-center rounded-full font-bold uppercase tracking-wide whitespace-nowrap',
    size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
    className,
  )
  const label = (
    <>
      {style}
      {sub && <span className="font-semibold opacity-70"> · {sub}</span>}
    </>
  )
  return (
    <>
      <span className={cn('inline-flex dark:hidden', base)} style={{ backgroundColor: light.soft, color: light.ink }}>
        {label}
      </span>
      <span className={cn('hidden dark:inline-flex', base)} style={{ backgroundColor: dark.soft, color: dark.ink }}>
        {label}
      </span>
    </>
  )
}
