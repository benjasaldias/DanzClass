import { createHash } from 'crypto'
import { logger } from './logger'

// Borrado server-side de assets en Cloudinary (item 10). La subida es unsigned
// (preset público desde el cliente), pero BORRAR exige firma con el API secret,
// que solo vive en el servidor. Sin `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`
// configurados, estas funciones no-opean con un warning (no rompen el borrado
// del registro en la DB — solo dejan el asset huérfano en Cloudinary).
//
// Env requeridas para que el borrado sea efectivo:
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (ya existe, se usa también en la subida)
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

type ResourceType = 'image' | 'video' | 'raw'

interface CloudinaryRef {
  publicId: string
  resourceType: ResourceType
}

// Extrae { publicId, resourceType } de una secure_url de Cloudinary. Devuelve
// null si la URL no es de Cloudinary (p.ej. un objeto de Supabase Storage), así
// el llamador puede pasar URLs mezcladas sin filtrar.
export function extractCloudinaryRef(url: string | null | undefined): CloudinaryRef | null {
  if (!url || !url.includes('res.cloudinary.com')) return null
  // .../<cloud>/<resourceType>/upload/(<transforms>/)?(v<version>/)?<folder/id>.<ext>
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(.+)$/)
  if (!m) return null
  const resourceType = m[1] as ResourceType
  let rest = m[2]
  const segments = rest.split('/')
  // Descartar segmentos de transformación (contienen ',' o '=') y el de versión (v123)
  while (segments.length > 1 && (/[,=]/.test(segments[0]) || /^v\d+$/.test(segments[0]))) {
    segments.shift()
  }
  let path = segments.join('/')
  // Quitar la extensión del último segmento
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  if (dot > slash) path = path.slice(0, dot)
  if (!path) return null
  return { publicId: path, resourceType }
}

async function destroy(ref: CloudinaryRef): Promise<boolean> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn('cloudinary-delete:not-configured', { publicId: ref.publicId })
    return false
  }

  const timestamp = Math.floor(Date.now() / 1000)
  // Firma: SHA-1 de los params (orden alfabético) + api_secret.
  const toSign = `invalidate=true&public_id=${ref.publicId}&timestamp=${timestamp}${apiSecret}`
  const signature = createHash('sha1').update(toSign).digest('hex')

  const body = new URLSearchParams({
    public_id: ref.publicId,
    timestamp: String(timestamp),
    invalidate: 'true',
    api_key: apiKey,
    signature,
  })

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${ref.resourceType}/destroy`,
      { method: 'POST', body, signal: AbortSignal.timeout(10000) }
    )
    const json = await res.json().catch(() => ({}))
    // result: 'ok' | 'not found'. 'not found' es benigno (ya no existe).
    if ((json as any)?.result === 'ok' || (json as any)?.result === 'not found') return true
    logger.error('cloudinary-delete:failed', { publicId: ref.publicId, result: (json as any)?.result })
    return false
  } catch (err) {
    logger.error('cloudinary-delete:error', err, { publicId: ref.publicId })
    return false
  }
}

// Borra en Cloudinary todos los assets referenciados por las URLs dadas. Ignora
// URLs que no sean de Cloudinary. Best-effort: nunca lanza.
export async function deleteCloudinaryAssets(urls: (string | null | undefined)[]): Promise<number> {
  let deleted = 0
  for (const url of urls) {
    const ref = extractCloudinaryRef(url)
    if (!ref) continue
    const ok = await destroy(ref)
    if (ok) deleted++
  }
  return deleted
}
