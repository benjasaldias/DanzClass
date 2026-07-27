import { test, expect } from '@playwright/test'
import {
  postQuotaForTier,
  daysUntilPurge,
  PLAN_HIDDEN_RETENTION_DAYS,
  UNLIMITED_POSTS,
} from '../../packages/shared/src/lib/postQuota'

test.describe('postQuotaForTier', () => {
  test('sin plan no hay videos expuestos', () => {
    expect(postQuotaForTier('none')).toBe(0)
  })

  test('básico expone 3 (BASIC_VIDEO_POST_LIMIT)', () => {
    expect(postQuotaForTier('basic')).toBe(3)
  })

  test('teacher y pro son ilimitados', () => {
    expect(postQuotaForTier('teacher')).toBe(UNLIMITED_POSTS)
    expect(postQuotaForTier('pro')).toBe(UNLIMITED_POSTS)
  })
})

test.describe('daysUntilPurge', () => {
  test('un post no oculto no tiene reloj', () => {
    expect(daysUntilPurge(null)).toBe(null)
    expect(daysUntilPurge(undefined)).toBe(null)
  })

  test('recién ocultado → el plazo completo', () => {
    expect(daysUntilPurge(new Date().toISOString())).toBe(PLAN_HIDDEN_RETENTION_DAYS)
  })

  test('a mitad de camino queda la mitad', () => {
    const hidden = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
    expect(daysUntilPurge(hidden)).toBe(PLAN_HIDDEN_RETENTION_DAYS - 45)
  })

  test('vencido → 0 o negativo (lo purga el cron)', () => {
    const hidden = new Date(Date.now() - (PLAN_HIDDEN_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString()
    expect(daysUntilPurge(hidden)!).toBeLessThanOrEqual(0)
  })

  test('fecha inválida no rompe la UI', () => {
    expect(daysUntilPurge('no-es-una-fecha')).toBe(null)
  })
})
