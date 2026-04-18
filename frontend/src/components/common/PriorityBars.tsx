import type { Priority } from '../../services/api'

const PRIORITY_CLS: Record<Priority, string> = {
  low: 'pr-low',
  medium: 'pr-med',
  high: 'pr-high',
}

const PRIORITY_LEVEL: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export function PriorityBars({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${PRIORITY_CLS[priority]}`}>
      <span className="pr-bars" data-level={PRIORITY_LEVEL[priority]}>
        <span /><span /><span />
      </span>
      {withLabel && <span style={{ fontSize: 11, fontWeight: 500 }}>{PRIORITY_LABEL[priority]}</span>}
    </span>
  )
}
