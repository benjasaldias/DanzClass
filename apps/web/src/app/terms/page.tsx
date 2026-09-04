import Link from 'next/link'
import LogoIcon from '@/components/ui/LogoIcon'

export const metadata = {
  title: 'Terms of Use / Términos de Uso — DanzClass',
  description: 'Terms and conditions of use for the DanzClass platform',
}

const LAST_UPDATED_ES = '28 de julio de 2026'
const LAST_UPDATED_EN = 'July 28, 2026'
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
        <Section title="6. Pagos, comisiones y reembolsos">
          <p>
            Una clase puede pagarse por <strong>dos vías</strong>: Mercado Pago o transferencia bancaria directa.{' '}
            <strong>El profesor decide, para cada clase, cuáles vías acepta</strong> (una o ambas); el estudiante
            solo ve y puede usar las vías que el profesor habilitó para esa clase en particular.
          </p>
          <ul>
            <li>
              <strong>(a) Pago in-app con Mercado Pago.</strong> El estudiante paga el monto a través de
              Mercado Pago y el pago se divide <strong>en el origen</strong> (modelo de marketplace o
              &ldquo;split&rdquo;): el profesor recibe el precio de su clase directamente en su propia cuenta de
              Mercado Pago —que él mismo conecta a la Plataforma— y DanzClass retiene únicamente su comisión de
              servicio, cuando corresponde (ver más abajo). <strong>DanzClass no custodia, retiene ni administra
              los fondos del profesor:</strong> es Mercado Pago quien liquida a cada parte de forma directa. El
              procesamiento del pago lo realiza Mercado Pago como proveedor de servicios de pago; DanzClass no es
              una institución financiera ni un medio de pago.
            </li>
            <li>
              <strong>(b) Transferencia bancaria directa al profesor.</strong> Disponible cuando el profesor la
              habilita para la clase. DanzClass actúa solo como intermediario de comunicación y los fondos van
              directamente del estudiante al profesor a través de sus bancos.
            </li>
          </ul>
          <p>
            <strong>El profesor recibe siempre el 100% del precio que fijó para su clase</strong>, sin importar
            la vía de pago ni el plan del estudiante. Ningún costo de procesamiento ni comisión se descuenta de
            su parte.
          </p>
          <p>
            <strong>Costos que puede pagar el estudiante, siempre desglosados por separado antes de pagar:</strong>
          </p>
          <ul>
            <li>
              <strong>Costo de procesamiento de Mercado Pago.</strong> Al pagar por esa vía, el monto que ves
              incluye la tasa que Mercado Pago cobra por transacción. Este costo lo aplica Mercado Pago, no
              DanzClass, y se cobra a <strong>cualquier estudiante</strong> que use esa vía, tenga o no un plan
              activo — es lo que permite que el profesor reciba el 100% de su precio pese a que Mercado Pago
              descuenta su tasa del monto total transado. Se calcula con la tarifa de{' '}
              <strong>disponibilidad inmediata</strong> de Mercado Pago (la más alta de sus tramos), porque Mercado
              Pago no informa qué plazo de liberación tiene configurada cada cuenta. Si la cuenta del profesor
              tiene una tarifa menor, la diferencia —del orden de decenas de pesos por pago— la retiene DanzClass y
              queda registrada en su contabilidad; en ningún caso se descuenta del profesor ni del estudiante más
              allá de lo aquí informado.
            </li>
            <li>
              <strong>Comisión de servicio de DanzClass.</strong> Equivalente al <strong>2% del precio de la
              clase, con un tope de $700 CLP por pago</strong>. Se cobra a <strong>cualquier estudiante</strong>{' '}
              que pague por Mercado Pago. Es la remuneración de DanzClass por el servicio de la Plataforma.
            </li>
          </ul>
          <p>
            <strong>Por transferencia bancaria no existe ningún cargo adicional para ningún estudiante</strong>:
            el monto que se transfiere es exactamente el precio fijado por el profesor.
          </p>
          <p>
            <strong>Planes de suscripción.</strong> Durante el período de lanzamiento, DanzClass entrega todas las
            funcionalidades de la Plataforma <strong>sin costo</strong> y no comercializa planes de suscripción. Si
            en el futuro se reactiva el cobro de planes, se informará previamente a los usuarios y estos Términos
            se actualizarán en consecuencia.
          </p>
          <p>
            <strong>Impuestos.</strong> Dado que el pago in-app se divide en el origen, el profesor recibe y es el
            único responsable de declarar y tributar por los ingresos de sus clases; los ingresos de DanzClass se
            limitan a su comisión de servicio y, cuando corresponda, a la diferencia entre el costo de
            procesamiento estimado y el efectivamente cobrado por Mercado Pago, descrita más arriba (el resto del
            costo de procesamiento se traslada íntegro a Mercado Pago). Cada usuario es responsable del
            cumplimiento de sus propias obligaciones tributarias ante el Servicio de Impuestos Internos.
          </p>
          <p>
            <strong>Responsabilidad del profesor.</strong> El profesor que recibe pagos in-app es responsable de
            conectar una cuenta de Mercado Pago válida y a su nombre, y de la veracidad de sus datos. DanzClass no
            responde por conflictos entre el profesor y Mercado Pago. Las suscripciones a los planes de la
            Plataforma se procesan a través de Mercado Pago.
          </p>
          <p>
            <strong>Política de reembolsos:</strong> si un profesor cancela una clase con pago confirmado, tienes
            derecho a solicitar el reembolso. En pagos in-app, el reembolso se gestiona a través de los mecanismos
            de Mercado Pago y del profesor; en transferencias directas, directamente con el profesor. DanzClass no
            intermedia ni garantiza dichos reembolsos y actualmente su gestión es manual. Para suscripciones
            canceladas no se realizan reembolsos proporcionales; el acceso se mantiene hasta el fin del período
            pagado.
          </p>
          <p>
            <strong>Efecto de un reembolso o contracargo sobre el acceso.</strong> Si Mercado Pago reembolsa o
            contracarga un pago in-app ya confirmado, la inscripción deja de estar pagada: vuelve a estado
            pendiente de pago y se revoca el código QR de asistencia asociado. En un entrenamiento con cobro
            mensual, el mes reembolsado vuelve a contarse como deuda. Tanto el estudiante como el profesor reciben
            aviso de la reversión.
          </p>
        </Section>
        <Section title="7. Escaneo automatizado de comprobantes de pago (IA)">
          <p>
            Para agilizar la verificación de pagos, DanzClass ofrece un sistema de{' '}
            <strong>escaneo automatizado mediante inteligencia artificial</strong> que analiza los comprobantes
            de transferencia bancaria subidos a la Plataforma (monto, número de operación, fecha y banco emisor)
            y entrega una recomendación al profesor.
          </p>
          <ul>
            <li>
              El escaneo es una <strong>herramienta de apoyo</strong>, no un medio de pago ni un servicio
              financiero regulado. DanzClass no procesa, custodia ni transfiere fondos: las transferencias
              ocurren directamente entre el estudiante y el profesor a través de sus propios bancos.
            </li>
            <li>Cada profesor puede elegir si sus pagos se revisan con IA o de forma manual, desde la configuración de su cuenta.</li>
            <li>
              <strong>La confirmación automática de pagos está desactivada de forma predeterminada.</strong>{' '}
              Mientras esté desactivada, un profesor siempre revisa el resultado del escaneo antes de confirmar
              un pago; el sistema automatizado solo sugiere.
            </li>
            <li>El sistema puede cometer errores. DanzClass realiza revisiones periódicas de su desempeño, pero no garantiza que el escaneo sea exacto en el 100% de los casos.</li>
            <li>Para detectar comprobantes reutilizados, guardamos el número de operación de cada transferencia y lo comparamos contra pagos anteriores dirigidos al mismo profesor.</li>
          </ul>
          <p>
            <strong>Eres responsable de la veracidad de los comprobantes que subes</strong> y de la exactitud de
            los datos bancarios que publicas como profesor. Subir un comprobante adulterado o falso constituye
            una infracción grave a estos Términos y puede configurar delitos contemplados en el Código Penal
            chileno (por ejemplo, estafa o falsificación de instrumento privado), sin perjuicio de las acciones
            civiles o penales que el afectado pueda ejercer.
          </p>
          <p>
            El tratamiento de los datos personales y bancarios contenidos en los comprobantes se rige por
            nuestra{' '}
            <Link href="/privacy" className="text-brand-600 hover:text-brand-700">
              Política de Privacidad
            </Link>{' '}
            y por la Ley N° 19.628 sobre Protección de la Vida Privada. A partir del 1 de diciembre de 2026
            entrará en vigencia la Ley N° 21.719, que reforma la Ley 19.628 y reconoce expresamente el derecho
            a no ser sometido a decisiones basadas únicamente en tratamiento automatizado que te afecten
            significativamente, con derecho a intervención humana, explicación y revisión — un estándar que ya
            aplicamos hoy: mientras la confirmación automática esté desactivada (ver arriba), un profesor
            siempre revisa el resultado del escaneo antes de confirmar tu pago. Adicionalmente, el uso de
            sistemas de inteligencia artificial en relaciones de consumo en Chile está sujeto a la Circular
            Interpretativa de SERNAC (Resolución Exenta N° 33 de 2022), que exige transparencia sobre el
            funcionamiento del sistema, estándares adecuados de precisión y fiabilidad con evaluación continua
            de riesgo, y no discriminación algorítmica. Dado que la confirmación de un pago afecta tu acceso a
            un servicio, este proceso también se enmarca dentro de la Ley N° 19.496 sobre Protección de los
            Derechos de los Consumidores.
          </p>
        </Section>
        <Section title="8. Eventos publicados en la Plataforma">
          <p>
            Los organizadores de eventos (batallas, masterclasses u otros) son los únicos responsables del
            contenido, logística y condiciones de sus eventos. DanzClass actúa como canal de difusión y no
            garantiza la realización del evento ni la calidad del mismo. Los pagos de entrada se gestionan
            directamente con el organizador.
          </p>
        </Section>
        <Section title="9. Limitación de responsabilidad">
          <p>En la máxima medida permitida por la ley, DanzClass no será responsable por:</p>
          <ul>
            <li>Daños derivados del contenido publicado por los usuarios</li>
            <li>Disputas entre usuarios relativas a pagos, clases o acuerdos privados</li>
            <li>Pérdida de datos o interrupción del servicio por causas fuera de nuestro control</li>
            <li>Infracciones de derechos de autor cometidas por los usuarios</li>
          </ul>
        </Section>
        <Section title="10. Suspensión y eliminación de cuentas">
          <p>
            DanzClass se reserva el derecho de suspender o eliminar, sin previo aviso, cualquier cuenta que
            infrinja estos términos, publique contenido ilegal o cause daño a otros usuarios o a la Plataforma.
          </p>
        </Section>
        <Section title="11. Modificaciones a los términos">
          <p>
            Podemos actualizar estos Términos de Uso en cualquier momento. Los cambios se publicarán en esta
            página con la fecha de actualización.
          </p>
        </Section>
        <Section title="12. Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia será
            sometida a los tribunales competentes de la ciudad de Santiago, Chile.
          </p>
        </Section>
        <Section title="13. Contacto">
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
        <Section title="6. Payments, commissions, and refunds">
          <p>
            A class can be paid through <strong>two channels</strong>: Mercado Pago or a direct bank transfer.{' '}
            <strong>The teacher decides, for each class, which channels to accept</strong> (one or both); the
            student only sees and can use the channels the teacher enabled for that particular class.
          </p>
          <ul>
            <li>
              <strong>(a) In-app payment with Mercado Pago.</strong> The student pays through Mercado Pago and
              the payment is split <strong>at the source</strong> (marketplace / &ldquo;split&rdquo; model): the
              teacher receives the class price directly into their own Mercado Pago account —which they connect to
              the Platform themselves— and DanzClass retains only its service commission, when applicable (see
              below). <strong>DanzClass does not hold, custody, or manage the teacher&rsquo;s funds:</strong>
              Mercado Pago settles each party directly. Payment processing is performed by Mercado Pago as a
              payment service provider; DanzClass is not a financial institution nor a payment method.
            </li>
            <li>
              <strong>(b) Direct bank transfer to the teacher.</strong> Available when the teacher enables it for
              the class. DanzClass acts only as a communication intermediary and funds go directly from the
              student to the teacher through their banks.
            </li>
          </ul>
          <p>
            <strong>The teacher always receives 100% of the price they set for their class</strong>, regardless
            of payment channel or the student&rsquo;s plan. No processing cost or commission is ever deducted
            from their share.
          </p>
          <p>
            <strong>Costs a student may pay, always itemized separately before paying:</strong>
          </p>
          <ul>
            <li>
              <strong>Mercado Pago processing cost.</strong> When paying through that channel, the amount shown
              includes the fee Mercado Pago charges per transaction. This cost is applied by Mercado Pago, not
              DanzClass, and is charged to <strong>any student</strong> using that channel, with or without an
              active plan — it is what allows the teacher to receive 100% of their price even though Mercado
              Pago deducts its fee from the total amount transacted. It is calculated using Mercado Pago&rsquo;s{' '}
              <strong>immediate-availability</strong> rate (the highest of its tiers), because Mercado Pago does
              not disclose the release schedule configured on each account. If the teacher&rsquo;s account has a
              lower rate, the difference — in the order of tens of pesos per payment — is retained by DanzClass and
              recorded in its accounting; it is never deducted from the teacher, nor charged to the student beyond
              what is disclosed here.
            </li>
            <li>
              <strong>DanzClass service commission.</strong> Equivalent to <strong>2% of the class price, capped
              at CLP $700 per payment</strong>. Charged to <strong>any student</strong> paying via Mercado Pago.
              This is DanzClass&rsquo;s remuneration for the Platform service.
            </li>
          </ul>
          <p>
            <strong>Direct bank transfer carries no additional charge for any student</strong>: the amount
            transferred is exactly the price set by the teacher.
          </p>
          <p>
            <strong>Subscription plans.</strong> During the launch period, DanzClass provides all Platform
            features <strong>free of charge</strong> and does not sell subscription plans. If paid plans are
            reintroduced, users will be notified in advance and these Terms will be updated accordingly.
          </p>
          <p>
            <strong>Taxes.</strong> Because the in-app payment is split at the source, the teacher receives and is
            solely responsible for declaring and paying taxes on their class income; DanzClass&rsquo;s income is
            limited to its service commission and, where applicable, to the difference between the estimated
            processing cost and the one actually charged by Mercado Pago described above (the remainder of the
            processing cost passes through entirely to Mercado Pago). Each user is responsible for their own tax
            obligations.
          </p>
          <p>
            <strong>Refund policy:</strong> if a teacher cancels a class with a confirmed payment, you may request
            a refund. For in-app payments, refunds are handled through Mercado Pago&rsquo;s mechanisms and the
            teacher; for direct transfers, directly with the teacher. DanzClass does not mediate or guarantee such
            refunds and currently handles them manually. Cancelled subscriptions are not proportionally refunded;
            access is maintained until the end of the paid period.
          </p>
          <p>
            <strong>Effect of a refund or chargeback on access.</strong> If Mercado Pago refunds or charges back an
            already-confirmed in-app payment, the enrollment stops being paid: it returns to pending-payment status
            and the associated attendance QR code is revoked. In a training program with monthly billing, the
            refunded month counts as debt again. Both the student and the teacher are notified of the reversal.
          </p>
        </Section>
        <Section title="7. Automated AI receipt scanning">
          <p>
            To speed up payment verification, DanzClass offers an{' '}
            <strong>automated scanning system powered by artificial intelligence</strong> that analyzes bank
            transfer receipts uploaded to the Platform (amount, operation number, date, and issuing bank) and
            provides a recommendation to the teacher.
          </p>
          <ul>
            <li>
              The scan is a <strong>support tool</strong>, not a payment method or a regulated financial
              service. DanzClass does not process, hold, or transfer funds: transfers occur directly between
              the student and the teacher through their own banks.
            </li>
            <li>Each teacher can choose whether their payments are reviewed by AI or manually, from their account settings.</li>
            <li>
              <strong>Automatic payment confirmation is disabled by default.</strong> While disabled, a teacher
              always reviews the scan result before confirming a payment; the automated system only suggests.
            </li>
            <li>The system can make mistakes. DanzClass periodically reviews its performance, but does not guarantee the scan will be accurate 100% of the time.</li>
            <li>To detect reused receipts, we store the operation number of each transfer and compare it against previous payments made to the same teacher.</li>
          </ul>
          <p>
            <strong>You are responsible for the accuracy of the receipts you upload</strong> and for the
            accuracy of the bank details you publish as a teacher. Uploading a falsified or altered receipt is
            a serious violation of these Terms and may constitute an offense under Chilean criminal law (e.g.,
            fraud or falsification of a private instrument), without prejudice to any civil or criminal action
            the affected party may pursue.
          </p>
          <p>
            The processing of personal and banking data contained in receipts is governed by our{' '}
            <Link href="/privacy?lang=en" className="text-brand-600 hover:text-brand-700">
              Privacy Policy
            </Link>{' '}
            and by Chilean Law No. 19,628 on the Protection of Private Life. Starting December 1, 2026, Law No.
            21,719 will take effect, reforming Law 19,628 and expressly recognizing the right not to be subject
            to decisions based solely on automated processing that significantly affect you, with a right to
            human intervention, explanation, and review — a standard we already apply today: while automatic
            confirmation is disabled (see above), a teacher always reviews the scan result before confirming
            your payment. Additionally, the use of AI systems in consumer relations in Chile is subject to
            SERNAC's Interpretive Circular (Resolución Exenta No. 33 of 2022), which requires transparency
            about how the system works, adequate accuracy and reliability standards with ongoing risk
            assessment, and non-discrimination. Because payment confirmation affects your access to a service,
            this process also falls within the scope of Law No. 19,496 on Consumer Rights Protection.
          </p>
        </Section>
        <Section title="8. Events published on the Platform">
          <p>
            Event organizers (battles, masterclasses, or other events) are solely responsible for the content,
            logistics, and conditions of their events. DanzClass acts as a distribution channel and does not
            guarantee that the event will take place or its quality. Entry payments are managed directly with
            the organizer.
          </p>
        </Section>
        <Section title="9. Limitation of liability">
          <p>To the maximum extent permitted by law, DanzClass shall not be liable for:</p>
          <ul>
            <li>Damages arising from content published by users</li>
            <li>Disputes between users regarding payments, classes, or private agreements</li>
            <li>Loss of data or service interruptions caused by factors beyond our control</li>
            <li>Copyright infringements committed by users</li>
          </ul>
        </Section>
        <Section title="10. Account suspension and deletion">
          <p>
            DanzClass reserves the right to suspend or delete, without notice, any account that violates these
            terms, publishes illegal content, or causes harm to other users or the Platform.
          </p>
        </Section>
        <Section title="11. Amendments to these terms">
          <p>
            We may update these Terms of Use at any time. Changes will be published on this page with the
            updated date. Continued use of the Platform after changes are published constitutes your
            acceptance of the new terms.
          </p>
        </Section>
        <Section title="12. Governing law and jurisdiction">
          <p>
            These terms are governed by the laws of the Republic of Chile. Any disputes arising from their
            interpretation or enforcement shall be submitted to the competent courts of Santiago, Chile.
          </p>
        </Section>
        <Section title="13. Contact">
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
