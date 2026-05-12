import Image from 'next/image'
import { cn, getInitials } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeMap = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]', image: 24 },
  sm: { container: 'h-8 w-8', text: 'text-xs', image: 32 },
  md: { container: 'h-10 w-10', text: 'text-sm', image: 40 },
  lg: { container: 'h-14 w-14', text: 'text-base', image: 56 },
  xl: { container: 'h-20 w-20', text: 'text-xl', image: 80 },
}

export default function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const { container, text, image } = sizeMap[size]

  return (
    <div className={cn('relative rounded-full overflow-hidden bg-brand-100 flex items-center justify-center flex-shrink-0', container, className)}>
      {src ? (
        <Image src={src} alt={name} width={image} height={image} className="object-cover w-full h-full" />
      ) : (
        <span className={cn('font-semibold text-brand-700', text)}>
          {getInitials(name)}
        </span>
      )}
    </div>
  )
}
