import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'skillbridge-low-bandwidth'

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [slowConnection, setSlowConnection] = useState(false)
  const [dataSaver, setDataSaver] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  })

  useEffect(() => {
    const updateOnlineStatus = () => {
      const nextOnline = navigator.onLine !== false
      setOnline(nextOnline)

      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
      const effectiveType = connection?.effectiveType || ''
      const saveData = Boolean(connection?.saveData)
      const isSlow = !nextOnline || saveData || ['slow-2g', '2g', '3g'].includes(effectiveType)
      setSlowConnection(isSlow)
    }

    updateOnlineStatus()

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    connection?.addEventListener?.('change', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
      connection?.removeEventListener?.('change', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, String(dataSaver))
    document.documentElement.dataset.dataSaver = String(dataSaver)
  }, [dataSaver])

  return useMemo(() => ({
    online,
    slowConnection,
    dataSaver,
    setDataSaver,
  }), [online, slowConnection, dataSaver])
}
