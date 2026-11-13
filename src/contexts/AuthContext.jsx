import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { authService } from '../services/authService'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const profileRequestId = useRef(0)

  const refreshProfile = useCallback(async (currentUser) => {
    const requestId = ++profileRequestId.current

    if (!currentUser) {
      setProfile(null)
      setProfileLoading(false)
      return null
    }

    setProfileLoading(true)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, student_profiles(*)')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('Unable to load profile:', error)
      }

      const profileData = data || null
      if (requestId === profileRequestId.current) {
        setProfile(profileData)
        setProfileLoading(false)
      }
      return profileData
    } catch (error) {
      if (requestId === profileRequestId.current) {
        setProfileLoading(false)
      }
      console.error('Unable to load profile:', error)
      return null
    }
  }, [])

  const handleSessionChange = useCallback((nextSession) => {
    const nextUser = nextSession?.user ?? null
    const requestId = ++profileRequestId.current
    setSession(nextSession)
    setUser(nextUser)
    if (!nextUser) {
      setProfile(null)
      setProfileLoading(false)
    } else {
      setProfile(null)
      setProfileLoading(true)
      setTimeout(() => {
        if (requestId === profileRequestId.current) {
          refreshProfile(nextUser)
        }
      }, 0)
    }
  }, [refreshProfile])

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession()

        if (!isMounted) return

        if (error) {
          console.error('Unable to restore session:', error)
        }

        handleSessionChange(currentSession)
      } catch (error) {
        console.error('Unable to restore session:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      handleSessionChange(nextSession)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe?.()
    }
  }, [handleSessionChange])

  const isAuthenticated = Boolean(user && session)

  const login = useCallback(async ({ email, password, rememberMe = true }) => {
    const result = await authService.signIn({ email, password, rememberMe })

    if (result.error) {
      throw new Error(result.error)
    }

    await handleSessionChange(result.data?.session)
    return result.role || profile?.role || 'student'
  }, [handleSessionChange, profile?.role])

  const register = useCallback(async ({ fullName, email, password, companyName, role }) => {
    const result = await authService.signUp({
      fullName,
      email,
      password,
      companyName,
      role,
    })

    if (result.error) {
      throw new Error(result.error)
    }

    if (result.data?.user) {
      await refreshProfile(result.data.user)
    }

    return result
  }, [refreshProfile])

  const logout = useCallback(async () => {
    const result = await authService.signOut()
    if (result.error) {
      throw new Error(result.error)
    }
    setUser(null)
    setSession(null)
    setProfile(null)
    return result
  }, [])

  const resetPassword = useCallback(async (email) => {
    const result = await authService.resetPassword(email)
    if (result.error) {
      throw new Error(result.error)
    }
    return result
  }, [])

  const updateProfile = useCallback(async (nextProfile) => {
    const result = await authService.updateProfile(nextProfile)
    if (result.error) {
      throw new Error(result.error)
    }

    setProfile(result.data || nextProfile)
    return result
  }, [])

  const value = useMemo(() => ({
    user,
    session,
    profile,
    profileLoading,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    resetPassword,
    updateProfile,
    refreshProfile,
  }), [user, session, profile, profileLoading, loading, isAuthenticated, login, register, logout, resetPassword, updateProfile, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
