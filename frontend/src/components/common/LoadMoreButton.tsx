import { useTranslation } from 'react-i18next'

interface Props {
  onLoadMore: () => void
  isLoading?: boolean
}

export function LoadMoreButton({ onLoadMore, isLoading }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center mt-4">
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
          </span>
        ) : (
          t('actions.load_more')
        )}
      </button>
    </div>
  )
}
