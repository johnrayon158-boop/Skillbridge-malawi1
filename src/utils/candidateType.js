export const JOB_EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'graduate',
  'temporary',
  'volunteer',
]

export const PLACEMENT_ONLY_EMPLOYMENT_TYPES = ['internship', 'graduate']

export function getVisibleEmploymentTypes(candidateType) {
  return candidateType === 'graduate'
    ? JOB_EMPLOYMENT_TYPES
    : JOB_EMPLOYMENT_TYPES.filter((type) => type !== 'graduate')
}

export function getEmploymentListingTypes(candidateType, listingScope = 'employment') {
  const visibleTypes = getVisibleEmploymentTypes(candidateType)
  return listingScope === 'all'
    ? visibleTypes
    : visibleTypes.filter((type) => !PLACEMENT_ONLY_EMPLOYMENT_TYPES.includes(type))
}
