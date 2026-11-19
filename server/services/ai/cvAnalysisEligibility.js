export function isCvAnalysisProfileEligible(profile) {
  const studentProfile = Array.isArray(profile?.student_profiles)
    ? profile.student_profiles[0]
    : profile?.student_profiles
  const candidateType = studentProfile?.candidate_type
    || (profile?.role === 'graduate' ? 'graduate' : 'student')

  return ['student', 'graduate'].includes(profile?.role)
    && ['student', 'graduate'].includes(candidateType)
}
