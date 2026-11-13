export function buildLearningProgressUpdate(studentId, resource, now = new Date().toISOString()) {
  if (!studentId || !resource?.id) throw new Error('A student and learning resource are required to update progress.')
  const currentStatus = resource.progress?.status || 'not_started'
  const nextStatus = currentStatus === 'in_progress' ? 'completed' : 'in_progress'
  const completing = nextStatus === 'completed'

  return {
    student_id: studentId,
    resource_id: resource.id,
    status: nextStatus,
    progress: completing
      ? 100
      : currentStatus === 'completed'
        ? 1
        : Math.max(Number(resource.progress?.progress) || 0, 1),
    started_at: resource.progress?.started_at || now,
    completed_at: completing ? now : null,
  }
}

export function applySavedLearningProgress(resources, savedProgress) {
  if (!savedProgress?.resource_id) throw new Error('The saved learning-progress record is missing its resource ID.')
  return resources.map((resource) => resource.id === savedProgress.resource_id
    ? { ...resource, progress: savedProgress }
    : resource)
}
