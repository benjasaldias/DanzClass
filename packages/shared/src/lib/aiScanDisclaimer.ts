// Disclaimer mostrado al profesor cuando elige su ai_scan_preference (migración 047).
// AI_SCAN_KNOWN_FAILURES se actualiza a mano cada vez que se detecta una falla real
// del modelo de escaneo, para que el texto refleje el historial real.
export const AI_SCAN_KNOWN_FAILURES = 0

export function getAiScanDisclaimer(
  lang: 'es' | 'en' = 'es',
  failures: number = AI_SCAN_KNOWN_FAILURES
): string {
  if (lang === 'en') {
    const failureWord = failures === 1 ? 'failure' : 'failures'
    return `We will never let a scan that looks faulty go through. So far we've had ${failures} ${failureWord} with this model. We run periodic manual reviews to make sure it keeps working correctly — the goal is to give you the confidence to stop manually checking your students' payments.`
  }
  const fallaWord = failures === 1 ? 'falla' : 'fallas'
  return `Nunca dejaremos pasar un escaneo que parezca defectuoso. Hasta ahora hemos tenido ${failures} ${fallaWord} usando este modelo. Hacemos revisiones manuales periódicas para asegurar la correcta funcionalidad; el objetivo es darte la seguridad y confianza de que puedes olvidarte de revisar los pagos de tus estudiantes manualmente.`
}
