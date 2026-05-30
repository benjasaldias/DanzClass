import Link from 'next/link'
import LogoIcon from '@/components/ui/LogoIcon'

export const metadata = {
  title: 'Terms of Use / Términos de Uso — DanzClass',
  description: 'Terms and conditions of use for the DanzClass platform',
}

const LAST_UPDATED_ES = '27 de mayo de 2026'
const LAST_UPDATED_EN = 'May 27, 2026'
const CONTACT_EMAIL = 'contacto@danzclass.com'

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const params = await searchParams
  const lang = params?.lang === 'en' ? 'en' : 'es'
  const isEN = lang === 'en'

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <LogoIcon className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">DanzClass</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
              <Link
                href="/terms?lang=es"
                className={`px-3 py-1.5 ${!isEN ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                ES
              </Link>
              <Link
                href="/terms?lang=en"
                className={`px-3 py-1.5 ${isEN ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                EN
              </Link>
            </div>
            <Link href="/auth/register" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              {isEN ? 'Create account' : 'Crear cuenta'}
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {isEN ? <TermsEN /> : <TermsES />}
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

function TermsES() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Uso</h1>
      <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED_ES}</p>
      <div className="prose prose-gray max-w-none space-y-8">
        <Section title="1. Aceptación de los términos">
          <p>
            Al crear una cuenta o utilizar DanzClass (en adelante, "la Plataforma"), aceptas íntegramente
            estos Términos de Uso. Si no estás de acuerdo con alguno de sus términos, no debes usar la Plataforma.
          </p>
          <p>
            DanzClass es una plataforma intermediaria que conecta profesores y estudiantes de baile en Chile.
            No somos parte de las transacciones ni contratos que se generan entre los usuarios.
          </p>
        </Section>
        <Section title="2. Responsabilidad sobre el contenido publicado">
          <p>
            <strong>Eres el único responsable de todo el contenido que publicas en DanzClass</strong>,
            incluyendo videos, fotografías, texto, música de fondo y cualquier otro material audiovisual.
          </p>
          <p>Al subir o publicar contenido en la Plataforma, declaras y garantizas que:</p>
          <ul>
            <li><strong>Eres titular de los derechos</strong> sobre el audio y el video que publicas, o tienes autorización expresa de los titulares.</li>
            <li>El contenido <strong>no infringe derechos de propiedad intelectual</strong> de terceros.</li>
            <li>Dispones de los derechos, licencias y autorizaciones necesarias para otorgar a DanzClass el uso no exclusivo del contenido dentro de la Plataforma.</li>
            <li>El contenido no contiene material ilegal, difamatorio, obsceno, amenazante ni prohibido por la legislación chilena.</li>
          </ul>
        </Section>
        <Section title="3. Contenido prohibido">
          <p>Está estrictamente prohibido publicar en DanzClass:</p>
          <ul>
            <li>Videos o audios que infrinjan derechos de autor sin la correspondiente licencia</li>
            <li>Contenido que muestre violencia, desnudez, pornografía o material sexual explícito</li>
            <li>Material que discrimine por raza, género, religión, orientación sexual u otra condición</li>
            <li>Spam, publicidad engañosa o contenido repetitivo con fines comerciales no autorizados</li>
            <li>Información personal de terceros sin su consentimiento</li>
            <li>Cualquier contenido que viole la legislación chilena aplicable</li>
          </ul>
        </Section>
        <Section title="4. Sistema de denuncias y moderación">
          <p>DanzClass pone a disposición un sistema de denuncias para reportar contenido que infrinja estos términos. Al recibir una denuncia, la Plataforma se compromete a:</p>
          <ul>
            <li>Revisar el contenido reportado dentro de un plazo razonable</li>
            <li>Eliminar o deshabilitar el acceso al contenido que claramente infrinja los presentes términos</li>
            <li>Notificar al usuario infractor y, en casos graves, suspender o eliminar su cuenta</li>
          </ul>
        </Section>
        <Section title="5. Licencia de uso del contenido">
          <p>
            Al publicar contenido en DanzClass, otorgas a la Plataforma una licencia no exclusiva, gratuita,
            mundial y sublicenciable para reproducir, mostrar y distribuir dicho contenido exclusivamente
            dentro de la Plataforma y con el fin de prestar el servicio.
          </p>
        </Section>
        <Section title="6. Pagos, transacciones y reembolsos">
          <p>
            Los pagos entre estudiantes y profesores se realizan directamente mediante transferencia bancaria.
            DanzClass actúa solo como intermediario de comunicación. Las suscripciones a los planes de la
            Plataforma se procesan a través de Mercado Pago.
          </p>
          <p>
            <strong>Política de reembolsos:</strong> si un profesor cancela una clase en la que estás inscrito
            y con pago confirmado, tienes derecho a solicitar el reembolso directamente al profesor. DanzClass
            no intermedia ni garantiza dichos reembolsos. Para suscripciones canceladas, no se realizan
            reembolsos proporcionales; el acceso se mantiene hasta el fin del período pagado.
          </p>
        </Section>
        <Section title="7. Eventos publicados en la Plataforma">
          <p>
            Los organizadores de eventos (batallas, masterclasses u otros) son los únicos responsables del
            contenido, logística y condiciones de sus eventos. DanzClass actúa como canal de difusión y no
            garantiza la realización del evento ni la calidad del mismo. Los pagos de entrada se gestionan
            directamente con el organizador.
          </p>
        </Section>
        <Section title="8. Limitación de responsabilidad">
          <p>En la máxima medida permitida por la ley, DanzClass no será responsable por:</p>
          <ul>
            <li>Daños derivados del contenido publicado por los usuarios</li>
            <li>Disputas entre usuarios relativas a pagos, clases o acuerdos privados</li>
            <li>Pérdida de datos o interrupción del servicio por causas fuera de nuestro control</li>
            <li>Infracciones de derechos de autor cometidas por los usuarios</li>
          </ul>
        </Section>
        <Section title="9. Suspensión y eliminación de cuentas">
          <p>
            DanzClass se reserva el derecho de suspender o eliminar, sin previo aviso, cualquier cuenta que
            infrinja estos términos, publique contenido ilegal o cause daño a otros usuarios o a la Plataforma.
          </p>
        </Section>
        <Section title="10. Modificaciones a los términos">
          <p>
            Podemos actualizar estos Términos de Uso en cualquier momento. Los cambios se publicarán en esta
            página con la fecha de actualización.
          </p>
        </Section>
        <Section title="11. Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia será
            sometida a los tribunales competentes de la ciudad de Santiago, Chile.
          </p>
        </Section>
        <Section title="12. Contacto">
          <p>
            Para consultas, denuncias de contenido o notificaciones legales:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </div>
      <div className="mt-12 pt-8 border-t border-gray-200 text-center">
        <Link href="/auth/register" className="btn-primary px-8 py-3 inline-block">
          Crear cuenta en DanzClass
        </Link>
        <p className="mt-3 text-xs text-gray-400">
          Al registrarte declaras haber leído y aceptado estos Términos de Uso y la{' '}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700">
            Política de Privacidad
          </Link>.
        </p>
      </div>
    </>
  )
}

function TermsEN() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Use</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED_EN}</p>
      <div className="prose prose-gray max-w-none space-y-8">
        <Section title="1. Acceptance of terms">
          <p>
            By creating an account or using DanzClass (hereinafter, "the Platform"), you fully accept these
            Terms of Use. If you disagree with any of them, you must not use the Platform.
          </p>
          <p>
            DanzClass is an intermediary platform that connects dance teachers and students in Chile.
            We are not a party to the transactions or contracts between users.
          </p>
        </Section>
        <Section title="2. Responsibility for published content">
          <p>
            <strong>You are solely responsible for all content you publish on DanzClass</strong>,
            including videos, photographs, text, background music, and any other audiovisual material.
          </p>
          <p>By uploading or publishing content, you represent and warrant that:</p>
          <ul>
            <li>You <strong>own the rights</strong> to the audio and video you publish, or have express authorization from the rights holders.</li>
            <li>The content <strong>does not infringe intellectual property rights</strong> of third parties.</li>
            <li>You hold the necessary rights, licenses, and authorizations to grant DanzClass a non-exclusive use of the content within the Platform.</li>
            <li>The content does not contain illegal, defamatory, obscene, threatening, or otherwise prohibited material under Chilean law.</li>
          </ul>
        </Section>
        <Section title="3. Prohibited content">
          <p>The following is strictly prohibited on DanzClass:</p>
          <ul>
            <li>Videos or audio that infringe copyright without the corresponding license or authorization</li>
            <li>Content depicting violence, nudity, pornography, or explicit sexual material</li>
            <li>Material that discriminates based on race, gender, religion, sexual orientation, or other characteristics</li>
            <li>Spam, misleading advertising, or repetitive content for unauthorized commercial purposes</li>
            <li>Personal information of third parties without their consent</li>
            <li>Any content that violates applicable Chilean law</li>
          </ul>
        </Section>
        <Section title="4. Reporting system and moderation">
          <p>DanzClass provides a reporting system for content that violates these terms. Upon receiving a report, the Platform will:</p>
          <ul>
            <li>Review the reported content within a reasonable timeframe</li>
            <li>Remove or disable access to content that clearly violates these terms</li>
            <li>Notify the infringing user and, in serious cases, suspend or delete their account</li>
          </ul>
        </Section>
        <Section title="5. Content license">
          <p>
            By publishing content on DanzClass, you grant the Platform a non-exclusive, royalty-free,
            worldwide, sublicensable license to reproduce, display, and distribute said content exclusively
            within the Platform and for the purpose of providing the service.
          </p>
        </Section>
        <Section title="6. Payments, transactions, and refunds">
          <p>
            Payments between students and teachers are made directly via bank transfer. DanzClass acts only
            as a communication intermediary and does not process nor guarantee payments. Subscription plans
            are processed through Mercado Pago, subject to their own terms.
          </p>
          <p>
            <strong>Refund policy:</strong> if a teacher cancels a class in which you are enrolled with a
            confirmed payment, you may request a refund directly from the teacher through their profile.
            DanzClass does not mediate or guarantee such refunds. Cancelled subscriptions are not
            proportionally refunded; access is maintained until the end of the paid period.
          </p>
        </Section>
        <Section title="7. Events published on the Platform">
          <p>
            Event organizers (battles, masterclasses, or other events) are solely responsible for the content,
            logistics, and conditions of their events. DanzClass acts as a distribution channel and does not
            guarantee that the event will take place or its quality. Entry payments are managed directly with
            the organizer.
          </p>
        </Section>
        <Section title="8. Limitation of liability">
          <p>To the maximum extent permitted by law, DanzClass shall not be liable for:</p>
          <ul>
            <li>Damages arising from content published by users</li>
            <li>Disputes between users regarding payments, classes, or private agreements</li>
            <li>Loss of data or service interruptions caused by factors beyond our control</li>
            <li>Copyright infringements committed by users</li>
          </ul>
        </Section>
        <Section title="9. Account suspension and deletion">
          <p>
            DanzClass reserves the right to suspend or delete, without notice, any account that violates these
            terms, publishes illegal content, or causes harm to other users or the Platform.
          </p>
        </Section>
        <Section title="10. Amendments to these terms">
          <p>
            We may update these Terms of Use at any time. Changes will be published on this page with the
            updated date. Continued use of the Platform after changes are published constitutes your
            acceptance of the new terms.
          </p>
        </Section>
        <Section title="11. Governing law and jurisdiction">
          <p>
            These terms are governed by the laws of the Republic of Chile. Any disputes arising from their
            interpretation or enforcement shall be submitted to the competent courts of Santiago, Chile.
          </p>
        </Section>
        <Section title="12. Contact">
          <p>
            For inquiries, content reports, or legal notices:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </div>
      <div className="mt-12 pt-8 border-t border-gray-200 text-center">
        <Link href="/auth/register" className="btn-primary px-8 py-3 inline-block">
          Create a DanzClass account
        </Link>
        <p className="mt-3 text-xs text-gray-400">
          By registering you declare that you have read and accepted these Terms of Use and the{' '}
          <Link href="/privacy?lang=en" className="text-brand-600 hover:text-brand-700">
            Privacy Policy
          </Link>.
        </p>
      </div>
    </>
  )
}
