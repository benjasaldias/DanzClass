import Link from 'next/link'
import LogoIcon from '@/components/ui/LogoIcon'

export const metadata = {
  title: 'Privacy Policy / Política de Privacidad — DanzClass',
  description: 'Privacy policy and personal data processing for DanzClass',
}

const LAST_UPDATED_ES = '17 de julio de 2026'
const LAST_UPDATED_EN = 'July 17, 2026'
const CONTACT_EMAIL = 'contacto@danzclass.com'

export default async function PrivacyPage({
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
                href="/privacy?lang=es"
                className={`px-3 py-1.5 ${!isEN ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                ES
              </Link>
              <Link
                href="/privacy?lang=en"
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
        {isEN ? <PrivacyEN /> : <PrivacyES />}
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

function PrivacyES() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
      <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED_ES}</p>
      <div className="prose prose-gray max-w-none space-y-8">
        <Section title="1. Quiénes somos">
          <p>
            DanzClass es una plataforma digital que conecta profesores y estudiantes de baile en Chile.
            El responsable del tratamiento de tus datos personales es DanzClass, contactable en{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">
              {CONTACT_EMAIL}
            </a>.
          </p>
          <p>
            Esta Política de Privacidad describe qué datos recopilamos, cómo los usamos, con quién los
            compartimos y cuáles son tus derechos. Al usar DanzClass aceptas las prácticas descritas aquí.
          </p>
        </Section>
        <Section title="2. Datos que recopilamos">
          <p>Recopilamos los siguientes datos cuando usas la Plataforma:</p>
          <ul>
            <li><strong>Datos de cuenta:</strong> nombre, apellido, nombre de usuario, dirección de correo electrónico, contraseña (almacenada de forma encriptada), ciudad y foto de perfil.</li>
            <li><strong>Datos de actividad:</strong> clases publicadas o en las que te inscribes, publicaciones de video, seguimientos, amistades y valoraciones.</li>
            <li><strong>Datos de pago:</strong> comprobantes de transferencia bancaria que subes como imagen, y los datos de tu cuenta bancaria si eres profesor. DanzClass no almacena datos de tarjetas de crédito; los pagos de suscripción son procesados por Mercado Pago.</li>
            <li><strong>Contenido multimedia:</strong> fotos y videos de clases que publicas, videos de postulación a entrenamientos y el video de tu perfil público.</li>
            <li><strong>Datos técnicos:</strong> registros de acceso, dirección IP y datos del dispositivo, recopilados automáticamente por los servicios de infraestructura que usamos.</li>
            <li><strong>Token de notificación:</strong> si autorizas notificaciones push en la app móvil, almacenamos el token de dispositivo de Expo para enviarte notificaciones. Puedes revocar este permiso en cualquier momento desde la configuración de tu dispositivo.</li>
          </ul>
        </Section>
        <Section title="3. Cómo usamos tus datos">
          <p>Usamos tus datos para:</p>
          <ul>
            <li>Crear y gestionar tu cuenta en la Plataforma.</li>
            <li>Mostrar tu perfil, clases y publicaciones a otros usuarios según tu configuración de privacidad.</li>
            <li>Procesar inscripciones a clases y llevar el registro de pagos entre usuarios.</li>
            <li>Enviarte notificaciones dentro de la app y, si lo autorizas, notificaciones push a tu dispositivo.</li>
            <li>Gestionar suscripciones de pago a través de Mercado Pago.</li>
            <li>Proteger la seguridad de la Plataforma y detectar usos abusivos.</li>
            <li>Cumplir con obligaciones legales aplicables.</li>
          </ul>
        </Section>
        <Section title="4. Servicios de terceros">
          <p>DanzClass utiliza los siguientes proveedores de servicios externos que pueden procesar tus datos:</p>
          <ul>
            <li><strong>Supabase</strong> — base de datos, autenticación y almacenamiento de archivos. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">supabase.com/privacy</a>.</li>
            <li><strong>Cloudinary</strong> — compresión y entrega de videos publicados en el feed. <a href="https://cloudinary.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">cloudinary.com/privacy</a>.</li>
            <li><strong>Mercado Pago</strong> — procesamiento de pagos de suscripciones. <a href="https://www.mercadopago.cl/privacidad" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">mercadopago.cl/privacidad</a>.</li>
            <li><strong>Vercel</strong> — alojamiento de la aplicación web. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">vercel.com/legal/privacy-policy</a>.</li>
            <li><strong>Expo (Notifications)</strong> — servicio de notificaciones push para la app móvil. Los tokens de dispositivo se envían a los servidores de Expo para enrutar las notificaciones. <a href="https://expo.dev/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">expo.dev/privacy</a>.</li>
          </ul>
          <p>No vendemos ni cedemos tus datos personales a terceros con fines comerciales.</p>
        </Section>
        <Section title="5. Escaneo de comprobantes con inteligencia artificial">
          <p>
            Cuando subes un comprobante de transferencia bancaria (como estudiante) o cuando un profesor
            recibe uno para confirmar un pago, la imagen puede ser analizada por un{' '}
            <strong>sistema de inteligencia artificial</strong> con el único fin de extraer datos que ayuden a
            verificar el pago: monto, número de operación, fecha, banco emisor y posibles inconsistencias.
          </p>
          <ul>
            <li>
              <strong>Nunca solicitamos tus credenciales bancarias.</strong> DanzClass ni su sistema de escaneo
              te pedirán jamás claves, tarjetas, códigos de seguridad ni acceso a tu banca en línea. Si recibes
              un mensaje pidiendo esos datos en nombre de DanzClass, repórtalo de inmediato a{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a>.
            </li>
            <li>Guardamos el resultado del análisis (campos extraídos, nivel de confianza, inconsistencias detectadas) asociado al pago correspondiente, no un perfil financiero de tu persona.</li>
            <li>La imagen del comprobante se almacena en un espacio de almacenamiento privado, accesible solo por el estudiante que lo subió, el profesor de la clase y, cuando corresponda, el sistema de verificación automatizada.</li>
            <li>Estos datos se usan exclusivamente para verificar el pago y prevenir el uso repetido de un mismo comprobante. No se usan para elaborar perfiles publicitarios ni se comparten con fines comerciales.</li>
            <li><strong>No utilizamos las imágenes de tus comprobantes ni los datos extraídos de ellos para entrenar modelos de inteligencia artificial</strong>, propios o de terceros, salvo que lo autorices expresamente.</li>
            <li>Salvo que actives la confirmación automática de pagos (función desactivada de forma predeterminada y controlada centralmente), ningún pago se confirma exclusivamente por un sistema automatizado: un profesor revisa siempre el resultado antes de confirmar.</li>
          </ul>
          <p>
            El proveedor del servicio de inteligencia artificial se definirá e informará en esta página antes
            de su entrada en operación. Dado que ese proveedor actuará como encargado del tratamiento de estos
            datos, firmaremos con él un contrato que fije el objeto, la finalidad, los tipos de datos y las
            obligaciones de seguridad, incluyendo garantías para la transferencia internacional de datos cuando
            corresponda. El tratamiento de estos datos se rige por la Ley N° 19.628, por la Ley N° 21.719 (en
            vigencia desde el 1 de diciembre de 2026) y por la Circular Interpretativa de SERNAC sobre
            inteligencia artificial y consumidores (Resolución Exenta N° 33 de 2022).
          </p>
        </Section>
        <Section title="6. Retención y eliminación de datos">
          <p>Conservamos tus datos mientras tu cuenta esté activa. Específicamente:</p>
          <ul>
            <li><strong>Cuentas no confirmadas:</strong> eliminadas automáticamente 24 horas después de la creación si el correo no fue verificado.</li>
            <li><strong>Archivos multimedia de clases:</strong> eliminados automáticamente mediante un proceso diario de limpieza.</li>
            <li><strong>Videos de audición:</strong> almacenados en un bucket privado; se eliminan junto con la clase si esta es cancelada.</li>
            <li><strong>Mensajes de chat:</strong> los chats de clase se eliminan 48 horas después de que finaliza la clase; los de ensayo se eliminan 48 horas después del último evento del ensayo.</li>
            <li><strong>Cierre de cuenta:</strong> al eliminar tu cuenta, los datos personales son anonimizados o eliminados de inmediato. El hard-delete completo se realiza en un plazo máximo de 30 días.</li>
          </ul>
          <p>Los siguientes datos <strong>se conservan por obligaciones legales</strong>: historial de pagos (incluyendo resultados de escaneo IA), inscripciones confirmadas y registros de denuncias.</p>
        </Section>
        <Section title="7. Privacidad de tus publicaciones">
          <ul>
            <li><strong>Público:</strong> visible para cualquier usuario de DanzClass.</li>
            <li><strong>Seguidores:</strong> visible solo para los usuarios que te siguen.</li>
            <li><strong>Amigos:</strong> visible solo para tus conexiones confirmadas como amigos.</li>
          </ul>
        </Section>
        <Section title="8. Seguridad">
          <p>Implementamos cifrado en tránsito (HTTPS), autenticación segura y políticas de acceso por filas (RLS) en la base de datos. Ningún sistema es completamente seguro; te recomendamos usar una contraseña robusta.</p>
        </Section>
        <Section title="9. Menores de edad">
          <p>DanzClass está dirigido a personas de <strong>14 años o más</strong>. No recopilamos intencionalmente datos de menores de 14 años.</p>
        </Section>
        <Section title="10. Tus derechos">
          <p>De acuerdo con la Ley N° 19.628 sobre Protección de la Vida Privada de Chile, tienes derecho a acceso, rectificación, cancelación y oposición. Escríbenos a <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a>.</p>
        </Section>
        <Section title="11. Cookies y almacenamiento local">
          <p>DanzClass usa cookies de sesión estrictamente necesarias. No usamos cookies de seguimiento publicitario. La preferencia de tema se almacena localmente en tu dispositivo.</p>
        </Section>
        <Section title="12. Cambios a esta política">
          <p>Podemos actualizar esta Política en cualquier momento. Los cambios se publicarán en esta página con la fecha de actualización.</p>
        </Section>
        <Section title="13. Contacto">
          <p>Para consultas sobre privacidad: <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a></p>
        </Section>
      </div>
      <div className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">
          También puedes revisar nuestros{' '}
          <Link href="/terms" className="text-brand-600 hover:text-brand-700">Términos de Uso</Link>.
        </p>
      </div>
    </>
  )
}

function PrivacyEN() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED_EN}</p>
      <div className="prose prose-gray max-w-none space-y-8">
        <Section title="1. Who we are">
          <p>
            DanzClass is a digital platform that connects dance teachers and students in Chile.
            The controller of your personal data is DanzClass, reachable at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">
              {CONTACT_EMAIL}
            </a>.
          </p>
          <p>
            This Privacy Policy describes what data we collect, how we use it, with whom we share it,
            and what your rights are. By using DanzClass you accept the practices described here.
          </p>
        </Section>
        <Section title="2. Data we collect">
          <p>We collect the following data when you use the Platform:</p>
          <ul>
            <li><strong>Account data:</strong> first name, last name, username, email address, password (stored encrypted), city, and profile photo.</li>
            <li><strong>Activity data:</strong> classes you publish or enroll in, video posts, follows, friendships, and ratings.</li>
            <li><strong>Payment data:</strong> bank transfer receipts you upload as images, and your bank account details if you are a teacher. DanzClass does not store credit card data; subscription payments are processed by Mercado Pago.</li>
            <li><strong>Multimedia content:</strong> photos and videos of classes you publish, audition videos for training programs, and your public profile video.</li>
            <li><strong>Technical data:</strong> access logs, IP address, and device data, automatically collected by the infrastructure services we use.</li>
            <li><strong>Push notification token:</strong> if you grant push notification permission in the mobile app, we store your Expo device token to send you notifications. You can revoke this permission at any time from your device settings.</li>
          </ul>
        </Section>
        <Section title="3. How we use your data">
          <p>We use your data to:</p>
          <ul>
            <li>Create and manage your account on the Platform.</li>
            <li>Display your profile, classes, and posts to other users according to your privacy settings.</li>
            <li>Process class enrollments and maintain payment records between users.</li>
            <li>Send you in-app notifications and, if authorized, push notifications to your device.</li>
            <li>Manage subscription payments through Mercado Pago.</li>
            <li>Protect the security of the Platform and detect abuse.</li>
            <li>Comply with applicable legal obligations.</li>
          </ul>
        </Section>
        <Section title="4. Third-party services">
          <p>DanzClass uses the following external service providers who may process your data:</p>
          <ul>
            <li><strong>Supabase</strong> — database, authentication, and file storage. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">supabase.com/privacy</a>.</li>
            <li><strong>Cloudinary</strong> — video compression and delivery for feed posts. <a href="https://cloudinary.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">cloudinary.com/privacy</a>.</li>
            <li><strong>Mercado Pago</strong> — subscription payment processing. <a href="https://www.mercadopago.cl/privacidad" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">mercadopago.cl/privacidad</a>.</li>
            <li><strong>Vercel</strong> — web application hosting. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">vercel.com/legal/privacy-policy</a>.</li>
            <li><strong>Expo (Notifications)</strong> — push notification service for the mobile app. Device tokens are sent to Expo servers to route notifications. <a href="https://expo.dev/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">expo.dev/privacy</a>.</li>
          </ul>
          <p>We do not sell or transfer your personal data to third parties for commercial purposes.</p>
        </Section>
        <Section title="5. AI-powered receipt scanning">
          <p>
            When you upload a bank transfer receipt (as a student), or when a teacher receives one to confirm
            a payment, the image may be analyzed by an <strong>artificial intelligence system</strong> for the
            sole purpose of extracting data that helps verify the payment: amount, operation number, date,
            issuing bank, and possible inconsistencies.
          </p>
          <ul>
            <li>
              <strong>We will never ask for your banking credentials.</strong> Neither DanzClass nor its
              scanning system will ever ask you for passwords, card numbers, security codes, or online banking
              access. If you receive a message requesting that data on behalf of DanzClass, report it
              immediately to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a>.
            </li>
            <li>We store the analysis result (extracted fields, confidence level, detected inconsistencies) tied to the corresponding payment, not a financial profile of you.</li>
            <li>The receipt image is stored in a private storage space, accessible only by the student who uploaded it, the teacher of the class, and, where applicable, the automated verification system.</li>
            <li>This data is used exclusively to verify the payment and prevent the same receipt from being reused. It is not used to build advertising profiles or shared for commercial purposes.</li>
            <li><strong>We do not use your receipt images or the data extracted from them to train artificial intelligence models</strong>, ours or third parties', unless you expressly authorize it.</li>
            <li>Unless you enable automatic payment confirmation (a centrally-controlled feature disabled by default), no payment is confirmed solely by an automated system: a teacher always reviews the result before confirming.</li>
          </ul>
          <p>
            The AI service provider will be defined and disclosed on this page before it goes into operation.
            Since that provider will act as a data processor for this information, we will sign an agreement
            with it defining scope, purpose, data types, and security obligations, including safeguards for
            international data transfers where applicable. The processing of this data is governed by Law No.
            19,628, by Law No. 21,719 (in effect from December 1, 2026), and by SERNAC's Interpretive Circular
            on artificial intelligence and consumers (Resolución Exenta No. 33 of 2022).
          </p>
        </Section>
        <Section title="6. Data retention and deletion">
          <p>We retain your data while your account is active. Specifically:</p>
          <ul>
            <li><strong>Unconfirmed accounts:</strong> automatically deleted 24 hours after creation if the email was not verified.</li>
            <li><strong>Class media files:</strong> automatically deleted by a daily cleanup process.</li>
            <li><strong>Audition videos:</strong> stored in a private bucket; deleted when the class is cancelled.</li>
            <li><strong>Chat messages:</strong> class chats are deleted 48 hours after the class ends; rehearsal chats 48 hours after the last rehearsal event.</li>
            <li><strong>Account deletion:</strong> when you delete your account, personal data is anonymized or deleted immediately. Full hard-delete occurs within a maximum of 30 days.</li>
          </ul>
          <p>The following data is <strong>retained for legal obligations</strong>: payment history (including AI scan results), confirmed enrollments, and report records.</p>
        </Section>
        <Section title="7. Privacy of your posts">
          <ul>
            <li><strong>Public:</strong> visible to any DanzClass user.</li>
            <li><strong>Followers:</strong> visible only to users who follow you.</li>
            <li><strong>Friends:</strong> visible only to your confirmed friend connections.</li>
          </ul>
        </Section>
        <Section title="8. Security">
          <p>We implement in-transit encryption (HTTPS), secure authentication, and row-level security (RLS) policies in the database. No system is completely secure; we recommend using a strong password.</p>
        </Section>
        <Section title="9. Minors">
          <p>DanzClass is intended for users aged <strong>14 and older</strong>. We do not intentionally collect data from users under 14.</p>
        </Section>
        <Section title="10. Your rights">
          <p>
            You have the right to access, rectify, delete, and object to the processing of your personal data.
            To exercise these rights, write to us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a>.
            We will respond within 30 business days.
          </p>
        </Section>
        <Section title="11. Cookies and local storage">
          <p>DanzClass uses strictly necessary session cookies to maintain your login. We do not use advertising tracking cookies. Theme preferences are stored locally on your device and are not transmitted to our servers.</p>
        </Section>
        <Section title="12. Changes to this policy">
          <p>We may update this Privacy Policy at any time. Changes will be published on this page with the updated date.</p>
        </Section>
        <Section title="13. Contact">
          <p>For privacy inquiries: <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">{CONTACT_EMAIL}</a></p>
        </Section>
      </div>
      <div className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">
          You can also review our{' '}
          <Link href="/terms?lang=en" className="text-brand-600 hover:text-brand-700">Terms of Use</Link>.
        </p>
      </div>
    </>
  )
}
