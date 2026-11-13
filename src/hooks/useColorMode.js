import { useContext } from 'react'
import { ColorModeContext } from '../contexts/ColorModeContext'

export function useColorMode() {
  const context = useContext(ColorModeContext)
  if (!context) throw new Error('useColorMode must be used within ColorModeProvider.')
  return context
}
