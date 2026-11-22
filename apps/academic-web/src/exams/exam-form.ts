import type { Exam, ExamInput } from './exam.types'
import { COURSES } from '../assignments/courses.ts'
import {
  CURRENT_COURSE,
  madridDeadline,
  assignmentDeadlineFields,
} from '../assignments/assignment-form.ts'
export { CURRENT_COURSE }

export function examCourseCode(exam?: Exam): string {
  if (!exam) return ''
  return (
    COURSES.find(
      (c) =>
        c.name === exam.course_name &&
        c.abbreviation === exam.course_abbreviation,
    )?.abbreviation ?? CURRENT_COURSE
  )
}
export function examDeadlineFields(exam?: Exam): {
  date: string
  time: string
} {
  return assignmentDeadlineFields(
    exam ? { due_date: exam.exam_date, due_at: exam.exam_at } : undefined,
  )
}
export function readExamForm(data: FormData, original?: Exam): ExamInput {
  const text = (name: string) => String(data.get(name) ?? '').trim()
  const number = (name: string) => {
    const raw = text(name)
    if (!raw) return null
    const value = Number(raw)
    if (!Number.isFinite(value))
      throw new Error('Revisa la nota y la ponderación.')
    return value
  }
  const course =
    text('course_abbreviation') === CURRENT_COURSE && original
      ? {
          name: original.course_name,
          abbreviation: original.course_abbreviation,
        }
      : COURSES.find((c) => c.abbreviation === text('course_abbreviation'))
  if (!course) throw new Error('Selecciona una asignatura.')
  const date = text('date'),
    time = text('time')
  if (!date) throw new Error('Indica la fecha del examen.')
  const previous = examDeadlineFields(original)
  const sameDate = original && previous.date === date && previous.time === time
  const weight = number('weight_percent')
  return {
    title: text('title'),
    course_name: course.name,
    course_abbreviation: course.abbreviation,
    topics: text('topics') || null,
    section: text('section') as ExamInput['section'],
    status: text('status') as ExamInput['status'],
    exam_date: sameDate ? original.exam_date : time ? null : date,
    exam_at: sameDate
      ? original.exam_at
      : time
        ? madridDeadline(date, time)
        : null,
    weight_percent: weight,
    weight_basis:
      weight === null
        ? null
        : (text('weight_basis') as ExamInput['weight_basis']),
    grade: number('grade'),
  }
}
export function examPatch(
  input: ExamInput,
  original: Exam,
): Partial<ExamInput> {
  const patch: Partial<ExamInput> = {}
  for (const field of Object.keys(input) as (keyof ExamInput)[]) {
    if (JSON.stringify(input[field]) !== JSON.stringify(original[field]))
      Object.assign(patch, { [field]: input[field] })
  }
  return patch
}
