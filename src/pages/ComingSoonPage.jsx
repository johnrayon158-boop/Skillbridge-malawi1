import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export default function ComingSoonPage({ title = 'This area', description = 'This feature is coming in the next module.' }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">SkillBridge Malawi</p>
        <h1 className="mt-4 text-4xl font-black text-slate-900">{title}</h1>
        <p className="mt-4 text-lg text-slate-600">{description}</p>
        <div className="mt-8 flex justify-center">
          <Link to="/">
            <Button variant="primary" size="lg" className="gap-2">
              <ArrowLeft size={18} /> Go home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
