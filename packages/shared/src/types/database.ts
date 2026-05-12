// Auto-generated types from Supabase schema
// Re-generate with: npx supabase gen types typescript --local > packages/shared/src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string
          avatar_url: string | null
          bio: string | null
          role: 'teacher' | 'student'
          city: string | null
          instagram_handle: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          full_name: string
          avatar_url?: string | null
          bio?: string | null
          role: 'teacher' | 'student'
          city?: string | null
          instagram_handle?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          username?: string
          full_name?: string
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          instagram_handle?: string | null
          updated_at?: string
        }
      }
      teacher_payment_info: {
        Row: {
          id: string
          teacher_id: string
          bank_name: string
          account_type: 'cuenta_corriente' | 'cuenta_vista' | 'cuenta_rut' | 'cuenta_ahorro'
          account_number: string
          rut: string
          account_holder_name: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          bank_name: string
          account_type: 'cuenta_corriente' | 'cuenta_vista' | 'cuenta_rut' | 'cuenta_ahorro'
          account_number: string
          rut: string
          account_holder_name: string
          email: string
          created_at?: string
        }
        Update: {
          bank_name?: string
          account_type?: 'cuenta_corriente' | 'cuenta_vista' | 'cuenta_rut' | 'cuenta_ahorro'
          account_number?: string
          rut?: string
          account_holder_name?: string
          email?: string
        }
      }
      follows: {
        Row: {
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          follower_id: string
          following_id: string
          created_at?: string
        }
        Update: never
      }
      classes: {
        Row: {
          id: string
          teacher_id: string
          title: string
          description: string | null
          type: 'suelta' | 'periodica'
          dance_style: string | null
          level: 'principiante' | 'intermedio' | 'avanzado' | 'todos'
          date: string | null
          time: string | null
          recurrence: 'weekly' | 'biweekly' | 'monthly' | null
          day_of_week: number | null
          recurring_time: string | null
          duration_minutes: number
          location_name: string | null
          location_address: string | null
          city: string | null
          max_spots: number
          price: number
          status: 'active' | 'cancelled' | 'completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          title: string
          description?: string | null
          type: 'suelta' | 'periodica'
          dance_style?: string | null
          level?: 'principiante' | 'intermedio' | 'avanzado' | 'todos'
          date?: string | null
          time?: string | null
          recurrence?: 'weekly' | 'biweekly' | 'monthly' | null
          day_of_week?: number | null
          recurring_time?: string | null
          duration_minutes?: number
          location_name?: string | null
          location_address?: string | null
          city?: string | null
          max_spots: number
          price: number
          status?: 'active' | 'cancelled' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          dance_style?: string | null
          level?: 'principiante' | 'intermedio' | 'avanzado' | 'todos'
          date?: string | null
          time?: string | null
          recurrence?: 'weekly' | 'biweekly' | 'monthly' | null
          day_of_week?: number | null
          recurring_time?: string | null
          duration_minutes?: number
          location_name?: string | null
          location_address?: string | null
          city?: string | null
          max_spots?: number
          price?: number
          status?: 'active' | 'cancelled' | 'completed'
          updated_at?: string
        }
      }
      class_media: {
        Row: {
          id: string
          class_id: string
          type: 'image' | 'video'
          url: string
          order_index: number
          created_at: string
        }
        Insert: {
          id?: string
          class_id: string
          type: 'image' | 'video'
          url: string
          order_index?: number
          created_at?: string
        }
        Update: {
          order_index?: number
        }
      }
      class_sessions: {
        Row: {
          id: string
          class_id: string
          date: string
          time: string
          status: 'scheduled' | 'cancelled' | 'completed'
          discount_percentage: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          class_id: string
          date: string
          time: string
          status?: 'scheduled' | 'cancelled' | 'completed'
          discount_percentage?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          status?: 'scheduled' | 'cancelled' | 'completed'
          discount_percentage?: number | null
          notes?: string | null
        }
      }
      enrollments: {
        Row: {
          id: string
          student_id: string
          class_id: string
          session_id: string | null
          status: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          class_id: string
          session_id?: string | null
          status?: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'cancelled'
          created_at?: string
        }
        Update: {
          status?: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'cancelled'
        }
      }
      payments: {
        Row: {
          id: string
          enrollment_id: string
          amount: number
          receipt_url: string | null
          status: 'pending' | 'verified' | 'rejected'
          submitted_at: string
          verified_at: string | null
          rejection_reason: string | null
        }
        Insert: {
          id?: string
          enrollment_id: string
          amount: number
          receipt_url?: string | null
          status?: 'pending' | 'verified' | 'rejected'
          submitted_at?: string
          verified_at?: string | null
          rejection_reason?: string | null
        }
        Update: {
          receipt_url?: string | null
          status?: 'pending' | 'verified' | 'rejected'
          verified_at?: string | null
          rejection_reason?: string | null
        }
      }
    }
    Views: {
      class_spots: {
        Row: {
          class_id: string
          max_spots: number
          spots_taken: number
          spots_available: number
        }
      }
      session_spots: {
        Row: {
          session_id: string
          class_id: string
          max_spots: number
          spots_taken: number
          spots_available: number
        }
      }
    }
    Functions: {}
    Enums: {}
  }
}
