import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export function LowBandwidthToggle() {
  const { dataSaver, setDataSaver, slowConnection } = useNetworkStatus()

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <WifiOff size={18} />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Low-bandwidth mode</p>
            <p className="text-sm text-slate-600">
              {slowConnection ? 'Your connection appears slow. Data saver is recommended.' : 'Reduce background traffic and large media when the connection is limited.'}
            </p>
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={dataSaver}
            onChange={(event) => setDataSaver(event.target.checked)}
          />
          <span className="h-6 w-11 rounded-full border border-slate-300 bg-slate-200 transition peer-checked:bg-sky-600" />
          <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
        </label>
      </div>
    </div>
  )
}
