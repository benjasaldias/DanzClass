import { createContext, useContext, useEffect } from 'react'
import { useColorScheme as useRNColorScheme } from 'react-native'
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
  const systemScheme = useRNColorScheme()

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light') {
        setColorScheme(stored)
      }
    })
  }, [])

  function toggleTheme() {
    const current = colorScheme ?? systemScheme ?? 'light'
    const next = current === 'dark' ? 'light' : 'dark'
    setColorScheme(next)
    AsyncStorage.setItem(STORAGE_KEY, next)
  }

  const isDark = (colorScheme ?? systemScheme) === 'dark'

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
