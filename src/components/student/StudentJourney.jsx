import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STUDENT_STAGES } from './studentJourneyData'

export function StudentJourney({ currentStage = 0 }) {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-7">
        {STUDENT_STAGES.map(([label, to], index) => (
          <div key={label} className="min-w-0">
            <Link to={to} className="group flex min-w-0 flex-col items-center gap-2 text-center">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${index < currentStage ? 'border-emerald-500 bg-emerald-500 text-white' : index === currentStage ? 'border-sky-600 bg-sky-600 text-white ring-4 ring-sky-100' : 'border-slate-300 bg-white text-slate-500 group-hover:border-sky-400'}`}>
                {index < currentStage ? <Check size={15} /> : index + 1}
              </span>
              <span className={`break-words text-[11px] font-medium ${index === currentStage ? 'text-sky-700' : 'text-slate-500'}`}>{label}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
