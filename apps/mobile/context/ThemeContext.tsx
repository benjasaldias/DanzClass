import { createContext, useContext, useEffect } from 'react'
import { useColorScheme } from 'nativewind'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'app_theme'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({ isDark: false, toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme()

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light') {
        setColorScheme(stored)
      } else {
        // Light mode es el predeterminado (no seguir el tema del sistema).
        setColorScheme('light')
      }
    })
  }, [])

  function toggleTheme() {
    const next = colorScheme === 'dark' ? 'light' : 'dark'
    setColorScheme(next)
    AsyncStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <ThemeContext.Provider value={{ isDark: colorScheme === 'dark', toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
