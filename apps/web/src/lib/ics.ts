// Generates an .ics (iCalendar) string for a DanzClass class.
// Triggers a browser file download when called from the client.

function pad(n: number) { return String(n).padStart(2, '0') }

// Format a local date + time as iCal DTSTART/DTEND value (no UTC suffix — keeps local time)
function icsDate(dateStr: string, timeStr: string | null | undefined, durationMinutes = 60): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr ?? '00:00').split(':').map(Number)
  const start = new Date(y, m - 1, d, hh, mm)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  return { start: fmt(start), end: fmt(end) }
}

function escapeICS(str: string) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function makeEvent(params: {
  uid: string
  dtstart: string
  dtend: string
  summary: string
  description: string
  location: string
  rrule?: string
}) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTART:${params.dtstart}`,
    `DTEND:${params.dtend}`,
    `SUMMARY:${escapeICS(params.summary)}`,
    `DESCRIPTION:${escapeICS(params.description)}`,
  ]
  if (params.location) lines.push(`LOCATION:${escapeICS(params.location)}`)
  if (params.rrule) lines.push(`RRULE:${params.rrule}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export function generateICS(classData: any): string {
  const title = classData.title ?? 'Clase DanzClass'
  const teacher = classData.teacher?.username ? `@${classData.teacher.username}` : 'Profesor'
  const location = classData.city ?? classData.location ?? ''
  const duration = classData.duration_minutes ?? 60
  const summary = `${title} — DanzClass`
  const description = `Profesor: ${teacher}${classData.level ? `\nNivel: ${classData.level}` : ''}`

  const events: string[] = []

  if (classData.type === 'suelta') {
    const { start, end } = icsDate(classData.date, classData.time, duration)
    events.push(makeEvent({
      uid: `danzclass-${classData.id}`,
      dtstart: start,
      dtend: end,
      summary,
      description,
      location,
    }))
  } else if (classData.recurrence === 'custom') {
    const dates: string[] = classData.custom_dates ?? []
    dates.forEach((dateStr: string, i: number) => {
      const { start, end } = icsDate(dateStr, classData.recurring_time, duration)
      events.push(makeEvent({
        uid: `danzclass-${classData.id}-${i}`,
        dtstart: start,
        dtend: end,
        summary,
        description,
        location,
      }))
    })
  } else {
    // Periodica / entrenamiento con RRULE
    const anchorDate = classData.start_date ?? classData.date ?? new Date().toISOString().split('T')[0]
    const { start, end } = icsDate(anchorDate, classData.recurring_time, duration)

    const rruleMap: Record<string, string> = {
      weekly: 'FREQ=WEEKLY',
      biweekly: 'FREQ=WEEKLY;INTERVAL=2',
      monthly: 'FREQ=MONTHLY',
    }
    const rrule = rruleMap[classData.recurrence] ?? 'FREQ=WEEKLY'
    const endsAt = classData.ends_indefinitely ? '' : (classData.ends_at ? `;UNTIL=${classData.ends_at.replace(/-/g, '')}T235959` : '')

    events.push(makeEvent({
      uid: `danzclass-${classData.id}`,
      dtstart: start,
      dtend: end,
      summary,
      description,
      location,
      rrule: rrule + endsAt,
    }))
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DanzClass//DanzClass//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICS(classData: any) {
  const ics = generateICS(classData)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(classData.title ?? 'clase').replace(/\s+/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
