import Link from 'next/link'
import { Music2 } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidad — DanzClass',
  description: 'Política de privacidad y tratamiento de datos personales de DanzClass',
}

const LAST_UPDATED = '21 de mayo de 2026'
const CONTACT_EMAIL = 'contacto@danzclass.com'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Music2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">DanzClass</span>
          </Link>
          <Link href="/auth/register" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            Crear cuenta
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED}</p>

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
              <li>
                <strong>Datos de cuenta:</strong> nombre, apellido, nombre de usuario, dirección de correo
                electrónico, contraseña (almacenada de forma encriptada), ciudad y foto de perfil.
              </li>
              <li>
                <strong>Datos de actividad:</strong> clases publicadas o en las que te inscribes, publicaciones
                de video, seguimientos, amistades y valoraciones de confianza (endorsements).
              </li>
              <li>
                <strong>Datos de pago:</strong> comprobantes de transferencia bancaria que subes como imagen,
                y los datos de tu cuenta bancaria (banco, tipo de cuenta, número de cuenta, RUT, titular)
                si eres profesor y los ingresas para recibir pagos. DanzClass no almacena datos de tarjetas de
                crédito; los pagos de suscripción son procesados por Mercado Pago.
              </li>
              <li>
                <strong>Contenido multimedia:</strong> fotos y videos de clases que publicas, videos de
                postulación a entrenamientos (audiciones) y el video de tu perfil público.
              </li>
              <li>
                <strong>Datos técnicos:</strong> registros de acceso, dirección IP y datos del dispositivo,
                recopilados automáticamente por los servicios de infraestructura que usamos.
              </li>
            </ul>
          </Section>

          <Section title="3. Cómo usamos tus datos">
            <p>Usamos tus datos para:</p>
            <ul>
              <li>Crear y gestionar tu cuenta en la Plataforma.</li>
              <li>Mostrar tu perfil, clases y publicaciones a otros usuarios según tu configuración de privacidad.</li>
              <li>Procesar inscripciones a clases y llevar el registro de pagos entre usuarios.</li>
              <li>Enviarte notificaciones dentro de la app sobre actividad relevante (nuevas clases, pagos, amistades, etc.).</li>
              <li>Gestionar suscripciones de pago a través de Mercado Pago.</li>
              <li>Proteger la seguridad de la Plataforma y detectar usos abusivos.</li>
              <li>Cumplir con obligaciones legales aplicables.</li>
            </ul>
          </Section>

          <Section title="4. Servicios de terceros">
            <p>
              DanzClass utiliza los siguientes proveedores de servicios externos que pueden procesar tus datos:
            </p>
            <ul>
              <li>
                <strong>Supabase</strong> — base de datos, autenticación y almacenamiento de archivos.
                Alojado en servidores en la nube (AWS). Más información:{' '}
                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">
                  supabase.com/privacy
                </a>.
              </li>
              <li>
                <strong>Cloudinary</strong> — compresión y entrega de videos publicados en el feed.
                Solo se usa si está configurado; si no, los videos se almacenan en Supabase Storage.
                Más información:{' '}
                <a href="https://cloudinary.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">
                  cloudinary.com/privacy
                </a>.
              </li>
              <li>
                <strong>Mercado Pago</strong> — procesamiento de pagos de suscripciones. Los datos de
                tu medio de pago son manejados exclusivamente por Mercado Pago. Más información:{' '}
                <a href="https://www.mercadopago.cl/privacidad" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">
                  mercadopago.cl/privacidad
                </a>.
              </li>
              <li>
                <strong>Vercel</strong> — alojamiento de la aplicación web. Registra logs técnicos de
                acceso. Más información:{' '}
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">
                  vercel.com/legal/privacy-policy
                </a>.
              </li>
            </ul>
            <p>
              No vendemos ni cedemos tus datos personales a terceros con fines comerciales.
            </p>
          </Section>

          <Section title="5. Retención y eliminación de datos">
            <p>Conservamos tus datos mientras tu cuenta esté activa. Específicamente:</p>
            <ul>
              <li>
                <strong>Cuentas no confirmadas:</strong> las cuentas creadas pero cuyo correo electrónico
                no fue verificado en un plazo de 24 horas son eliminadas automáticamente, incluyendo todos
                sus datos.
              </li>
              <li>
                <strong>Archivos multimedia de clases:</strong> las fotos y videos asociados a clases
                vencidas son eliminados automáticamente mediante un proceso diario de limpieza
                (aproximadamente 7 días después del vencimiento de la clase para clases sueltas;
                a fin de mes para clases periódicas).
              </li>
              <li>
                <strong>Videos de audición:</strong> almacenados en un bucket privado; solo accesibles
                por el postulante y el profesor de la clase. Se eliminan junto con la clase si esta es
                cancelada.
              </li>
              <li>
                <strong>Cierre de cuenta:</strong> al eliminar tu cuenta, tus datos personales son
                eliminados de la base de datos, salvo aquellos que debamos conservar por obligaciones
                legales o para resolver disputas pendientes.
              </li>
            </ul>
          </Section>

          <Section title="6. Privacidad de tus publicaciones">
            <p>
              Puedes controlar quién ve tus publicaciones de video mediante la opción de visibilidad:
            </p>
            <ul>
              <li><strong>Público:</strong> visible para cualquier usuario de DanzClass.</li>
              <li><strong>Seguidores:</strong> visible solo para los usuarios que te siguen.</li>
              <li><strong>Amigos:</strong> visible solo para tus conexiones confirmadas como amigos.</li>
            </ul>
            <p>
              Puedes también configurar si tus clases inscritas son visibles para otros usuarios en la
              configuración de tu perfil.
            </p>
          </Section>

          <Section title="7. Seguridad">
            <p>
              Implementamos medidas técnicas y organizativas razonables para proteger tus datos, incluyendo
              cifrado en tránsito (HTTPS), autenticación segura y políticas de acceso por filas (RLS) en la
              base de datos. No obstante, ningún sistema es completamente seguro; te recomendamos usar
              una contraseña robusta y no compartirla.
            </p>
          </Section>

          <Section title="8. Menores de edad">
            <p>
              DanzClass está dirigido a personas de <strong>14 años o más</strong>. No recopilamos
              intencionalmente datos de menores de 14 años. Si eres padre o tutor y tienes conocimiento de
              que un menor registró una cuenta, contáctanos para proceder a su eliminación.
            </p>
          </Section>

          <Section title="9. Tus derechos">
            <p>
              De acuerdo con la Ley N° 19.628 sobre Protección de la Vida Privada de Chile, tienes derecho a:
            </p>
            <ul>
              <li><strong>Acceso:</strong> solicitar información sobre los datos personales que almacenamos sobre ti.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
              <li><strong>Cancelación:</strong> solicitar la eliminación de tus datos cuando ya no sean necesarios para la finalidad con que fueron recopilados.</li>
              <li><strong>Oposición:</strong> oponerte al tratamiento de tus datos en determinadas circunstancias.</li>
            </ul>
            <p>
              Para ejercer cualquiera de estos derechos, escríbenos a{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700 font-medium">
                {CONTACT_EMAIL}
              </a>{' '}
              indicando tu solicitud. Responderemos en un plazo máximo de 30 días hábiles.
            </p>
          </Section>

          <Section title="10. Cookies y almacenamiento local">
            <p>
              DanzClass usa cookies de sesión estrictamente necesarias para mantener tu inicio de sesión
              activo. No usamos cookies de seguimiento publicitario ni de terceros con fines de marketing.
              La preferencia de tema visual (claro/oscuro) se almacena localmente en tu dispositivo
              (localStorage) y no se transmite a nuestros servidores.
            </p>
          </Section>

          <Section title="11. Cambios a esta política">
            <p>
              Podemos actualizar esta Política de Privacidad en cualquier momento. Los cambios se publicarán
              en esta página con la fecha de actualización. Te notificaremos de cambios significativos a
              través de la app. El uso continuado de la Plataforma tras la publicación de cambios constituye
              tu aceptación de la nueva política.
            </p>
          </Section>

          <Section title="12. Contacto">
            <p>
              Para consultas sobre privacidad, solicitudes de derechos ARCO o cualquier duda relacionada
              con el tratamiento de tus datos personales, contáctanos en:{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            También puedes revisar nuestros{' '}
            <Link href="/terms" className="text-brand-600 hover:text-brand-700">
              Términos de Uso
            </Link>
            .
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
