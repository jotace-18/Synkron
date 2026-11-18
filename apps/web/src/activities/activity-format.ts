import type { Activity, ActivitySchedule, ActivityType, JsonValue } from './activity.types'

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const instantFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
})

export function formatSchedule(schedule: ActivitySchedule): string {
  const label = schedule.role === 'deadline' ? 'Vence' : 'Inicio'

  if (schedule.kind === 'date') {
    const date = new Date(`${schedule.date}T00:00:00Z`)
    return `${label}: ${dateFormatter.format(date)}`
  }

  const start = instantFormatter.format(new Date(schedule.at))

  if (schedule.kind === 'interval') {
    const end = instantFormatter.format(new Date(schedule.end_at))
    return `${start} – ${end}`
  }

  return `${label}: ${start}`
}

export function formatStatus(status: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'in_progress':
      return 'En curso'
    case 'submitted':
      return 'Entregada'
    default:
      return status ?? 'Sin estado'
  }
}

export function formatSection(section: JsonValue | undefined): string {
  switch (section) {
    case 'theory': return 'Teoría'
    case 'practice': return 'Prácticas'
    case 'seminar': return 'Seminarios'
    default: return 'Sin especificar'
  }
}

export function formatActivityType(type: ActivityType): string {
  const labels: Record<ActivityType, string> = {
    'academic.assignment': 'Entrega',
    'academic.exam': 'Examen',
    'academic.work_session': 'Sesión de trabajo',
    'academic.event': 'Evento académico',
    'sport.gym': 'Gimnasio',
    'sport.football': 'Fútbol',
    'sport.hiking': 'Senderismo',
    'sport.running': 'Carrera',
    'sport.other': 'Deporte',
    'social.plan': 'Plan',
  }
  return labels[type]
}

export function formatCalendarTitle(activity: Activity): string {
  const abbreviation = activity.details.course_abbreviation
  return typeof abbreviation === 'string' && abbreviation.trim()
    ? `${activity.title} (${abbreviation})`
    : activity.title
}

export function getAssignmentFields(activity: Activity): { label: string; value: string }[] {
  const details = activity.details
  const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
  const courseName = typeof details.course_name === 'string'
    ? details.course_name : 'Sin especificar'
  const abbreviation = typeof details.course_abbreviation === 'string'
    ? details.course_abbreviation : null
  const section = formatSection(details.section)
  const members = Array.isArray(details.group_members)
    ? details.group_members.filter((member) => typeof member === 'string').join(', ')
    : ''

  const fields = [
    { label: 'Asignatura', value: abbreviation ? `${courseName} (${abbreviation})` : courseName },
    { label: 'Parte', value: section },
    { label: 'Obligatoriedad', value: details.mandatory === true
      ? 'Obligatoria' : details.mandatory === false ? 'Opcional' : 'Sin especificar' },
    { label: 'Modalidad', value: details.work_mode === 'group'
      ? 'En grupo' : details.work_mode === 'individual' ? 'Individual' : 'Sin especificar' },
  ]

  if (details.work_mode === 'group') {
    fields.push({ label: 'Integrantes', value: members || 'Sin nombres indicados' })
  }

  fields.push({
    label: 'Ponderación',
    value: typeof details.weight_percent === 'number'
      ? `${number.format(details.weight_percent)} % ${details.weight_basis === 'course'
        ? 'del total de la asignatura' : `de la parte de ${section.toLowerCase()}`}`
      : 'No conocida',
  }, {
    label: 'Nota',
    value: typeof details.grade === 'number'
      ? `${number.format(details.grade)} / 10` : 'Sin nota',
  })
  return fields
}
