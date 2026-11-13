const MAX_PROJECT_IMAGE_SIZE = 10 * 1024 * 1024

const PROJECT_IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
})

export function validateProjectImageFile(file) {
  if (!file) return { valid: false, message: 'Choose an image for your project.' }
  if (!Object.hasOwn(PROJECT_IMAGE_EXTENSIONS, file.type)) {
    return { valid: false, message: 'Project images must be JPEG, PNG, WebP, AVIF, GIF, HEIC or HEIF.' }
  }
  if (file.size > MAX_PROJECT_IMAGE_SIZE) {
    return { valid: false, message: 'Project images must be 10 MB or smaller.' }
  }
  return { valid: true, extension: PROJECT_IMAGE_EXTENSIONS[file.type] }
}
