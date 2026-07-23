import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Sin sesión solo se puede navegar el feed y explorar (más el detalle público
// de clase/evento y el widget /embed, ver más abajo). El resto de las vistas
// redirigen a login.
const PUBLIC_ROUTES = ['/', '/feed', '/explore', '/auth/login', '/auth/register', '/terms', '/privacy']

// Solo el detalle público de una clase o evento (:id) es accesible sin sesión.
// Subrutas como /edit exigen login y guards de ownership server-side.
const PUBLIC_CLASS_DETAIL = /^\/class\/[^/]+\/?$/
const PUBLIC_EVENT_DETAIL = /^\/event\/[^/]+\/?$/

// Perfil público del profesor (:username): visible sin sesión para no cortar el
// flujo de exploración del feed público (P1-5). La página ya tolera user=null
// (oculta acciones de seguir/amistad/valorar) y hace notFound() si deleted_at.
const PUBLIC_TEACHER_PROFILE = /^\/teacher\/[^/]+\/?$/

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
    PUBLIC_TEACHER_PROFILE.test(pathname) ||
    PUBLIC_EMBED.test(pathname)

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Excluir /api: las rutas API hacen su propia auth (requireUser soporta
  // Bearer para mobile + cookie para web). Sin esta exclusión el middleware
  // —que solo lee cookies— redirige a /auth/login toda llamada API con Bearer,
  // rompiendo el path mobile (escáner QR, enroll, chat, etc.).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
