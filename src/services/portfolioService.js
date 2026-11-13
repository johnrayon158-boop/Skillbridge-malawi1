import { supabase } from './supabase'
import { validateCertificateFile } from '../utils/certificateValidation'
import { validateProjectImageFile } from '../utils/projectImageValidation'
import { createPortfolioRepository } from './portfolioRepository'

const CERTIFICATE_BUCKET = 'student-certificates'
const PROJECT_IMAGE_BUCKET = 'student-project-images'
const portfolioRepository = createPortfolioRepository(supabase)

async function syncSkillLinks(table, foreignKey, recordId, skillIds) {
  const uniqueSkillIds = [...new Set(skillIds.filter((skillId) => typeof skillId === 'string' && skillId.trim()))]
  const { data: currentLinks, error: selectError } = await supabase.from(table)
    .select('skill_id')
    .eq(foreignKey, recordId)
  if (selectError) throw new Error(selectError.message || 'Unable to load existing skill links.')
  const existingIds = new Set((currentLinks || []).map((link) => link.skill_id))
  const additions = uniqueSkillIds.filter((skillId) => !existingIds.has(skillId))
  const removals = [...existingIds].filter((skillId) => !uniqueSkillIds.includes(skillId))

  if (additions.length) {
    const { error: insertError } = await supabase.from(table).insert(additions.map((skillId) => ({
      [foreignKey]: recordId,
      skill_id: skillId,
    })))
    if (insertError) throw new Error(insertError.message || 'Unable to update linked skills.')
  }
  if (removals.length) {
    const { error: deleteError } = await supabase.from(table)
      .delete()
      .eq(foreignKey, recordId)
      .in('skill_id', removals)
    if (deleteError) throw new Error(deleteError.message || 'Unable to update linked skills.')
  }
}

export const portfolioService = {
  async getEvidence(studentId) {
    return portfolioRepository.getEvidence(studentId)
  },

  async getRecruitmentEvidence(studentId) {
    return portfolioRepository.getRecruitmentEvidence(studentId)
  },

  async getOverview(studentId) {
    const evidence = await portfolioRepository.getEvidence(studentId)
    const assetWarnings = []
    const projectRecords = await Promise.all(evidence.projects.map(async (project) => {
      if (!project.image_path) return project
      const { data, error } = await supabase.storage
        .from(PROJECT_IMAGE_BUCKET)
        .createSignedUrl(project.image_path, 3600)
      if (error || !data?.signedUrl) {
        assetWarnings.push('A project image could not be opened.')
        return project
      }
      return { ...project, image_display_url: data.signedUrl }
    }))
    const certificateRecords = await Promise.all(evidence.certificates.map(async (certificate) => {
      if (!certificate.file_path) return certificate
      const { data, error } = await supabase.storage
        .from(CERTIFICATE_BUCKET)
        .createSignedUrl(certificate.file_path, 3600)
      if (error || !data?.signedUrl) {
        assetWarnings.push('An uploaded certificate file could not be opened.')
        return certificate
      }
      return { ...certificate, file_url: data.signedUrl }
    }))
    return {
      ...evidence,
      projects: projectRecords,
      certificates: certificateRecords,
      assetWarnings: [...new Set(assetWarnings)],
    }
  },

  async saveProject(project, imageFile) {
    const skillIds = Array.isArray(project.skill_ids) ? project.skill_ids : null
    const projectData = Object.fromEntries(Object.entries(project).filter(([key]) => key !== 'skill_ids'))
    let imagePath = project.image_path || null
    if (imageFile) {
      const validation = validateProjectImageFile(imageFile)
      if (!validation.valid) throw new Error(validation.message)
      imagePath = `${project.student_id}/projects/${crypto.randomUUID()}.${validation.extension}`
      const { error: uploadError } = await supabase.storage
        .from(PROJECT_IMAGE_BUCKET)
        .upload(imagePath, imageFile, { contentType: imageFile.type, upsert: false, cacheControl: '3600' })
      if (uploadError) throw new Error(uploadError.message || 'Unable to upload the project image.')
    }

    let savedProject
    try {
      savedProject = await portfolioRepository.saveProject({ ...projectData, image_path: imagePath })
    } catch (saveError) {
      if (imageFile && imagePath) {
        const { error: cleanupError } = await supabase.storage.from(PROJECT_IMAGE_BUCKET).remove([imagePath])
        if (cleanupError) {
          throw new Error(`${saveError.message || 'Unable to save the project.'} The uploaded image could not be cleaned up: ${cleanupError.message}`, { cause: saveError })
        }
      }
      throw saveError
    }
    if (skillIds) {
      try {
        await syncSkillLinks('project_skills', 'project_id', savedProject.id, skillIds)
      } catch (linkError) {
        throw new Error(`Project saved, but its skill links could not be updated: ${linkError.message}`, { cause: linkError })
      }
    }
    return savedProject
  },

  async deleteProject(id, studentId) {
    const { data: project, error: lookupError } = await supabase.from('projects')
      .select('image_path')
      .eq('id', id)
      .eq('student_id', studentId)
      .single()
    if (lookupError) throw new Error(lookupError.message || 'Unable to find this project.')

    const { error } = await supabase.from('projects').delete().eq('id', id).eq('student_id', studentId)
    if (error) throw new Error(error.message || 'Unable to delete the project.')
    if (project.image_path) {
      const { error: storageError } = await supabase.storage.from(PROJECT_IMAGE_BUCKET).remove([project.image_path])
      if (storageError) throw new Error(`Project deleted, but its uploaded image could not be removed: ${storageError.message}`)
    }
  },

  async saveCertificate(certificate, file) {
    const skillIds = Array.isArray(certificate.skill_ids) ? certificate.skill_ids : []
    const certificateData = Object.fromEntries(Object.entries(certificate).filter(([key]) => key !== 'skill_ids'))
    const validation = validateCertificateFile(file)
    if (!validation.valid) throw new Error(validation.message)
    const filePath = `${certificate.student_id}/certificates/${crypto.randomUUID()}.${validation.extension}`
    const { error: uploadError } = await supabase.storage
      .from(CERTIFICATE_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
    if (uploadError) throw new Error(uploadError.message || 'Unable to upload the certificate.')

    let savedCertificateId
    try {
      const savedCertificate = await portfolioRepository.saveCertificate({
        ...certificateData,
        file_path: filePath,
        verification_status: 'pending',
        verification_method: null,
        verified_by: null,
        verified_at: null,
      })
      savedCertificateId = savedCertificate.id
      if (skillIds.length) {
        await syncSkillLinks('certificate_skills', 'certificate_id', savedCertificate.id, skillIds)
      }
      return savedCertificate
    } catch (saveError) {
      if (savedCertificateId) {
        const { error: certificateCleanupError } = await supabase.from('certificates').delete().eq('id', savedCertificateId).eq('student_id', certificate.student_id)
        if (certificateCleanupError) {
          throw new Error(`${saveError.message || 'Unable to save the certificate.'} The incomplete certificate record could not be removed: ${certificateCleanupError.message}`, { cause: saveError })
        }
      }
      const { error: cleanupError } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([filePath])
      if (cleanupError) {
        throw new Error(`${saveError.message || 'Unable to save the certificate.'} The uploaded file could not be cleaned up: ${cleanupError.message}`, { cause: saveError })
      }
      throw saveError
    }
  },

  async resubmitCertificate(id, certificate, file) {
    const skillIds = Array.isArray(certificate.skill_ids) ? certificate.skill_ids : []
    const certificateData = Object.fromEntries(Object.entries(certificate).filter(([key]) => key !== 'skill_ids'))
    const validation = validateCertificateFile(file)
    if (!validation.valid) throw new Error(validation.message)

    const { data: existing, error: existingError } = await supabase.from('certificates')
      .select('file_path')
      .eq('id', id)
      .eq('student_id', certificate.student_id)
      .eq('verification_status', 'requires_correction')
      .maybeSingle()
    if (existingError) throw new Error(existingError.message || 'Unable to load the certificate to resubmit.')
    if (!existing) throw new Error('This certificate no longer requires correction. Refresh your portfolio and try again.')

    const filePath = `${certificate.student_id}/certificates/${crypto.randomUUID()}.${validation.extension}`
    const { error: uploadError } = await supabase.storage
      .from(CERTIFICATE_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
    if (uploadError) throw new Error(uploadError.message || 'Unable to upload the corrected certificate.')

    let savedCertificate
    try {
      savedCertificate = await portfolioRepository.resubmitCertificate(id, {
        ...certificateData,
        file_path: filePath,
      })
    } catch (saveError) {
      const { error: cleanupError } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([filePath])
      if (cleanupError) {
        throw new Error(`${saveError.message || 'Unable to resubmit the certificate.'} The new private upload could not be cleaned up: ${cleanupError.message}`, { cause: saveError })
      }
      throw saveError
    }

    const warnings = []
    try {
      await syncSkillLinks('certificate_skills', 'certificate_id', savedCertificate.id, skillIds)
    } catch (linkError) {
      warnings.push('The certificate was resubmitted, but its skill links could not be updated.')
      console.error('Unable to update resubmitted certificate skill links:', linkError.message)
    }
    if (existing.file_path) {
      const { error: cleanupError } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([existing.file_path])
      if (cleanupError) {
        warnings.push('The previous private certificate file could not be removed.')
        console.error('Unable to remove the replaced private certificate file:', cleanupError.message)
      }
    }
    return { certificate: savedCertificate, warnings }
  },

  async deleteCertificate(id, studentId) {
    const { data: certificate, error: lookupError } = await supabase.from('certificates')
      .select('file_path')
      .eq('id', id)
      .eq('student_id', studentId)
      .single()
    if (lookupError) throw new Error(lookupError.message || 'Unable to find this certificate.')

    const { error } = await supabase.from('certificates').delete().eq('id', id).eq('student_id', studentId)
    if (error) throw new Error(error.message || 'Unable to delete the certificate.')
    if (certificate.file_path) {
      const { error: storageError } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([certificate.file_path])
      if (storageError) throw new Error(`Certificate deleted, but its uploaded file could not be removed: ${storageError.message}`)
    }
  },
}
