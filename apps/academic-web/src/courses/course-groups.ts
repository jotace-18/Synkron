import { COURSES } from '../assignments/courses.ts'
import type { Assignment } from '../assignments/assignment.types.ts'
import type { Exam } from '../exams/exam.types.ts'

export interface CourseGroup {
  id: string
  name: string
  abbreviation: string | null
  assignments: Assignment[]
  exams: Exam[]
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

export function groupCourses(assignments: Assignment[], exams: Exam[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>(COURSES.map((course) => [
    course.abbreviation,
    { ...course, id: course.abbreviation, assignments: [], exams: [] },
  ]))

  function groupFor(item: Assignment | Exam): CourseGroup {
    const catalogCourse = COURSES.find((course) =>
      normalize(course.name) === normalize(item.course_name) ||
      (item.course_abbreviation !== null &&
        normalize(course.abbreviation) === normalize(item.course_abbreviation)),
    )
    const id = catalogCourse?.abbreviation ?? `custom:${normalize(item.course_name)}`
    let group = groups.get(id)
    if (!group) {
      group = { id, name: item.course_name, abbreviation: item.course_abbreviation,
        assignments: [], exams: [] }
      groups.set(id, group)
    }
    return group
  }

  for (const assignment of assignments) {
    if (!assignment.deleted_at) groupFor(assignment).assignments.push(assignment)
  }
  for (const exam of exams) {
    if (!exam.deleted_at) groupFor(exam).exams.push(exam)
  }
  return [...groups.values()]
}
