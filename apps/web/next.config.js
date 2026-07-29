/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  transpilePackages: ['@danceclass/shared'],
  async redirects() {
    return [
      // Browsers auto-request /favicon.ico; redirect to the App Router icon
      { source: '/favicon.ico', destination: '/favicon.png', permanent: false },
    ]
  },
  async headers() {
    // Local Supabase (via `npm run db:start`) serves the API over plain HTTP/WS on
    // 127.0.0.1:54321 — the production CSP only allows *.supabase.co, so `next dev`
    // needs this exception or every fetch/storage request to the local stack is
    // blocked by the browser. Dev-only: never added to a production build.
    const isDev = process.env.NODE_ENV === 'development'
    const localSupabase = isDev ? ' http://127.0.0.1:54321' : ''
    // `ws://localhost:*` es el websocket de Hot Module Replacement de `next dev`
    // (puerto aleatorio). Sin él, la CSP bloqueaba el HMR del propio Next: el
    // navegador reintentaba en bucle, y cada error de consola dentro de un render
    // hacía que el overlay de desarrollo lanzara además el warning "Cannot update
    // a component (HotReload) while rendering a different component". Nada de
    // esto existe en producción; en dev ensuciaba la consola sin parar.
    const localSupabaseWs = isDev ? ' ws://127.0.0.1:54321 ws://localhost:* ws://127.0.0.1:*' : ''

    const csp = [
      "default-src 'self'",
      // Next.js App Router requires inline scripts for hydration; unsafe-eval for some edge configs
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // OSM tile servers power the Leaflet maps (class/event location).
      `img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co${localSupabase} https://*.tile.openstreetmap.org https://tile.openstreetmap.org`,
      `media-src 'self' blob: https://res.cloudinary.com https://*.supabase.co${localSupabase}`,
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://api.cloudinary.com https://exp.host${localSupabase}${localSupabaseWs}`,
      "font-src 'self' data:",
      "frame-src https://www.mercadopago.com.ar https://www.mercadopago.cl",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

// Wrap with Sentry only when the DSN is configured — avoids warnings on builds without Sentry.
// Safe to make unconditional once org/project env vars are added to Vercel.
let moduleExports = nextConfig
try {
  const { withSentryConfig } = require('@sentry/nextjs')
  moduleExports = withSentryConfig(nextConfig, {
    silent: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  })
} catch {
  // @sentry/nextjs not yet installed (local Node v12 env)
}

module.exports = moduleExports
