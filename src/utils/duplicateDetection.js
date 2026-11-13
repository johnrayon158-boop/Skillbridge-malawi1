export function normalizeDuplicateText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeDuplicateText(left).split(' ').filter(Boolean))
  const rightTokens = new Set(normalizeDuplicateText(right).split(' ').filter(Boolean))
  if (!leftTokens.size && !rightTokens.size) return 1
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return shared / (leftTokens.size + rightTokens.size - shared)
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(left, right) {
  const leftDate = toDate(left)
  const rightDate = toDate(right)
  if (!leftDate || !rightDate) return null
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000))
}

function getPostingDate(job, referenceDate) {
  return job?.published_at || job?.created_at || referenceDate
}

function getEmployerKey(job) {
  return job?.employer_id
    ? `id:${job.employer_id}`
    : `name:${normalizeDuplicateText(job?.employer_profiles?.company_name)}`
}

export function compareJobsForDuplicates(left, right, { referenceDate = new Date() } = {}) {
  const sameEmployer = Boolean(getEmployerKey(left).replace('name:', ''))
    && getEmployerKey(left) === getEmployerKey(right)
  const sameTitle = Boolean(normalizeDuplicateText(left?.title))
    && normalizeDuplicateText(left.title) === normalizeDuplicateText(right?.title)
  const leftLocation = normalizeDuplicateText(left?.location || left?.employer_profiles?.city)
  const rightLocation = normalizeDuplicateText(right?.location || right?.employer_profiles?.city)
  const sameLocation = leftLocation === rightLocation
  const sameEmploymentType = String(left?.employment_type || '').toLowerCase()
    === String(right?.employment_type || '').toLowerCase()
  const leftClose = left?.application_deadline || null
  const rightClose = right?.application_deadline || null
  const sameClosingDate = Boolean(leftClose && rightClose && leftClose === rightClose)
  const postingDaysApart = daysBetween(
    getPostingDate(left, referenceDate),
    getPostingDate(right, referenceDate),
  )
  const postingsClose = postingDaysApart !== null && postingDaysApart <= 30
  const descriptionSimilarity = tokenSimilarity(left?.description, right?.description)

  return {
    isPossibleDuplicate: sameEmployer
      && sameTitle
      && sameLocation
      && sameEmploymentType
      && descriptionSimilarity >= 0.85
      && (sameClosingDate || postingsClose),
    sameEmployer,
    sameTitle,
    sameLocation,
    sameEmploymentType,
    sameClosingDate,
    postingsClose,
    postingDaysApart,
    descriptionSimilarity,
  }
}

export function findPotentialJobDuplicates(candidate, jobs = [], options = {}) {
  return jobs
    .filter((job) => job?.id !== candidate?.id && job?.status !== 'archived')
    .map((job) => ({ job, comparison: compareJobsForDuplicates(candidate, job, options) }))
    .filter(({ comparison }) => comparison.isPossibleDuplicate)
    .sort((left, right) => (
      right.comparison.descriptionSimilarity - left.comparison.descriptionSimilarity
      || (left.comparison.postingDaysApart ?? Infinity) - (right.comparison.postingDaysApart ?? Infinity)
    ))
}

export function findPotentialJobDuplicatePairs(jobs = [], options = {}) {
  const groupedJobs = new Map()
  for (const job of jobs) {
    if (!job?.id || job.status === 'archived') continue
    const employerKey = getEmployerKey(job)
    const titleKey = normalizeDuplicateText(job.title)
    if (!titleKey || !employerKey.replace('name:', '')) continue
    const groupKey = `${employerKey}:${titleKey}`
    const group = groupedJobs.get(groupKey) || []
    group.push(job)
    groupedJobs.set(groupKey, group)
  }

  const pairs = []
  for (const group of groupedJobs.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]
        const right = group[rightIndex]
        const comparison = compareJobsForDuplicates(left, right, options)
        if (comparison.isPossibleDuplicate) pairs.push({ left, right, comparison })
      }
    }
  }
  return pairs
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function questionFingerprint(question) {
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => normalizeDuplicateText(option)).sort()
    : []
  return stableSerialize({
    question: normalizeDuplicateText(question?.question),
    questionType: normalizeDuplicateText(question?.question_type),
    options,
    correctAnswer: normalizeDuplicateText(
      typeof question?.correct_answer === 'string'
        ? question.correct_answer
        : stableSerialize(question?.correct_answer),
    ),
    points: Number(question?.points) || 0,
    difficulty: normalizeDuplicateText(question?.difficulty),
    explanation: normalizeDuplicateText(question?.explanation),
  })
}

function getAssessmentTargets(assessment) {
  const jobTargets = new Set()
  if (assessment?.job_id) jobTargets.add(`job:${assessment.job_id}`)
  for (const assignment of assessment?.job_assessments || []) {
    if (assignment?.job_id) jobTargets.add(`job:${assignment.job_id}`)
  }
  if (jobTargets.size) return jobTargets
  if (assessment?.career_id) return new Set([`career:${assessment.career_id}`])
  if (assessment?.skill_id) return new Set([`skill:${assessment.skill_id}`])
  return new Set(['general'])
}

export function compareAssessmentsForDuplicates(left, right) {
  const leftTargets = getAssessmentTargets(left)
  const rightTargets = getAssessmentTargets(right)
  const sameTarget = [...leftTargets].some((target) => rightTargets.has(target))
  const sameTitle = Boolean(normalizeDuplicateText(left?.title))
    && normalizeDuplicateText(left.title) === normalizeDuplicateText(right?.title)
  const sameAssessmentType = String(left?.assessment_type || '').toLowerCase()
    === String(right?.assessment_type || '').toLowerCase()
  const leftQuestions = (left?.assessment_questions || []).map(questionFingerprint).sort()
  const rightQuestions = (right?.assessment_questions || []).map(questionFingerprint).sort()
  const sameQuestionSet = leftQuestions.length > 0
    && leftQuestions.length === rightQuestions.length
    && leftQuestions.every((question, index) => question === rightQuestions[index])
  const questionSimilarity = tokenSimilarity(
    (left?.assessment_questions || []).map((question) => question?.question).join(' '),
    (right?.assessment_questions || []).map((question) => question?.question).join(' '),
  )

  return {
    isPossibleDuplicate: sameTarget
      && sameAssessmentType
      && (sameQuestionSet || (sameTitle && questionSimilarity >= 0.8)),
    sameTarget,
    sameTitle,
    sameAssessmentType,
    samePublicationStatus: left?.status === right?.status,
    sameQuestionSet,
    questionSimilarity,
  }
}

export function findPotentialAssessmentDuplicates(assessments = []) {
  const pairs = []
  for (let leftIndex = 0; leftIndex < assessments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < assessments.length; rightIndex += 1) {
      const left = assessments[leftIndex]
      const right = assessments[rightIndex]
      if (!left?.id || left.id === right?.id || left.status === 'archived' || right?.status === 'archived') continue
      const comparison = compareAssessmentsForDuplicates(left, right)
      if (comparison.isPossibleDuplicate) pairs.push({ left, right, comparison })
    }
  }
  return pairs
}
