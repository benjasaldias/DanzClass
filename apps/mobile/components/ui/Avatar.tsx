import { View, Text, Image } from 'react-native'

type AvatarSize = 'xs' | 'sm' | 'md'

const SIZE_MAP: Record<AvatarSize, { container: number; text: number }> = {
  xs: { container: 20, text: 8 },
  sm: { container: 28, text: 11 },
  md: { container: 40, text: 16 },
}

interface Props {
  url: string | null
  name: string
  size?: AvatarSize
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

export default function Avatar({ url, name, size = 'md' }: Props) {
  const { container, text } = SIZE_MAP[size]
  const initials = getInitials(name || '?')

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: container, height: container, borderRadius: container / 2 }}
      />
    )
  }

  return (
    <View
      style={{
        width: container,
        height: container,
        borderRadius: container / 2,
        backgroundColor: '#EEEDFE',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: text, fontWeight: '700', color: '#534AB7' }}>{initials}</Text>
    </View>
  )
}
