import { useMemo, useState } from 'react'
import { buildInitials } from '../../utils/avatar'

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

export function Avatar({ src, name = 'User', size = 'md', className = '', ...props }) {
  const [hasError, setHasError] = useState(false)
  const initials = useMemo(() => buildInitials(name), [name])
  const finalSize = SIZE_CLASSES[size] || SIZE_CLASSES.md

  if (src && !hasError) {
    return (
      <div className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-sky-100 ring-2 ring-white ${finalSize} ${className}`}>
        <img
          src={src}
          alt={`${name} profile`}
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
          {...props}
        />
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-sky-100 font-semibold text-sky-700 ${finalSize} ${className}`}>
      <span>{initials}</span>
    </div>
  )
}
