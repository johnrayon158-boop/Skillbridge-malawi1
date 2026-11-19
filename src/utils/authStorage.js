function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

export function createRememberMeStorage({
  localStorage = createMemoryStorage(),
  sessionStorage = createMemoryStorage(),
} = {}) {
  let useSessionStorage = false
  let explicitPreference = false

  return {
    setRememberMe(rememberMe) {
      useSessionStorage = !rememberMe
      explicitPreference = true
    },
    getItem(key) {
      const preferredStorage = useSessionStorage ? sessionStorage : localStorage
      const fallbackStorage = useSessionStorage ? localStorage : sessionStorage
      const preferredValue = preferredStorage.getItem(key)
      if (preferredValue !== null) return preferredValue
      const fallbackValue = fallbackStorage.getItem(key)
      if (fallbackValue !== null && !explicitPreference) {
        useSessionStorage = fallbackStorage === sessionStorage
      }
      return fallbackValue
    },
    setItem(key, value) {
      const activeStorage = useSessionStorage ? sessionStorage : localStorage
      const inactiveStorage = useSessionStorage ? localStorage : sessionStorage
      inactiveStorage.removeItem(key)
      activeStorage.setItem(key, value)
    },
    removeItem(key) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    },
  }
}
