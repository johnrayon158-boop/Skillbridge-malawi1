import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { supabase } from '../services/supabase'
import { getFriendlyAuthError } from '../utils/authError'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.password.trim() || !form.confirmPassword.trim()) {
      setError('Please complete both password fields.')
      return
    }

    if (form.password.length < 8) {
      setError('Please choose a stronger password.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

      if (updateError) {
        throw updateError
      }

      setSuccess('Your password has been updated successfully.')
      setForm({ password: '', confirmPassword: '' })

      setTimeout(() => navigate('/login'), 1500)
    } catch (resetError) {
      setError(getFriendlyAuthError(resetError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-10">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
          <ArrowLeft size={16} /> Back to sign in
        </Link>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Reset password</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Choose a new password</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 text-sm font-medium text-slate-700">New password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="New password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-2 text-sm font-medium text-slate-700">Confirm new password</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              placeholder="Confirm password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white"
            />
          </label>

          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
