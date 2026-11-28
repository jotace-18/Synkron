import type { Assignment, AssignmentInput } from './assignment.types'
import { COURSES } from './courses.ts'

export const CURRENT_COURSE = '__current_course__'

export type AssignmentCourse = Pick<Assignment, 'course_name' | 'course_abbreviation'>

export function assignmentCourseCode(assignment?: AssignmentCourse): string {
  if (!assignment) return ''
  return (
    COURSES.find(
      (course) =>
        course.abbreviation === assignment.course_abbreviation &&
        course.name === assignment.course_name,
    )?.abbreviation ?? CURRENT_COURSE
  )
}

export function assignmentDeadlineFields(assignment?: Pick<Assignment, 'due_date' | 'due_at'>): {
  date: string
  time: string
} {
  if (!assignment) return { date: '', time: '' }
  if (assignment.due_date) return { date: assignment.due_date, time: '' }
  if (!assignment.due_at) return { date: '', time: '' }
  const parts = Object.fromEntries(
    madridClock
      .formatToParts(new Date(assignment.due_at))
      .map(({ type, value }) => [type, value]),
  )
  return {
    date: `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

const madridClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function madridWallTime(instant: number): number {
  const parts = Object.fromEntries(
    madridClock
      .formatToParts(new Date(instant))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  )
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0)
  return date.getTime()
}

export function madridDeadline(date: string, time: string): string {
  const wallTime = Date.parse(`${date}T${time}:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    !Number.isFinite(wallTime) ||
    new Date(wallTime).toISOString().slice(0, 16) !== `${date}T${time}`
  ) {
    throw new Error('Revisa la fecha y la hora de vencimiento.')
  }
  let instant = wallTime
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant -= madridWallTime(instant) - wallTime
  }
  if (madridWallTime(instant) !== wallTime) {
    throw new Error(
      'Esa hora no existe en Madrid por el cambio de horario. Elige otra hora.',
    )
  }
  // When the clock repeats an hour in autumn, use its first occurrence.
  if (madridWallTime(instant - 3_600_000) === wallTime) instant -= 3_600_000
  return new Date(instant).toISOString()
}

export function readAssignmentForm(
  data: FormData,
  original?: Assignment,
  defaultCourse?: AssignmentCourse,
): AssignmentInput {
  const text = (name: string) => String(data.get(name) ?? '').trim()
  const optionalNumber = (name: string) => {
    const raw = text(name)
    if (!raw) return null
    const value = Number(raw)
    if (!Number.isFinite(value))
      throw new Error('Revisa la nota y la ponderación.')
    return value
  }
  const date = text('date')
  const time = text('time')
  const selectedCourse = COURSES.find(
    ({ abbreviation }) => abbreviation === text('course_abbreviation'),
  )
  const currentCourse = original ?? defaultCourse
  const course =
    text('course_abbreviation') === CURRENT_COURSE && currentCourse
      ? {
          name: currentCourse.course_name,
          abbreviation: currentCourse.course_abbreviation,
        }
      : selectedCourse
  if (!course) throw new Error('Selecciona una asignatura.')
  if (!date) throw new Error('Indica la fecha de vencimiento.')
  const workMode = text('work_mode') as AssignmentInput['work_mode']
  const weight = optionalNumber('weight_percent')
  const previousDeadline = assignmentDeadlineFields(original)
  const unchangedDeadline =
    original && date === previousDeadline.date && time === previousDeadline.time

  return {
    title: text('title'),
    course_name: course.name,
    course_abbreviation: course.abbreviation,
    section: text('section') as AssignmentInput['section'],
    mandatory: data.has('mandatory'),
    due_date: unchangedDeadline ? original.due_date : time ? null : date,
    due_at: unchangedDeadline
      ? original.due_at
      : time
        ? madridDeadline(date, time)
        : null,
    status: text('status') as AssignmentInput['status'],
    work_mode: workMode,
    group_members:
      workMode === 'group'
        ? text('group_members')
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean)
        : [],
    weight_percent: weight,
    weight_basis:
      weight === null
        ? null
        : (text('weight_basis') as AssignmentInput['weight_basis']),
    grade: optionalNumber('grade'),
  }
}

export function assignmentPatch(
  input: AssignmentInput,
  original: Assignment,
): Partial<AssignmentInput> {
  const patch: Partial<AssignmentInput> = {}
  for (const field of Object.keys(input) as (keyof AssignmentInput)[]) {
    if (JSON.stringify(input[field]) !== JSON.stringify(original[field])) {
      Object.assign(patch, { [field]: input[field] })
    }
  }
  return patch
}
