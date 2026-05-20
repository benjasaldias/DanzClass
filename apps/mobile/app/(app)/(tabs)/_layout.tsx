import { Tabs } from 'expo-router'
import { Home, Search, PlusSquare, BookOpen, User } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

export default function TabsLayout() {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'

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
          height: 60,
          paddingBottom: 8,
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
      <Tabs.Screen
        name="create"
        options={{ title: 'Publicar', tabBarIcon: ({ color }) => <PlusSquare size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="my-classes"
        options={{ title: 'Mis clases', tabBarIcon: ({ color }) => <BookOpen size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <User size={22} stroke={color} /> }}
      />
    </Tabs>
  )
}
