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
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
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
