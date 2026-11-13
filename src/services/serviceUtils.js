export function getServiceError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return null
  const serviceError = new Error(error.message || fallback)
  if (error.name) serviceError.name = error.name
  if (error.code) serviceError.code = error.code
  if (error.status) serviceError.status = error.status
  if (error.statusCode) serviceError.statusCode = error.statusCode
  return serviceError
}

export function requireData(data, error, fallback) {
  if (error) throw getServiceError(error, fallback)
  return data
}
