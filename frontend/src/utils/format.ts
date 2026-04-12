import type { TFunction } from 'i18next'

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatDuration(seconds: number, t: TFunction): string {
  if (seconds < 60) return t('time.seconds', { count: Math.round(seconds) })
  if (seconds < 3600) return t('time.minutes', { count: Math.round(seconds / 60) })
  if (seconds < 86400) return t('time.hours', { count: Math.round(seconds / 3600) })
  return t('time.days', { count: Math.round(seconds / 86400) })
}
