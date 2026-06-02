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
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js App Router requires inline scripts for hydration; unsafe-eval for some edge configs
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co",
      "media-src 'self' blob: https://res.cloudinary.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://api.cloudinary.com https://exp.host",
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
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
