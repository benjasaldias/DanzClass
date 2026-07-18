import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/', '/feed', '/auth/login', '/auth/register', '/terms', '/privacy']

// Solo el detalle público de una clase o evento (:id) es accesible sin sesión.
// Subrutas como /edit exigen login y guards de ownership server-side.
const PUBLIC_CLASS_DETAIL = /^\/class\/[^/]+\/?$/
const PUBLIC_EVENT_DETAIL = /^\/event\/[^/]+\/?$/

// Embeddable widget — completamente público (se embebe en iframes externos)
const PUBLIC_EMBED = /^\/embed\//

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (user && (pathname === '/auth/login' || pathname === '/auth/register')) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  const isPublic =
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/auth') ||
    PUBLIC_CLASS_DETAIL.test(pathname) ||
    PUBLIC_EVENT_DETAIL.test(pathname) ||
    PUBLIC_EMBED.test(pathname)

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
