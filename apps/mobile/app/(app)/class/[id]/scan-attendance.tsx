import { useCallback, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Vibration, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useTheme } from '../../../../context/ThemeContext'
import { ChevronLeft, CheckCircle2, AlertCircle, Camera as CameraIcon } from 'lucide-react-native'
import { supabase } from '../../../../lib/supabase'

const WEB_URL = 'https://dc-project-web.vercel.app'

// El resultado del escaneo se muestra 2s antes de re-habilitar la cámara —
// tiempo suficiente para leer el nombre sin frenar el ritmo de una fila.
const RESULT_DISPLAY_MS = 2000

type ScanOutcome =
  | { kind: 'confirmed'; studentName: string; avatarUrl: string | null }
  | { kind: 'already_registered'; studentName: string; avatarUrl: string | null }
  | { kind: 'rejected'; message: string }
  | { kind: 'network_error' }

export default function ScanAttendanceScreen() {
  const { title } = useLocalSearchParams<{ id: string; title?: string }>()
  const router = useRouter()
  const { isDark } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [checking, setChecking] = useState(false)

  // Ref (no state) para bloquear sincrónicamente frames repetidos del mismo
  // QR mientras se resuelve/se muestra el resultado — evita doble check-in
  // por escaneo continuo de la cámara. `checking`/`outcome` además controlan
  // el prop `onBarcodeScanned` para que el escáner nativo deje de procesar
  // frames del todo (más barato que solo ignorar en JS).
  const scanLockRef = useRef(false)

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    if (scanLockRef.current) return
    scanLockRef.current = true
    setChecking(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('no session')

      const res = await fetch(`${WEB_URL}/api/attendance/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ token: result.data }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json) {
        setOutcome({ kind: 'network_error' })
        Vibration.vibrate(300)
      } else if (json.status === 'confirmed') {
        setOutcome({ kind: 'confirmed', studentName: json.student?.full_name ?? 'Alumno', avatarUrl: json.student?.avatar_url ?? null })
        Vibration.vibrate(100)
      } else if (json.status === 'already_registered') {
        setOutcome({ kind: 'already_registered', studentName: json.student?.full_name ?? 'Alumno', avatarUrl: json.student?.avatar_url ?? null })
        Vibration.vibrate(100)
      } else {
        setOutcome({ kind: 'rejected', message: json.message ?? 'QR rechazado.' })
        Vibration.vibrate(300)
      }
    } catch {
      setOutcome({ kind: 'network_error' })
      Vibration.vibrate(300)
    } finally {
      setChecking(false)
      setTimeout(() => {
        setOutcome(null)
        scanLockRef.current = false
      }, RESULT_DISPLAY_MS)
    }
  }, [])

  const scanningPaused = checking || outcome !== null

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 py-3 bg-black/80">
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} stroke="#EEEDFE" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-white flex-1" numberOfLines={1}>
          {title ? `Escanear — ${title}` : 'Escanear asistencia'}
        </Text>
      </View>

      <View className="flex-1">
        {!permission ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#EEEDFE" />
          </View>
        ) : !permission.granted ? (
          <View className="flex-1 items-center justify-center px-8 gap-4">
            <CameraIcon size={40} stroke="#A39BBF" />
            <Text className="text-white text-center font-semibold">
              {permission.canAskAgain
                ? 'Necesitamos acceso a la cámara para escanear el QR de asistencia'
                : 'El acceso a la cámara está desactivado para DanzClass'}
            </Text>
            <Text className="text-dark-text2 text-center text-sm">
              {permission.canAskAgain
                ? 'Solo se usa para leer el código, no se guardan fotos ni video.'
                : 'Actívalo desde los ajustes del sistema para poder escanear.'}
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              className="bg-brand-600 rounded-xl py-3 px-6 items-center mt-2"
            >
              <Text className="text-white font-semibold">
                {permission.canAskAgain ? 'Dar permiso' : 'Abrir ajustes'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanningPaused ? undefined : handleBarcodeScanned}
            />
            {/* Marco guía */}
            {!scanningPaused && (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                <View className="w-64 h-64 rounded-3xl border-4 border-white/70" />
                <Text className="text-white text-sm font-medium mt-6 bg-black/50 px-3 py-1.5 rounded-full">
                  Apunta al QR del alumno
                </Text>
              </View>
            )}

            {checking && (
              <View className="absolute inset-0 items-center justify-center bg-black/60">
                <ActivityIndicator size="large" color="#EEEDFE" />
              </View>
            )}

            {outcome && <ResultOverlay outcome={outcome} isDark={isDark} />}
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

function ResultOverlay({ outcome, isDark }: { outcome: ScanOutcome; isDark: boolean }) {
  const config = {
    confirmed: { bg: 'bg-green-600', icon: <CheckCircle2 size={48} stroke="white" /> },
    already_registered: { bg: 'bg-amber-500', icon: <AlertCircle size={48} stroke="white" /> },
    rejected: { bg: 'bg-red-600', icon: <AlertCircle size={48} stroke="white" /> },
    network_error: { bg: 'bg-red-600', icon: <AlertCircle size={48} stroke="white" /> },
  }[outcome.kind]

  return (
    <View className={`absolute inset-0 items-center justify-center ${config.bg}`}>
      {'avatarUrl' in outcome && outcome.avatarUrl ? (
        <Image source={{ uri: outcome.avatarUrl }} className="w-20 h-20 rounded-full mb-3 border-2 border-white" />
      ) : (
        <View className="mb-3">{config.icon}</View>
      )}
      <Text className="text-white text-2xl font-bold text-center px-6">
        {outcome.kind === 'confirmed' && `Confirmado — ${outcome.studentName}`}
        {outcome.kind === 'already_registered' && `Ya registrado — ${outcome.studentName}`}
        {outcome.kind === 'rejected' && outcome.message}
        {outcome.kind === 'network_error' && 'No se pudo validar. Intenta de nuevo.'}
      </Text>
    </View>
  )
}
