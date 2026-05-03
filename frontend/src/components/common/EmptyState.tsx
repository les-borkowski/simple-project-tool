interface Props {
  message: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ message, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-stone-400 dark:text-stone-400">
      <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="text-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-4 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-md hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
