import { ArrowRight, BookOpen, BriefcaseBusiness, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    role: 'student',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }

    if (!form.email.trim()) {
      setError('Email is required.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.')
      return
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (form.role === 'employer' && !form.companyName.trim()) {
      setError('Company name is required for employer accounts.')
      return
    }

    setLoading(true)

    try {
      const result = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        companyName: form.companyName.trim(),
        role: form.role,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      setSuccess('Account created successfully. Please log in to continue.')
      setForm({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        companyName: '',
        role: 'student',
      })

      setTimeout(() => navigate('/login'), 1500)
    } catch (registerError) {
      setError(registerError.message || 'Unable to create your account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="bg-slate-900 p-8 text-white sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Create account</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight">Start shaping your future.</h1>
            <p className="mt-4 text-lg leading-8 text-slate-300">Build a stronger path with AI-guided career planning and skills evidence that employers can trust.</p>

            <div className="mt-10 space-y-4 text-sm text-slate-300">
              {['Student / graduate', 'Employer partnership', 'Administrator access'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Join</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900">Create profile</h2>
              </div>
              <Link to="/login" className="text-sm font-medium text-slate-500">Login</Link>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserRound size={16} /> Full name
                </span>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => handleChange('fullName', event.target.value)}
                  placeholder="Amina Katsonga"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <BookOpen size={16} /> Role
                </span>
                <select
                  value={form.role}
                  onChange={(event) => handleChange('role', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                >
                  <option value="student">Student / Graduate</option>
                  <option value="employer">Employer</option>
                </select>
              </label>

              {form.role === 'employer' ? (
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <BriefcaseBusiness size={16} /> Company name
                  </span>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(event) => handleChange('companyName', event.target.value)}
                    placeholder="Your company name"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-2 text-sm font-medium text-slate-700">Email address</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => handleChange('email', event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 text-sm font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => handleChange('password', event.target.value)}
                    placeholder="Create a password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 text-sm font-medium text-slate-700">Confirm</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => handleChange('confirmPassword', event.target.value)}
                    placeholder="Confirm password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                  />
                </label>
              </div>

              {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
              {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

              <Button type="submit" variant="primary" size="lg" className="mt-2 w-full gap-2" disabled={loading}>
                {loading ? 'Creating account...' : 'Get started'} <ArrowRight size={18} />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
