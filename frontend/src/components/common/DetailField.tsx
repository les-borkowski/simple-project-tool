export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}
