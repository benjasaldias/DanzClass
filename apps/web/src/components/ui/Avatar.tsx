import Image from 'next/image'
import { User } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeMap = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]', image: 24, icon: 12 },
  sm: { container: 'h-8 w-8', text: 'text-xs', image: 32, icon: 14 },
  md: { container: 'h-10 w-10', text: 'text-sm', image: 40, icon: 18 },
  lg: { container: 'h-14 w-14', text: 'text-base', image: 56, icon: 24 },
  xl: { container: 'h-20 w-20', text: 'text-xl', image: 80, icon: 32 },
}

export default function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const { container, text, image, icon } = sizeMap[size]
  const initials = getInitials(name)

  return (
    <div className={cn('relative rounded-full overflow-hidden bg-brand-100 flex items-center justify-center flex-shrink-0', container, className)}>
      {src ? (
        <Image src={src} alt={name} width={image} height={image} className="object-cover w-full h-full" />
      ) : initials ? (
        <span className={cn('font-semibold text-brand-700', text)}>
          {initials}
        </span>
      ) : (
        <User width={icon} height={icon} className="text-brand-400" />
      )}
    </div>
  )
}
