import Anthropic from '@anthropic-ai/sdk'

// Cheap/fast vision model — appropriate for structured extraction off a single
// receipt image. Bump to a Sonnet model here if accuracy ever becomes the
// bottleneck instead of cost.
const MODEL = 'claude-haiku-4-5-20251001'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
export type ReceiptMediaType = ImageMediaType | 'application/pdf'

export interface ScanExtraction {
  readable: boolean
  amount: number | null
  operation_number: string | null
  recipient_name: string | null
  recipient_rut: string | null
  bank_name: string | null
  date: string | null
  confidence: Record<string, number>
  notes: string | null
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_receipt',
  description: 'Registra los datos extraídos de un comprobante de transferencia bancaria chilena.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'true si el comprobante se puede leer con claridad' },
      amount: { type: ['number', 'null'], description: 'Monto transferido en pesos chilenos (CLP), sin puntos ni símbolo' },
      operation_number: { type: ['string', 'null'], description: 'Número de operación / folio / comprobante de la transferencia' },
      recipient_name: { type: ['string', 'null'], description: 'Nombre del destinatario/beneficiario de la transferencia' },
      recipient_rut: { type: ['string', 'null'], description: 'RUT del destinatario, si aparece' },
      bank_name: { type: ['string', 'null'], description: 'Banco destino de la transferencia' },
      date: { type: ['string', 'null'], description: 'Fecha de la transferencia, en el formato en que aparece' },
      confidence: {
        type: 'object',
        description: 'Confianza (0 a 1) por cada campo extraído (amount, operation_number, recipient_name, recipient_rut)',
        additionalProperties: { type: 'number' },
      },
      notes: { type: ['string', 'null'], description: 'Cualquier detalle que llame la atención (ej: "imagen borrosa", "posible edición")' },
    },
    required: ['readable', 'amount', 'operation_number', 'recipient_name', 'recipient_rut', 'bank_name', 'date', 'confidence'],
  },
}

const PROMPT = `Este es un comprobante de transferencia bancaria chilena (captura de pantalla de una app de banco o correo). Extrae los datos usando la herramienta "extract_receipt". Si algún campo no aparece en la imagen, usa null para ese campo — no inventes datos. El "número de operación" puede aparecer como "N° de operación", "N° de comprobante", "Folio" o similar.`

export async function scanReceipt(params: { base64: string; mediaType: ReceiptMediaType }): Promise<ScanExtraction> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const documentOrImage: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
    params.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: params.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: params.mediaType, data: params.base64 } }

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_receipt' },
    messages: [
      {
        role: 'user',
        content: [documentOrImage, { type: 'text', text: PROMPT }],
      },
    ],
  })

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
  if (!toolUse) throw new Error('Model did not return a tool_use block')

  const input = toolUse.input as Record<string, unknown>
  return {
    readable: Boolean(input.readable),
    amount: typeof input.amount === 'number' ? input.amount : null,
    operation_number: typeof input.operation_number === 'string' ? input.operation_number : null,
    recipient_name: typeof input.recipient_name === 'string' ? input.recipient_name : null,
    recipient_rut: typeof input.recipient_rut === 'string' ? input.recipient_rut : null,
    bank_name: typeof input.bank_name === 'string' ? input.bank_name : null,
    date: typeof input.date === 'string' ? input.date : null,
    confidence: (input.confidence as Record<string, number>) ?? {},
    notes: typeof input.notes === 'string' ? input.notes : null,
  }
}
