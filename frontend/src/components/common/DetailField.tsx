export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Label above the control below lg: the rail lays its fields two across on a
    // phone, and a fixed 80px label track inside a ~160px cell would leave the
    // control 68px — about four characters at the 16px font size T02 forces on
    // every <select> below md. At lg the fixed track returns, unchanged.
    <div className="grid grid-cols-1 lg:grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-ui-xs uppercase tracking-wider text-stone-400 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}
