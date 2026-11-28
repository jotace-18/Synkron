import assert from 'node:assert/strict'
import test from 'node:test'
import { groupCourses } from '../src/courses/course-groups.ts'
import { COURSES } from '../src/assignments/courses.ts'

test('includes the catalog without activity', () => {
  const groups = groupCourses([], [])
  assert.equal(groups.length, COURSES.length)
  assert.ok(groups.every((course) => !course.assignments.length && !course.exams.length))
})

test('combines assignments and exams by catalog name or abbreviation', () => {
  const assignment = { id: 'a1', course_name: ' Cloud   Computing ', course_abbreviation: null, grade: 0 }
  const exam = { id: 'e1', course_name: 'Nombre antiguo', course_abbreviation: ' cc ' }
  const groups = groupCourses([assignment], [exam])
  assert.equal(groups.length, COURSES.length)
  const cc = groups.find((course) => course.id === 'CC')
  assert.deepEqual(cc.assignments, [assignment])
  assert.deepEqual(cc.exams, [exam])
  assert.equal(cc.assignments[0].grade, 0)
  assert.equal(groups.find((course) => course.id === 'DSS').assignments.length, 0)
})

test('keeps courses outside the catalog and excludes retired records', () => {
  const assignment = { id: 'a1', course_name: 'Optativa', course_abbreviation: 'OPT' }
  const exam = { id: 'e1', course_name: ' optativa ', course_abbreviation: null }
  const retired = { id: 'a2', course_name: 'Retirada', course_abbreviation: null, deleted_at: '2026-11-26T10:00:00Z' }
  const groups = groupCourses([assignment, retired], [exam, { ...retired, id: 'e2' }])
  assert.equal(groups.length, COURSES.length + 1)
  const custom = groups.find((course) => course.name === 'Optativa')
  assert.deepEqual(custom.assignments, [assignment])
  assert.deepEqual(custom.exams, [exam])
})
