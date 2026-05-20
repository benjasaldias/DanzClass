import { createContext, useContext, useEffect, useState } from 'react'
import { View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'app_theme'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({ isDark: false, toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark') setIsDark(true)
      else if (stored === 'light') setIsDark(false)
    })
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <View className={`flex-1${isDark ? ' dark' : ''}`}>
        {children}
      </View>
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
