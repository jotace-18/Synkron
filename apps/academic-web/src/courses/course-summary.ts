import type { Assignment } from '../assignments/assignment.types.ts'
import type { Exam } from '../exams/exam.types.ts'
import type { CourseGroup } from './course-groups.ts'

const madridDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
})
const sections = { theory: 'Teoría', practice: 'Prácticas', seminar: 'Seminarios' }

function deadline(item: Assignment | Exam): string | null {
  return 'due_date' in item ? item.due_date ?? item.due_at : item.exam_date ?? item.exam_at
}

function sortByDeadline<T extends Assignment | Exam>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const first = deadline(a)
    const second = deadline(b)
    if (!first) return second ? 1 : a.title.localeCompare(b.title, 'es')
    if (!second) return -1
    // Compare calendar dates in Madrid; a date without a time lasts the whole day.
    const key = (value: string) => value.length === 10
      ? `${value}T23:59:59`
      : new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(value)).replace(' ', 'T')
    return key(first).localeCompare(key(second)) || a.title.localeCompare(b.title, 'es')
  })
}

export function isOverdue(assignment: Assignment, now = new Date()): boolean {
  if (assignment.status === 'submitted') return false
  if (assignment.due_date) return assignment.due_date < madridDate.format(now)
  return assignment.due_at !== null && new Date(assignment.due_at).getTime() < now.getTime()
}

export function summarizeCourse(course: CourseGroup, now = new Date()) {
  const pending = sortByDeadline(course.assignments.filter((item) => item.status !== 'submitted'))
  const submitted = course.assignments.filter((item) => item.status === 'submitted')
  const scheduled = sortByDeadline(course.exams.filter((item) => item.status === 'scheduled'))
  const grades = [
    ...course.assignments.map((item) => ({ item, kind: 'Entrega' })),
    ...course.exams.filter((item) => item.status !== 'cancelled').map((item) => ({ item, kind: 'Examen' })),
  ].filter(({ item }) => item.grade !== null).map(({ item, kind }) => ({
    id: `${kind}-${item.id}`, title: item.title, kind, section: sections[item.section],
    grade: item.grade!, weight: item.weight_percent, basis: item.weight_basis,
  }))
  return {
    pending, submitted, scheduled, grades,
    overdue: pending.filter((item) => isOverdue(item, now)).length,
    progress: course.assignments.length ? Math.round(submitted.length / course.assignments.length * 100) : 0,
    average: grades.length ? grades.reduce((sum, item) => sum + item.grade, 0) / grades.length : null,
  }
}
