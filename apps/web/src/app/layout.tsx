import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import ThemeProvider from '@/components/ui/ThemeProvider'
import ReactQueryProvider from '@/providers/ReactQueryProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sora = Sora({ subsets: ['latin'], weight: ['700'], variable: '--font-sora' })

export const metadata: Metadata = {
  title: 'DanzClass',
  description: 'Conectando profesores y estudiantes de baile en Chile',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'DanzClass' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#c026d3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <ReactQueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ReactQueryProvider>
      </body>
    </html>
  )
}
