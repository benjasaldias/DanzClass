import { test, expect } from '@playwright/test'
import {
  detectReceiptType,
  isPdfReceipt,
  RECEIPT_MAGIC_BYTES,
  RECEIPT_ALLOWED_MIME,
} from '../../packages/shared/src/lib/receipts'

// D-4: el tipo de un comprobante sale de sus bytes, nunca del nombre del
// archivo. Estas pruebas fijan esa correspondencia porque de ella dependen la
// extensión y el content-type con que se guarda el objeto en Storage.

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

/** Cabecera de N bytes que empieza por `head` y rellena el resto con ceros. */
function header(head: number[], length = RECEIPT_MAGIC_BYTES): Uint8Array {
  const out = new Uint8Array(length)
  out.set(head)
  return out
}

test.describe('detectReceiptType', () => {
  test('reconoce JPEG', () => {
    expect(detectReceiptType(header([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
  })

  test('reconoce PNG', () => {
    expect(detectReceiptType(header([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      ext: 'png',
      mime: 'image/png',
    })
  })

  test('reconoce PDF', () => {
    expect(detectReceiptType(header([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toEqual({
      ext: 'pdf',
      mime: 'application/pdf',
    })
  })

  test('reconoce WEBP (RIFF + tag WEBP en el byte 8)', () => {
    const head = header([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    expect(detectReceiptType(head)).toEqual({ ext: 'webp', mime: 'image/webp' })
  })

  test('un RIFF que NO es WEBP (WAV) se rechaza', () => {
    // La validación anterior miraba solo los 4 primeros bytes, así que un WAV o
    // un AVI pasaban como si fueran comprobantes.
    const wav = header([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])
    expect(detectReceiptType(wav)).toBeNull()
  })

  test('rechaza un SVG (el caso concreto de D-4)', () => {
    // '<svg' — un PNG renombrado a .svg sí se detecta como PNG y se guarda como
    // .png; un SVG de verdad no pasa la validación en absoluto.
    expect(detectReceiptType(header([0x3c, 0x73, 0x76, 0x67]))).toBeNull()
  })

  test('rechaza HEIC (iPhone): ni el navegador ni el escaneo IA pueden leerlo', () => {
    const heic = header([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
    expect(detectReceiptType(heic)).toBeNull()
  })

  test('un archivo más corto que la cabecera no lanza', () => {
    expect(detectReceiptType(bytes(0xff))).toBeNull()
    expect(detectReceiptType(bytes())).toBeNull()
  })

  test('todo tipo detectado tiene un MIME de la allow-list', () => {
    const heads = [
      [0xff, 0xd8, 0xff],
      [0x89, 0x50, 0x4e, 0x47],
      [0x25, 0x50, 0x44, 0x46],
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    ]
    for (const h of heads) {
      const detected = detectReceiptType(header(h))
      expect(detected).not.toBeNull()
      expect(RECEIPT_ALLOWED_MIME).toContain(detected!.mime)
    }
  })
})

test.describe('isPdfReceipt', () => {
  test('detecta el PDF por extensión, tolerando query string', () => {
    expect(isPdfReceipt('abc/def.pdf')).toBe(true)
    expect(isPdfReceipt('abc/def.PDF?token=x')).toBe(true)
    expect(isPdfReceipt('abc/def.jpg')).toBe(false)
    expect(isPdfReceipt(null)).toBe(false)
    expect(isPdfReceipt(undefined)).toBe(false)
  })
})
