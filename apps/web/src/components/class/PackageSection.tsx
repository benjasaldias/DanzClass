'use client'

import { useState, useRef } from 'react'
import { Package, ChevronDown, ChevronUp, CheckCircle2, Clock, Upload, X } from 'lucide-react'
import { cn, formatCLP } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type PackageSectionProps = {
  classPackages: any[]
  myPackageEnrollments: any[]
  currentUserId: string | null
  isTeacher: boolean
  canEnrollUser: boolean
}

function PackageStatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" /> Pago confirmado
    </span>
  )
  if (status === 'payment_submitted') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 px-2.5 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400">
      <Clock className="h-3 w-3" /> Comprobante enviado
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-dark-text2">
      Pago pendiente
    </span>
  )
}

function PackageCard({ pkg, myEnrollment, currentUserId, canEnrollUser }: {
  pkg: any; myEnrollment: any; currentUserId: string | null; canEnrollUser: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [enrolled, setEnrolled] = useState<any>(myEnrollment)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleEnroll() {
    if (!currentUserId || loading) return
    setLoading(true)
    const res = await fetch(`/api/packages/${pkg.id}/enroll`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setEnrolled({ id: data.package_enrollment_id, status: 'pending_payment', package_id: pkg.id })
    } else if (data.error === 'already_enrolled') {
      setEnrolled({ id: data.package_enrollment_id, status: 'pending_payment', package_id: pkg.id })
    } else {
      alert('Error al inscribirse. Intenta de nuevo.')
    }
    setLoading(false)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    // Validate magic bytes
    const buffer = await selected.slice(0, 4).arrayBuffer()
    const bytes = Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
    const valid = bytes.startsWith('ffd8') || bytes.startsWith('89504e47') || bytes.startsWith('25504446') || bytes.startsWith('52494646')
    if (!valid || !['image/jpeg', 'image/png', 'application/pdf', 'image/webp'].includes(selected.type)) {
      alert('Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.')
      return
    }
    setFile(selected)
  }

  async function handleSubmitPayment() {
    if (!file || !enrolled || uploading) return
    setUploading(true)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `pkg_${enrolled.id}_${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, file, { upsert: true })
    if (uploadErr) {
      alert('Error al subir comprobante.')
      setUploading(false)
      return
    }

    const res = await fetch(`/api/packages/${pkg.id}/submit-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_enrollment_id: enrolled.id, receipt_path: path }),
    })

    if (res.ok) {
      setEnrolled((prev: any) => ({ ...prev, status: 'payment_submitted' }))
      setFile(null)
    } else {
      alert('Error al enviar comprobante.')
    }
    setUploading(false)
  }

  const otherClasses = (pkg.items ?? []).filter((item: any) => item.class_id !== pkg.items?.[0]?.class_id)

  return (
    <div className="rounded-xl border border-violet-100 dark:border-dark-border bg-violet-50/30 dark:bg-dark-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
          <Package className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">{pkg.title}</p>
          {pkg.description && (
            <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5 line-clamp-1">{pkg.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(pkg.price)}</span>
            <span className="text-xs text-gray-400 dark:text-dark-text2">· {(pkg.items ?? []).length} clases</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-violet-100 dark:border-dark-border px-4 pb-4 pt-3 space-y-3">
          {/* Classes in package */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-dark-text2 mb-2">Clases incluidas</p>
            <div className="space-y-1">
              {(pkg.items ?? []).map((item: any) => (
                <div key={item.class_id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text">
                  <CheckCircle2 className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                  <span>{item.class?.title ?? 'Clase'}</span>
                  {item.class?.dance_style && (
                    <span className="text-xs text-gray-400">· {item.class.dance_style}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA area */}
          {currentUserId ? (
            enrolled ? (
              <div className="space-y-3">
                <PackageStatusBadge status={enrolled.status} />

                {enrolled.status === 'pending_payment' && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 dark:text-dark-text2">
                      Transfiere <strong>{formatCLP(pkg.price)}</strong> al profesor y adjunta el comprobante.
                    </p>
                    {file ? (
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 px-3 py-2">
                        <span className="text-xs text-gray-700 dark:text-dark-text flex-1 truncate">{file.name}</span>
                        <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-violet-300 dark:border-violet-700 px-4 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors w-full justify-center"
                      >
                        <Upload className="h-3.5 w-3.5" /> Adjuntar comprobante
                      </button>
                    )}
                    <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileSelect} />
                    {file && (
                      <button
                        onClick={handleSubmitPayment}
                        disabled={uploading}
                        className={cn('w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors', uploading && 'opacity-50')}
                      >
                        {uploading ? 'Enviando...' : 'Enviar comprobante'}
                      </button>
                    )}
                  </div>
                )}

                {enrolled.status === 'payment_submitted' && (
                  <p className="text-xs text-gray-500 dark:text-dark-text2">El profesor revisará tu comprobante pronto.</p>
                )}
              </div>
            ) : canEnrollUser ? (
              <button
                onClick={handleEnroll}
                disabled={loading}
                className={cn('w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors', loading && 'opacity-50')}
              >
                {loading ? 'Inscribiéndote...' : `Inscribirse al paquete — ${formatCLP(pkg.price)}`}
              </button>
            ) : (
              <p className="text-xs text-gray-500 dark:text-dark-text2 text-center">Necesitas un plan para inscribirte.</p>
            )
          ) : (
            <p className="text-xs text-gray-500 dark:text-dark-text2 text-center">Inicia sesión para inscribirte al paquete.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PackageSection({ classPackages, myPackageEnrollments, currentUserId, isTeacher, canEnrollUser }: PackageSectionProps) {
  if (classPackages.length === 0 && !isTeacher) return null

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Paquetes disponibles</h3>
      </div>

      {classPackages.length === 0 ? (
        isTeacher ? (
          <p className="text-xs text-gray-400 dark:text-dark-text2">Esta clase no pertenece a ningún paquete aún.</p>
        ) : null
      ) : (
        <div className="space-y-3">
          {classPackages.map((pkg: any) => {
            const myEnrollment = myPackageEnrollments.find((e: any) => e.package_id === pkg.id) ?? null
            return (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                myEnrollment={myEnrollment}
                currentUserId={currentUserId}
                canEnrollUser={canEnrollUser && !isTeacher}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
