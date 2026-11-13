import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { profileService } from '../../services/profileService'
import { validateProfilePictureFile } from '../../utils/avatar'
import { Avatar } from './Avatar'
import { Button } from './Button'

export function ProfilePictureUploader({ profile, onUpdated }) {
  const { user, refreshProfile } = useAuth()
  const inputRef = useRef(null)
  const [selectedPreview, setSelectedPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const currentProfile = profile || { avatar_url: '', full_name: 'User' }

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validation = validateProfilePictureFile(file)
    if (!validation.valid) {
      setError(validation.message)
      setSelectedPreview('')
      event.target.value = ''
      return
    }

    setError('')
    setSuccess('')
    setSelectedPreview(URL.createObjectURL(file))
  }

  const uploadSelected = async () => {
    if (!user?.id) {
      setError('Please sign in before updating your profile picture.')
      return
    }

    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Please choose an image first.')
      return
    }

    const validation = validateProfilePictureFile(file)
    if (!validation.valid) {
      setError(validation.message)
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const result = await profileService.uploadAvatar(user.id, file)
      await refreshProfile(user)
      setSelectedPreview('')
      setSuccess('Profile picture updated successfully.')
      onUpdated?.(result)
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to update the profile picture.')
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    if (!user?.id) {
      setError('Please sign in before removing your profile picture.')
      return
    }

    if (!window.confirm('Remove your profile picture?')) {
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const result = await profileService.deleteAvatar(user.id)
      await refreshProfile(user)
      setSelectedPreview('')
      setSuccess('Profile picture removed.')
      onUpdated?.(result)
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove the profile picture.')
    } finally {
      setUploading(false)
    }
  }

  const previewUrl = selectedPreview || currentProfile.avatar_url

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={previewUrl} name={currentProfile.full_name || 'User'} size="lg" className="border border-slate-200 shadow-sm" />
          <div>
            <p className="text-base font-semibold text-slate-900">Profile picture</p>
            <p className="text-sm text-slate-500">JPG, PNG, or WEBP up to 2MB</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Choose profile picture"
            onChange={handleFileSelect}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Camera size={15} />
            Change picture
          </Button>
          {currentProfile.avatar_url ? (
            <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={handleRemove} disabled={uploading}>
              <Trash2 size={15} />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {selectedPreview ? (
        <div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">Selected image preview</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedPreview('')}>
              Cancel
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={selectedPreview} name={currentProfile.full_name || 'User'} size="lg" className="border border-slate-200" />
            <Button type="button" onClick={uploadSelected} disabled={uploading}>
              {uploading ? (<><Loader2 size={15} className="animate-spin" /> Uploading...</>) : 'Upload picture'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
    </div>
  )
}
