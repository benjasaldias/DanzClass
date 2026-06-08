export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  )
}

export async function uploadVideoToCloudinary(uri: string, folder?: string): Promise<string> {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME!
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET!

  const formData = new FormData()
  formData.append('file', { uri, type: 'video/mp4', name: 'video.mp4' } as any)
  formData.append('upload_preset', uploadPreset)
  if (folder) formData.append('folder', folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    { method: 'POST', body: formData }
  )
  const result = await response.json()
  if (!result.secure_url) throw new Error(result.error?.message ?? 'Cloudinary upload failed')
  return result.secure_url
}
