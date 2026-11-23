import type {
  Activity,
  ActivitySchedule,
  ActivityType,
  JsonValue,
} from './activity.types'

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
    case 'scheduled':
      return 'Programado'
    case 'completed':
      return 'Realizado'
    case 'cancelled':
      return 'Cancelado'
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
    case 'theory':
      return 'Teoría'
    case 'practice':
      return 'Prácticas'
    case 'seminar':
      return 'Seminarios'
    default:
      return 'Sin especificar'
  }
}

export function formatActivityType(type: string): string {
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
    'personal.event': 'Otros',
    'social.plan': 'Otros',
  }
  return Object.hasOwn(labels, type)
    ? labels[type as ActivityType]
    : 'Actividad'
}

export function formatCalendarTitle(activity: Activity): string {
  const abbreviation = activity.details.course_abbreviation
  return typeof abbreviation === 'string' && abbreviation.trim()
    ? `${activity.title} (${abbreviation})`
    : activity.title
}

export function getAssignmentFields(
  activity: Activity,
): { label: string; value: string }[] {
  const details = activity.details
  const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
  const courseName =
    typeof details.course_name === 'string'
      ? details.course_name
      : 'Sin especificar'
  const abbreviation =
    typeof details.course_abbreviation === 'string'
      ? details.course_abbreviation
      : null
  const section = formatSection(details.section)
  const members = Array.isArray(details.group_members)
    ? details.group_members
        .filter((member) => typeof member === 'string')
        .join(', ')
    : ''

  const fields = [
    {
      label: 'Asignatura',
      value: abbreviation ? `${courseName} (${abbreviation})` : courseName,
    },
    { label: 'Parte', value: section },
    {
      label: 'Obligatoriedad',
      value:
        details.mandatory === true
          ? 'Obligatoria'
          : details.mandatory === false
            ? 'Opcional'
            : 'Sin especificar',
    },
    {
      label: 'Modalidad',
      value:
        details.work_mode === 'group'
          ? 'En grupo'
          : details.work_mode === 'individual'
            ? 'Individual'
            : 'Sin especificar',
    },
  ]

  if (details.work_mode === 'group') {
    fields.push({
      label: 'Integrantes',
      value: members || 'Sin nombres indicados',
    })
  }

  fields.push(
    {
      label: 'Ponderación',
      value:
        typeof details.weight_percent === 'number'
          ? `${number.format(details.weight_percent)} % ${
              details.weight_basis === 'course'
                ? 'del total de la asignatura'
                : `de la parte de ${section.toLowerCase()}`
            }`
          : 'No conocida',
    },
    {
      label: 'Nota',
      value:
        typeof details.grade === 'number'
          ? `${number.format(details.grade)} / 10`
          : 'Sin nota',
    },
  )
  return fields
}

export function getExamFields(
  activity: Activity,
): { label: string; value: string }[] {
  const fields = getAssignmentFields(activity).filter(
    ({ label }) =>
      !['Obligatoriedad', 'Modalidad', 'Integrantes'].includes(label),
  )
  fields.splice(2, 0, {
    label: 'Temario',
    value:
      typeof activity.details.topics === 'string'
        ? activity.details.topics
        : 'Sin especificar',
  })
  return fields
}

export function getGymFields(
  activity: Activity,
): { label: string; value: string }[] {
  const modes: Record<string, string> = {
    push: 'Push',
    pull: 'Pull',
    leg: 'Leg',
    upper: 'Upper',
    lower: 'Lower',
    other: 'Otros',
  }
  const mode = activity.details.training_mode
  const duration =
    activity.schedule.kind === 'interval'
      ? (Date.parse(activity.schedule.end_at) -
          Date.parse(activity.schedule.at)) /
        60000
      : null
  return [
    {
      label: 'Modalidad',
      value:
        typeof mode === 'string' ? (modes[mode] ?? mode) : 'Sin especificar',
    },
    {
      label: 'Duración',
      value:
        duration !== null
          ? `${new Intl.NumberFormat('es-ES').format(duration)} minutos`
          : 'Sin especificar',
    },
    {
      label: 'Compañía',
      value:
        activity.details.accompanied === true
          ? 'Acompañado'
          : activity.details.accompanied === false
            ? 'Solo'
            : 'Sin especificar',
    },
  ]
}

export function getPersonalFields(
  activity: Activity,
): { label: string; value: string }[] {
  const people = Array.isArray(activity.details.people)
    ? activity.details.people.filter(
        (name): name is string =>
          typeof name === 'string' && name.trim().length > 0,
      )
    : []
  const duration =
    activity.schedule.kind === 'interval'
      ? (Date.parse(activity.schedule.end_at) -
          Date.parse(activity.schedule.at)) /
        60_000
      : null
  return [
    {
      label: 'Duración',
      value:
        duration === null
          ? 'Sin duración indicada'
          : `${new Intl.NumberFormat('es-ES').format(duration)} minutos`,
    },
    {
      label: 'Personas',
      value: people.length ? people.join(', ') : 'Sin personas indicadas',
    },
  ]
}

const detailFormatters: Partial<
  Record<
    ActivityType,
    (activity: Activity) => { label: string; value: string }[]
  >
> = {
  'academic.assignment': getAssignmentFields,
  'academic.exam': getExamFields,
  'sport.gym': getGymFields,
  'personal.event': getPersonalFields,
  'social.plan': getPersonalFields,
}
export function getActivityFields(
  activity: Activity,
): { label: string; value: string }[] {
  const formatter = Object.hasOwn(detailFormatters, activity.type)
    ? detailFormatters[activity.type]
    : undefined
  return formatter?.(activity) ?? []
}
