export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-[var(--radius-surface)] border border-slate-200 bg-white shadow-[var(--shadow-surface)] ${className}`}>
      {children}
    </div>
  )
}
