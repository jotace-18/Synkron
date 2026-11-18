import type { Activity } from './activity.types'

export interface ActivityFilters {
  category: 'all' | 'academic' | 'sport' | 'social'
  delivery: 'all' | 'submitted' | 'unsubmitted'
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
    if (filters.category !== 'all' && !activity.type.startsWith(`${filters.category}.`)) {
      return false
    }

    if (filters.delivery !== 'all') {
      if (activity.type !== 'academic.assignment') return false
      if (filters.delivery === 'submitted' && activity.status !== 'submitted') return false
      if (filters.delivery === 'unsubmitted' &&
        activity.status !== 'pending' && activity.status !== 'in_progress') return false
    }

    return filters.category !== 'academic' || !filters.course ||
      activity.details.course_name === filters.course
  })
}

export function getCourseOptions(activities: Activity[]): { value: string; label: string }[] {
  const courses = new Map<string, string>()
  for (const activity of activities) {
    const name = activity.details.course_name
    if (!activity.type.startsWith('academic.') || typeof name !== 'string' || !name) continue
    const abbreviation = activity.details.course_abbreviation
    courses.set(name, typeof abbreviation === 'string' && abbreviation
      ? `${name} (${abbreviation})` : name)
  }
  return Array.from(courses, ([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es'))
}
