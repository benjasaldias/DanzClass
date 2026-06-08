import { useState } from 'react'
import { View, Image, TouchableOpacity, Modal, ScrollView, Dimensions, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Play, Lock, Users, X } from 'lucide-react-native'
import MobilePostCard from '../feed/MobilePostCard'
import { useTheme } from '../../context/ThemeContext'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GAP = 2
const CELL = (SCREEN_WIDTH - GAP * 2) / 3

interface Props {
  posts: any[]
  currentUserId: string
}

/**
 * Grilla de publicaciones estilo Instagram (cuadritos 3×N). Al tocar un
 * cuadrito se abre la MobilePostCard completa en un modal.
 */
export default function ProfilePostsGrid({ posts, currentUserId }: Props) {
  const { isDark } = useTheme()
  const [selected, setSelected] = useState<any | null>(null)

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {posts.map((p) => {
          const vis = p.visibility ?? (p.is_public === false ? 'followers' : 'public')
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => setSelected(p)}
              style={{ width: CELL, height: CELL, backgroundColor: '#111' }}
            >
              {p.thumbnail_url ? (
                <Image source={{ uri: p.thumbnail_url }} style={{ width: CELL, height: CELL }} resizeMode="cover" />
              ) : (
                <View style={{ width: CELL, height: CELL, backgroundColor: '#2D1B69' }} />
              )}
              {/* play overlay */}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={18} stroke="#fff" />
                </View>
              </View>
              {/* visibility badge */}
              {vis !== 'public' && (
                <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: 3 }}>
                  {vis === 'friends' ? <Users size={11} stroke="#fff" /> : <Lock size={11} stroke="#fff" />}
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#100823' : '#F5F3FF' }} edges={['top']}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TouchableOpacity
              onPress={() => setSelected(null)}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#2E1B5C' : '#fff' }}
            >
              <X size={20} stroke={isDark ? '#EEEDFE' : '#374151'} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {selected && <MobilePostCard post={selected} currentUserId={currentUserId} />}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}
