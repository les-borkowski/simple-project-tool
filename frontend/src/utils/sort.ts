export const STATUS_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, in_testing: 3, done: 4 }
export const PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

export function applySortField<T extends { status: string; priority: string; title: string; created_at: string }>(
  a: T,
  b: T,
  field: string
): number {
  if (field === 'status') return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  if (field === 'priority') return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
  if (field === 'title') return a.title.localeCompare(b.title)
  if (field === 'created_at') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  return 0
}
