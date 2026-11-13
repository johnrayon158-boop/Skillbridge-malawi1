import { ArrowRight, BrainCircuit, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!form.email.trim() || !form.password.trim()) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)

    try {
      const role = await login({
        email: form.email.trim(),
        password: form.password,
        rememberMe,
      })

      const routeMap = {
        student: '/student/dashboard',
        employer: '/employer/dashboard',
        admin: '/admin/dashboard',
      }

      navigate(routeMap[role] || '/student/dashboard')
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-slate-900 p-8 text-white sm:p-10 lg:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm font-medium text-sky-300">
            <BrainCircuit size={16} />
            SkillBridge Malawi
          </div>
          <h1 className="mt-8 text-4xl font-black tracking-tight">Welcome back.</h1>
          <p className="mt-4 max-w-md text-lg leading-8 text-slate-300">
            Continue your journey with AI-powered career planning, skills development, and job readiness support.
          </p>

          <div className="mt-10 space-y-4 text-sm text-slate-300">
            {['Career guidance', 'Skills gap closure', 'Job readiness tracking'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Sign in</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Access your account</h2>
            </div>
            <Link to="/" className="text-sm font-medium text-slate-500">Back home</Link>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Mail size={16} /> Email address
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock size={16} /> Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            {error ? <p role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                />
                Remember me
              </label>
              <Link to="/forgot-password" className="font-medium text-sky-700">Forgot password?</Link>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full gap-2" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'} <ArrowRight size={18} />
            </Button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-600">
            Need an account?{' '}
            <Link to="/register" className="font-semibold text-sky-700">Create one</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
