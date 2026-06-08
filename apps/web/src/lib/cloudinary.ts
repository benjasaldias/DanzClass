export interface CloudinaryUploadResult {
  secure_url: string
  public_id: string
  duration?: number
  width?: number
  height?: number
  format?: string
}

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  )
}

export async function uploadToCloudinary(
  file: File,
  resourceType: 'video' | 'image' = 'video',
  folder?: string
): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary no está configurado. Revisa las variables de entorno.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  formData.append('eager_async', 'true')
  if (folder) formData.append('folder', folder)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message ?? 'Error al subir a Cloudinary')
  }

  return res.json()
}
