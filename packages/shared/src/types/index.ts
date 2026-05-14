// ============================================================
// Database Types - aligned with Supabase schema
// ============================================================

export type UserRole = 'user'
export type SubscriptionTier = 'none' | 'basic' | 'teacher' | 'pro' // 'teacher' kept for DB compat only
export type SubscriptionStatus = 'active' | 'grace' | 'expired' | 'cancelled'
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected'
export type TwoxRequestStatus = 'looking' | 'matched' | 'cancelled'
export type NotificationType =
  | '2x_request'
  | '2x_match'
  | 'friend_request'
  | 'friend_accepted'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'follow'
  | 'new_class'
  | 'class_updated'
  | 'class_cancelled'
  | 'debt_warning'

export type ClassType = 'suelta' | 'periodica'
export type ClassLevel = 'principiante' | 'intermedio' | 'avanzado' | 'todos'
export type ClassStatus = 'active' | 'cancelled' | 'completed'
export type Recurrence = 'weekly' | 'biweekly' | 'monthly' | 'custom'
export type SessionStatus = 'scheduled' | 'cancelled' | 'completed'
export type EnrollmentStatus = 'pending_payment' | 'payment_submitted' | 'confirmed' | 'cancelled'
export type PaymentStatus = 'pending' | 'verified' | 'rejected'
export type AccountType = 'cuenta_corriente' | 'cuenta_vista' | 'cuenta_rut' | 'cuenta_ahorro'
export type MediaType = 'image' | 'video'

export type FeedFilter = 'following' | 'global' | 'nearby'

// Helper: si el tier permite dictar clases (basic: solo 1 suelta/mes)
export function canTeach(tier: SubscriptionTier): boolean {
  return tier === 'basic' || tier === 'teacher' || tier === 'pro'
}

// Helper: si el tier permite dictar clases periódicas y sin límite mensual
export function canTeachUnlimited(tier: SubscriptionTier): boolean {
  return tier === 'teacher' || tier === 'pro'
}

// Helper: si el tier permite subir videos en clases/posts
export function canUploadVideo(tier: SubscriptionTier): boolean {
  return tier === 'teacher' || tier === 'pro'
}

// Helper: si el tier permite subir media (imágenes) en clases
export function canUploadMedia(tier: SubscriptionTier): boolean {
  return tier === 'basic' || tier === 'teacher' || tier === 'pro'
}

// Helper: si el tier permite inscribirse en clases
export function canEnroll(tier: SubscriptionTier): boolean {
  return tier === 'basic' || tier === 'teacher' || tier === 'pro'
}

// ============================================================
// Table Row Types
// ============================================================

export interface Profile {
  id: string
  username: string
  full_name: string
  avatar_url: string | null
  bio: string | null
  role: UserRole
  city: string | null
  instagram_handle: string | null
  styles_dancing: string[]
  styles_teaching: string[]
  enrolled_classes_public: boolean
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  user_id: string
  tier: Exclude<SubscriptionTier, 'none'>
  status: SubscriptionStatus
  started_at: string
  expires_at: string
  mp_subscription_id: string | null
  mp_preapproval_id: string | null
  created_at: string
  updated_at: string
}

export interface TeacherPaymentInfo {
  id: string
  teacher_id: string
  bank_name: string
  account_type: AccountType
  account_number: string
  rut: string
  account_holder_name: string
  email: string
  created_at: string
}

export interface Follow {
  follower_id: string
  following_id: string
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
}

export interface Class {
  id: string
  teacher_id: string
  title: string
  description: string | null
  type: ClassType
  dance_style: string | null
  level: ClassLevel
  // One-time
  date: string | null
  time: string | null
  // Periodic
  recurrence: Recurrence | null
  day_of_week: number | null
  recurring_time: string | null
  // Common
  duration_minutes: number
  location_name: string | null
  location_address: string | null
  city: string | null
  max_spots: number
  price: number
  price_suelta: number | null
  price_2x: number | null
  custom_dates: string[]
  status: ClassStatus
  created_at: string
  updated_at: string
}

export interface ClassMedia {
  id: string
  class_id: string
  type: MediaType
  url: string
  order_index: number
  created_at: string
}

export interface ClassSession {
  id: string
  class_id: string
  date: string
  time: string
  status: SessionStatus
  discount_percentage: number | null
  notes: string | null
  created_at: string
}

export interface Enrollment {
  id: string
  student_id: string
  class_id: string
  session_id: string | null
  status: EnrollmentStatus
  is_2x: boolean
  partner_enrollment_id: string | null
  created_at: string
}

export interface Payment {
  id: string
  enrollment_id: string
  amount: number
  receipt_url: string | null
  status: PaymentStatus
  submitted_at: string
  verified_at: string | null
  rejection_reason: string | null
}

export interface Class2xRequest {
  id: string
  user_id: string
  class_id: string
  session_id: string | null
  matched_with: string | null
  status: TwoxRequestStatus
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  data: Record<string, unknown>
  read: boolean
  created_at: string
}

// ============================================================
// Joined / Extended Types (for UI)
// ============================================================

export interface ClassWithTeacher extends Class {
  teacher: Profile
  media: ClassMedia[]
  spots_taken?: number
  spots_available?: number
  is_enrolled?: boolean
  my_2x_request?: Class2xRequest | null
}

export interface EnrollmentWithDetails extends Enrollment {
  class: ClassWithTeacher
  session?: ClassSession
  payment?: Payment
}

export interface TeacherProfile extends Profile {
  payment_info?: TeacherPaymentInfo
  followers_count?: number
  classes_count?: number
  is_following?: boolean
  active_tier?: SubscriptionTier
}

export interface ProfileWithTier extends Profile {
  active_tier: SubscriptionTier
  subscription?: Subscription | null
}

// ============================================================
// Form Types
// ============================================================

export interface RegisterFormData {
  email: string
  password: string
  full_name: string
  username: string
  city?: string
}

export interface CreateClassFormData {
  title: string
  description?: string
  type: ClassType
  dance_style?: string
  level: ClassLevel
  // One-time
  date?: string
  time?: string
  // Periodic
  recurrence?: Recurrence
  day_of_week?: number
  recurring_time?: string
  // Common
  duration_minutes: number
  location_name?: string
  location_address?: string
  city?: string
  max_spots: number
  price: number
  price_suelta?: number
  price_2x?: number
  custom_dates?: string[]
  media_files?: File[]
}

export interface PaymentInfoFormData {
  bank_name: string
  account_type: AccountType
  account_number: string
  rut: string
  account_holder_name: string
  email: string
}

// ============================================================
// Constants
// ============================================================

export const SUBSCRIPTION_PLANS = [
  {
    tier: 'basic' as const,
    name: 'Básico',
    price: 1500,
    description: 'Toma y dicta clases',
    features: [
      'Inscríbete en cualquier clase',
      'Publica 1 clase suelta por mes',
      'Sube 1 foto o video en esa clase',
      'Explora profesores',
      'Busca compañero 2x',
    ],
  },
  {
    tier: 'pro' as const,
    name: 'Pro',
    price: 3500,
    description: 'Experiencia completa sin límites',
    features: [
      'Todo lo del plan Básico',
      'Publica clases ilimitadas (sueltas y periódicas)',
      'Sube hasta 5 fotos/videos por clase',
      'Publica videos de coreografías',
      'Perfil destacado',
    ],
  },
] as const

export const DANCE_STYLES = [
  'Bachata',
  'Ballet',
  'Breaking',
  'Contemporáneo',
  'Coreografía',
  'Cueca',
  'Cumbia',
  'Dancehall',
  'Danza Árabe',
  'Danza Contemporánea',
  'Fit Dance',
  'Flamenco',
  'Girly Style',
  'Heels',
  'Hip Hop',
  'House',
  'K-Pop',
  'Locking',
  'Merengue',
  'Popping',
  'Reggaetón',
  'Salsa',
  'Street Jazz',
  'Tango',
  'Twerk',
  'Urbano',
  'Vogue',
  'Waacking',
  'Zumba',
] as const

export const CHILEAN_BANKS = [
  'Banco de Chile',
  'BancoEstado',
  'Santander',
  'BCI',
  'Itaú',
  'Scotiabank',
  'Banco Falabella',
  'Banco Ripley',
  'BICE',
  'Banco Security',
  'Coopeuch',
  'Tenpo',
  'Mercado Pago',
  'Otro',
] as const

export const CHILEAN_CITIES = [
  'Santiago',
  'Viña del Mar',
  'Valparaíso',
  'Rancagua',
  'Concepción',
  'La Serena',
  'Antofagasta',
  'Iquique',
  'Arica',
] as const

export const DAYS_OF_WEEK = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

// ============================================================
// Utility Functions
// ============================================================

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatRUT(rut: string): string {
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

export function getNextOccurrence(dayOfWeek: number, time: string): Date {
  const now = new Date()
  const result = new Date()
  const daysUntil = (dayOfWeek - now.getDay() + 7) % 7
  result.setDate(now.getDate() + (daysUntil === 0 ? 7 : daysUntil))
  const [hours, minutes] = time.split(':').map(Number)
  result.setHours(hours, minutes, 0, 0)
  return result
}
