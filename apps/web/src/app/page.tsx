import { redirect } from 'next/navigation'

// El landing ahora ES el feed: cualquiera (con o sin sesión) ve el feed público.
// La exigencia de crear cuenta ocurre recién al intentar una acción (inscribir, etc.).
export default function LandingPage() {
  redirect('/feed')
}
