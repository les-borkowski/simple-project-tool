import type { ProjectStatusResponse } from '../../services/api'

interface StatusBadgeProps {
  status: string
  statuses?: ProjectStatusResponse[]
}

export function StatusBadge({ status, statuses }: StatusBadgeProps) {
  const found = statuses?.find((s) => s.slug === status)
  const label = found?.name ?? status
  const colour = found?.colour ?? '#a8a29e'

  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: colour }}
    >
      {label}
    </span>
  )
}
