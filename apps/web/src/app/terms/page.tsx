import Link from 'next/link'
import { Music2 } from 'lucide-react'

export const metadata = {
  title: 'Términos de Uso — DanceClass',
  description: 'T��rminos y condiciones de uso de la plataforma DanceClass',
}

const LAST_UPDATED = '15 de mayo de 2026'
const CONTACT_EMAIL = 'contacto@danceclass.cl'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Music2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">DanceClass</span>
          </Link>
          <Link href="/auth/register" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            Crear cuenta
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Uso</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-gray max-w-none space-y-8">

          <Section title="1. Aceptación de los términos">
            <p>
              Al crear una cuenta o utilizar DanceClass (en adelante, "la Plataforma"), aceptas íntegramente
              estos Términos de Uso. Si no estás de acuerdo con alguno de sus términos, no debes usar la
              Plataforma.
            </p>
            <p>
              DanceClass es una plataforma intermediaria que conecta profesores y estudiantes de baile en Chile.
              No somos parte de las transacciones ni contratos que se generan entre los usuarios.
            </p>
          </Section>

          <Section title="2. Responsabilidad sobre el contenido publicado">
            <p>
              <strong>Eres el único responsable de todo el contenido que publicas en DanceClass</strong>,
              incluyendo, sin limitación, videos, fotografías, texto, música de fondo y cualquier otro material
              audiovisual.
            </p>
            <p>
              Al subir o publicar contenido en la Plataforma, declaras y garantizas que:
            </p>
            <ul>
              <li>
                <strong>Eres titular de los derechos</strong> sobre el audio y el video que publicas, o tienes
                autorización expresa y válida de los titulares de dichos derechos para su uso en una plataforma
                digital de acceso público.
              </li>
              <li>
                El contenido <strong>no infringe derechos de propiedad intelectual</strong> de terceros,
                incluyendo derechos de autor sobre música, imágenes, coreografías u obras protegidas.
              </li>
              <li>
                Dispones de los derechos, licencias y autorizaciones necesarias para otorgar a DanceClass el
                uso no exclusivo del contenido con el único fin de mostrarlo dentro de la Plataforma.
              </li>
              <li>
                El contenido no contiene material ilegal, difamatorio, obsceno, amenazante ni de ningún tipo
                prohibido por la legislación chilena vigente.
              </li>
            </ul>
            <p>
              DanceClass actúa como <strong>plataforma intermediaria de alojamiento de contenido</strong>.
              De acuerdo con la legislación chilena (Ley N° 17.336 de Propiedad Intelectual y sus modificaciones)
              y los principios del derecho comparado aplicables a proveedores de servicios en línea, la
              Plataforma no es responsable por contenido generado por usuarios que infrinja derechos de terceros,
              siempre que actúe con la debida diligencia ante notificaciones legítimas de infracción.
            </p>
          </Section>

          <Section title="3. Contenido prohibido">
            <p>Está estrictamente prohibido publicar en DanceClass:</p>
            <ul>
              <li>Videos o audios que infrinjan derechos de autor sin la correspondiente licencia o autorización</li>
              <li>Contenido que muestre violencia, desnudez, pornografía o material sexual explícito</li>
              <li>Material que discrimine por raza, género, religión, orientación sexual u otra condición</li>
              <li>Spam, publicidad engañosa o contenido repetitivo con fines comerciales no autorizados</li>
              <li>Información personal de terceros sin su consentimiento</li>
              <li>Cualquier contenido que viole la legislación chilena aplicable</li>
            </ul>
          </Section>

          <Section title="4. Sistema de denuncias y moderación">
            <p>
              DanceClass pone a disposición de sus usuarios un sistema de denuncias para reportar contenido que
              infrinja estos términos. Al recibir una denuncia, la Plataforma se compromete a:
            </p>
            <ul>
              <li>Revisar el contenido reportado dentro de un plazo razonable</li>
              <li>Eliminar o deshabilitar el acceso al contenido que claramente infrinja los presentes términos</li>
              <li>Notificar al usuario infractor y, en casos graves, suspender o eliminar su cuenta</li>
            </ul>
            <p>
              La presentación de denuncias falsas o de mala fe puede dar lugar a la suspensión de la cuenta del
              denunciante.
            </p>
          </Section>

          <Section title="5. Licencia de uso del contenido">
            <p>
              Al publicar contenido en DanceClass, otorgas a la Plataforma una licencia no exclusiva, gratuita,
              mundial y sublicenciable para reproducir, mostrar, distribuir y adaptar dicho contenido
              exclusivamente dentro de la Plataforma y con el fin de prestar el servicio.
            </p>
            <p>
              Esta licencia termina cuando eliminas el contenido o cierras tu cuenta, salvo que el contenido haya
              sido compartido con otros usuarios y persista en sus interacciones previas.
            </p>
          </Section>

          <Section title="6. Pagos y transacciones">
            <p>
              Los pagos entre estudiantes y profesores se realizan directamente mediante transferencia bancaria.
              DanceClass actúa solo como intermediario de comunicación y no procesa ni garantiza los pagos.
              Las suscripciones a los planes de la Plataforma se procesan a través de Mercado Pago, sujetos a
              sus propios términos y condiciones.
            </p>
          </Section>

          <Section title="7. Limitaci��n de responsabilidad">
            <p>
              En la máxima medida permitida por la ley, DanceClass no será responsable por:
            </p>
            <ul>
              <li>Daños derivados del contenido publicado por los usuarios</li>
              <li>Disputas entre usuarios relativas a pagos, clases o acuerdos privados</li>
              <li>Pérdida de datos o interrupción del servicio por causas fuera de nuestro control</li>
              <li>Infracciones de derechos de autor cometidas por los usuarios</li>
            </ul>
          </Section>

          <Section title="8. Suspensión y eliminación de cuentas">
            <p>
              DanceClass se reserva el derecho de suspender o eliminar, sin previo aviso, cualquier cuenta que
              infrinja estos términos, publique contenido ilegal o cause daño a otros usuarios o a la Plataforma.
            </p>
          </Section>

          <Section title="9. Modificaciones a los términos">
            <p>
              Podemos actualizar estos Términos de Uso en cualquier momento. Los cambios se publicarán en esta
              página con la fecha de actualización. El uso continuado de la Plataforma tras la publicación de
              cambios constituye tu aceptación de los nuevos términos.
            </p>
          </Section>

          <Section title="10. Ley aplicable y jurisdicción">
            <p>
              Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia derivada
              de su interpretación o cumplimiento será sometida a los tribunales competentes de la ciudad de
              Santiago, Chile.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>
              Para consultas, denuncias de contenido o notificaciones legales, puedes escribirnos a:{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center">
          <Link href="/auth/register" className="btn-primary px-8 py-3 inline-block">
            Crear cuenta en DanceClass
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            Al registrarte declaras haber leído y aceptado estos Términos de Uso.
          </p>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}
