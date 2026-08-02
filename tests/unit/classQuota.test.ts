import { test, expect } from '@playwright/test'
import {
  monthlyClassQuotaForTier,
  canPublishClassType,
  classQuotaErrorMessage,
  UNLIMITED_CLASSES,
} from '../../packages/shared/src/lib/classQuota'

test.describe('monthlyClassQuotaForTier', () => {
  test('sin plan no se publica nada', () => {
    expect(monthlyClassQuotaForTier('none')).toBe(0)
  })

  test('básico publica 1 suelta al mes', () => {
    expect(monthlyClassQuotaForTier('basic')).toBe(1)
  })

  test('teacher y pro son ilimitados', () => {
    expect(monthlyClassQuotaForTier('teacher')).toBe(UNLIMITED_CLASSES)
    expect(monthlyClassQuotaForTier('pro')).toBe(UNLIMITED_CLASSES)
  })
})

test.describe('canPublishClassType', () => {
  test('el básico sólo publica sueltas', () => {
    expect(canPublishClassType('basic', 'suelta')).toBe(true)
    expect(canPublishClassType('basic', 'periodica')).toBe(false)
    expect(canPublishClassType('basic', 'entrenamiento')).toBe(false)
  })

  test('el pro publica de todo', () => {
    expect(canPublishClassType('pro', 'suelta')).toBe(true)
    expect(canPublishClassType('pro', 'periodica')).toBe(true)
    expect(canPublishClassType('pro', 'entrenamiento')).toBe(true)
  })

  test('sin plan, ningún tipo', () => {
    expect(canPublishClassType('none', 'suelta')).toBe(false)
    expect(canPublishClassType('none', 'periodica')).toBe(false)
  })
})

test.describe('classQuotaErrorMessage', () => {
  test('traduce los tres rechazos del trigger', () => {
    expect(classQuotaErrorMessage('class_quota_exceeded')).toContain('1 clase suelta por mes')
    expect(classQuotaErrorMessage('class_type_requires_pro')).toContain('plan Pro')
    expect(classQuotaErrorMessage('plan_required_for_classes')).toContain('plan activo')
  })

  test('cualquier otro error no es suyo', () => {
    expect(classQuotaErrorMessage('duplicate key value violates unique constraint')).toBe(null)
    expect(classQuotaErrorMessage(null)).toBe(null)
    expect(classQuotaErrorMessage(undefined)).toBe(null)
  })
})
