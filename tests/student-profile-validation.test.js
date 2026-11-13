import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  calculateStudentProfileCompletion,
  isValidEducationRecord,
  normalizeEducationRecord,
  validateEducationRecord,
} from '../src/utils/educationValidation.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261116000001_student_profile_completion_and_education.sql', import.meta.url),
  'utf8',
)
const studentService = await readFile(new URL('../src/services/studentService.js', import.meta.url), 'utf8')
const profileEditor = await readFile(new URL('../src/pages/student/StudentModulePage.jsx', import.meta.url), 'utf8')

const completeEducation = {
  institution: '  University of Malawi  ',
  programme: '  Computer Science  ',
  qualification: '  Bachelor of Science  ',
  education_level: '  Undergraduate  ',
}

test('education validation requires nonblank details and permits ongoing study', () => {
  assert.deepEqual(validateEducationRecord({ ...completeEducation, end_year: '' }), {})
  assert.equal(isValidEducationRecord({ ...completeEducation, end_year: null }), true)
  assert.equal(validateEducationRecord({ ...completeEducation, qualification: '  ' }).qualification, 'Enter the qualification.')
  assert.equal(validateEducationRecord({ ...completeEducation, institution: 'x'.repeat(161) }).institution, 'Use 160 characters or fewer.')
})

test('education validation rejects invalid years and an end year before the start year', () => {
  assert.equal(validateEducationRecord({ ...completeEducation, start_year: '1899' }).start_year, 'Enter a year from 1900 to 2200.')
  assert.equal(validateEducationRecord({ ...completeEducation, start_year: '2024', end_year: '2023' }).end_year, 'End year must be on or after the start year.')
})

test('education saves trim text, normalize years, and reject incomplete records', () => {
  assert.deepEqual(normalizeEducationRecord({
    ...completeEducation,
    start_year: '2022',
    end_year: '',
    grade: '  ',
    field_of_study: '  ',
  }), {
    institution: 'University of Malawi',
    programme: 'Computer Science',
    qualification: 'Bachelor of Science',
    education_level: 'Undergraduate',
    start_year: 2022,
    end_year: null,
    grade: null,
    field_of_study: null,
  })
  assert.throws(() => normalizeEducationRecord({ ...completeEducation, programme: ' ' }), /Enter the programme/)
  assert.match(studentService, /normalizeEducationRecord\(record\)/)
  assert.match(studentService, /normalizeEducationRecord\(changes\)/)
})

test('profile completion includes career interests and ignores incomplete legacy education', () => {
  const profile = {
    fullName: 'Student Name',
    phone: '+265 999 123 456',
    bio: 'A short profile',
    targetRole: 'Software Developer',
    interests: 'Software, data',
    educationRecords: [{ institution: 'Legacy University', programme: '', qualification: '', education_level: '' }],
  }
  const incomplete = calculateStudentProfileCompletion(profile)
  assert.equal(incomplete.percentage, 83)
  assert.equal(incomplete.items.at(-1).complete, false)

  const complete = calculateStudentProfileCompletion({
    ...profile,
    interests: ['Software'],
    educationRecords: [{ ...completeEducation, start_year: 2021, end_year: null }],
  })
  assert.equal(complete.percentage, 100)
  assert.equal(complete.isComplete, true)
  assert.equal(complete.items.some((item) => item.label === 'At least one career interest' && item.complete), true)
})

test('completion is recalculated from profile and education changes without deleting legacy records', () => {
  assert.match(migration, /after insert or update or delete on public\.education/i)
  assert.match(migration, /after update of phone, bio, target_role, interests, institution, programme, education_level/i)
  assert.match(migration, /for student_record in select id from public\.student_profiles/i)
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.education\b/i)
  assert.match(profileEditor, /Incomplete legacy record\. Edit or remove it; it does not count toward profile completion\./)
  assert.match(profileEditor, /aria-invalid=\{Boolean\(educationFieldErrors\[field\]\)\}/)
  assert.match(profileEditor, /Leave end year blank if your education is ongoing\./)
})
