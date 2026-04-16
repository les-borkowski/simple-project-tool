export function SkeletonLine({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${wide ? 'w-3/4' : 'w-1/2'}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3">
      <SkeletonLine wide />
      <SkeletonLine />
      <div className="flex gap-2">
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>
    </div>
  )
}
