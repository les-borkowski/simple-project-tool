export function SkeletonLine({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`h-4 bg-stone-200 dark:bg-stone-700 rounded animate-pulse ${wide ? 'w-3/4' : 'w-1/2'}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-600 p-4 space-y-3">
      <SkeletonLine wide />
      <SkeletonLine />
      <div className="flex gap-2">
        <div className="h-5 w-16 bg-stone-200 dark:bg-stone-700 rounded-full animate-pulse" />
        <div className="h-5 w-12 bg-stone-200 dark:bg-stone-700 rounded-full animate-pulse" />
      </div>
    </div>
  )
}
