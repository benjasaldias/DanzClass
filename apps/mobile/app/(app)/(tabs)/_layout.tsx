import { Tabs } from 'expo-router'
import { Home, Search, CalendarDays, BookOpen, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../../context/ThemeContext'

export default function TabsLayout() {
  const { isDark } = useTheme()
  // Explicit tabBar height suppresses React Navigation's automatic bottom inset,
  // so add it back manually — otherwise icons/labels collide with the iPhone home indicator.
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#534AB7',
        tabBarInactiveTintColor: '#6B6880',
        tabBarStyle: {
          backgroundColor: isDark ? '#241547' : 'white',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#3D2870' : '#f3f4f6',
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: 'Inicio', tabBarIcon: ({ color }) => <Home size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explorar', tabBarIcon: ({ color }) => <Search size={22} stroke={color} /> }}
      />
      {/* "create" oculto del tab bar — sigue accesible por navegación directa desde otras pantallas */}
      <Tabs.Screen
        name="create"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="my-classes"
        options={{ title: 'Mis clases', tabBarIcon: ({ color }) => <BookOpen size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="agenda"
        options={{ title: 'Agenda', tabBarIcon: ({ color }) => <CalendarDays size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <User size={22} stroke={color} /> }}
      />
    </Tabs>
  )
}
