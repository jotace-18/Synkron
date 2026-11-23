import type { Activity } from './activity.types'

export interface ActivityFilters {
  category: 'all' | 'academic' | 'sport' | 'personal'
  delivery:
    | 'all'
    | 'submitted'
    | 'unsubmitted'
    | 'scheduled'
    | 'pending'
    | 'completed'
    | 'cancelled'
  course: string
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
  category: 'all',
  delivery: 'all',
  course: '',
}

export function filterActivities(
  activities: Activity[],
  filters: ActivityFilters,
): Activity[] {
  return activities.filter((activity) => {
    if (
      filters.category !== 'all' &&
      !(
        activity.type.startsWith(`${filters.category}.`) ||
        (filters.category === 'personal' && activity.type === 'social.plan')
      )
    ) {
      return false
    }

    if (filters.delivery !== 'all') {
      if (
        filters.delivery === 'submitted' ||
        filters.delivery === 'unsubmitted'
      ) {
        if (activity.type !== 'academic.assignment') return false
        if (filters.delivery === 'submitted' && activity.status !== 'submitted')
          return false
        if (
          filters.delivery === 'unsubmitted' &&
          activity.status !== 'pending' &&
          activity.status !== 'in_progress'
        )
          return false
      } else if (activity.status !== filters.delivery) return false
    }

    return (
      filters.category !== 'academic' ||
      !filters.course ||
      activity.details.course_name === filters.course
    )
  })
}

export function getCourseOptions(
  activities: Activity[],
): { value: string; label: string }[] {
  const courses = new Map<string, string>()
  for (const activity of activities) {
    const name = activity.details.course_name
    if (
      !activity.type.startsWith('academic.') ||
      typeof name !== 'string' ||
      !name
    )
      continue
    const abbreviation = activity.details.course_abbreviation
    courses.set(
      name,
      typeof abbreviation === 'string' && abbreviation
        ? `${name} (${abbreviation})`
        : name,
    )
  }
  return Array.from(courses, ([value, label]) => ({ value, label })).sort(
    (left, right) => left.label.localeCompare(right.label, 'es'),
  )
}

export function getStatusFilterOptions(
  category: ActivityFilters['category'],
): { value: ActivityFilters['delivery']; label: string }[] {
  const options: { value: ActivityFilters['delivery']; label: string }[] = [
    { value: 'all', label: 'Cualquier estado' },
  ]
  if (category === 'all' || category === 'academic')
    options.push(
      { value: 'submitted', label: 'Entregadas' },
      { value: 'unsubmitted', label: 'No entregadas' },
    )
  if (category === 'all' || category === 'personal')
    options.push({ value: 'pending', label: 'Pendientes' })
  if (category !== 'personal')
    options.push({ value: 'scheduled', label: 'Programados' })
  options.push(
    { value: 'completed', label: 'Realizados' },
    { value: 'cancelled', label: 'Cancelados' },
  )
  return options
}
