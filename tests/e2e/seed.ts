/**
 * Test data seed for E2E tests.
 *
 * This module provides utilities to set up and tear down test data
 * in a Supabase test environment (NOT production).
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars pointing to a TEST instance
 *   - E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD — account with basic+ subscription
 *   - E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD — account with basic+ subscription
 *
 * Usage in tests:
 *   import { seedClass, cleanSeed } from './seed'
 *   test.beforeAll(async () => { await seedClass() })
 *   test.afterAll(async () => { await cleanSeed() })
 *
 * WARNING: Never point these env vars at production.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const TEST_TEACHER_EMAIL = process.env.E2E_TEACHER_EMAIL ?? 'teacher@test.danzclass.local'
export const TEST_TEACHER_PASSWORD = process.env.E2E_TEACHER_PASSWORD ?? ''
export const TEST_STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@test.danzclass.local'
export const TEST_STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? ''

// IDs populated by seedClass() and used by cleanSeed()
export let seededClassId: string | null = null
export let seededEnrollmentId: string | null = null

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Seed requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
        'These must point to a TEST Supabase instance (never production).',
    )
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/**
 * Look up a user profile by email using the admin client.
 */
async function getUserIdByEmail(email: string): Promise<string> {
  const supabase = adminClient()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw new Error(`listUsers failed: ${error.message}`)
  const user = data.users.find((u) => u.email === email)
  if (!user) throw new Error(`Test user not found: ${email}`)
  return user.id
}

/**
 * Seeds a minimal "suelta" class taught by the teacher account,
 * and an enrollment (pending_payment) by the student account.
 *
 * Returns the class id and enrollment id.
 */
export async function seedClass(): Promise<{ classId: string; enrollmentId: string }> {
  const supabase = adminClient()

  const teacherId = await getUserIdByEmail(TEST_TEACHER_EMAIL)
  const studentId = await getUserIdByEmail(TEST_STUDENT_EMAIL)

  // Create class
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toISOString().split('T')[0]

  const { data: classData, error: classError } = await supabase
    .from('classes')
    .insert({
      teacher_id: teacherId,
      title: '[TEST] Clase suelta E2E',
      type: 'suelta',
      recurrence: null,
      style: 'House',
      level: 'todos',
      date: dateStr,
      time: '19:00',
      duration: 60,
      location: 'Santiago Centro',
      city: 'Santiago',
      max_students: 10,
      price: 5000,
      status: 'active',
    })
    .select('id')
    .single()

  if (classError || !classData) {
    throw new Error(`Failed to seed class: ${classError?.message}`)
  }

  seededClassId = classData.id

  // Create enrollment
  const { data: enrollData, error: enrollError } = await supabase
    .from('enrollments')
    .insert({
      class_id: classData.id,
      user_id: studentId,
      status: 'pending_payment',
    })
    .select('id')
    .single()

  if (enrollError || !enrollData) {
    throw new Error(`Failed to seed enrollment: ${enrollError?.message}`)
  }

  seededEnrollmentId = enrollData.id

  return { classId: classData.id, enrollmentId: enrollData.id }
}

/**
 * Seeds a minimal "entrenamiento" class with audition enabled.
 */
export async function seedEntrenamiento(): Promise<{ classId: string }> {
  const supabase = adminClient()
  const teacherId = await getUserIdByEmail(TEST_TEACHER_EMAIL)

  const { data, error } = await supabase
    .from('classes')
    .insert({
      teacher_id: teacherId,
      title: '[TEST] Entrenamiento E2E',
      type: 'entrenamiento',
      recurrence: 'weekly',
      style: 'Salsa',
      level: 'intermedio',
      day_of_week: 1, // Monday
      time: '18:00',
      duration: 90,
      location: 'Gimnasio Norte',
      city: 'Santiago',
      max_students: 8,
      price: 80000,
      price_monthly: 80000,
      requires_audition: true,
      audition_closed: false,
      ends_indefinitely: true,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Failed to seed entrenamiento: ${error?.message}`)
  seededClassId = data.id
  return { classId: data.id }
}

/**
 * Removes all seeded data created by this session.
 * Safe to call even if seed wasn't fully executed.
 */
export async function cleanSeed(): Promise<void> {
  const supabase = adminClient()

  if (seededEnrollmentId) {
    await supabase.from('payments').delete().eq('enrollment_id', seededEnrollmentId)
    await supabase.from('enrollments').delete().eq('id', seededEnrollmentId)
    seededEnrollmentId = null
  }

  if (seededClassId) {
    await supabase.from('auditions').delete().eq('class_id', seededClassId)
    await supabase.from('class_media').delete().eq('class_id', seededClassId)
    await supabase.from('enrollments').delete().eq('class_id', seededClassId)
    await supabase.from('classes').delete().eq('id', seededClassId)
    seededClassId = null
  }
}

/**
 * Removes all test classes (those with title starting with '[TEST]').
 * Use for a full cleanup after a test run if individual cleanSeed() calls were missed.
 */
export async function cleanAllTestData(): Promise<void> {
  const supabase = adminClient()

  const { data: testClasses } = await supabase
    .from('classes')
    .select('id')
    .like('title', '[TEST]%')

  if (!testClasses?.length) return

  const ids = testClasses.map((c) => c.id)

  await supabase.from('auditions').delete().in('class_id', ids)
  await supabase.from('class_media').delete().in('class_id', ids)

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id')
    .in('class_id', ids)

  if (enrollments?.length) {
    const enrollIds = enrollments.map((e) => e.id)
    await supabase.from('payments').delete().in('enrollment_id', enrollIds)
    await supabase.from('enrollments').delete().in('id', enrollIds)
  }

  await supabase.from('classes').delete().in('id', ids)
}
