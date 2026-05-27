export const logger = {
  info: (event: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: 'info', event, ...meta, ts: Date.now() })),

  warn: (event: string, meta?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: 'warn', event, ...meta, ts: Date.now() })),

  error: (event: string, error: unknown, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: 'error', event, error: String(error), ...meta, ts: Date.now() })),
}
