import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Only capture unhandled errors and explicit captures — skip network/RLS noise
  ignoreErrors: [
    'NetworkError',
    'Failed to fetch',
    'Load failed',
    'AbortError',
  ],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})
