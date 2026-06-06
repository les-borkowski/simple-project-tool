import axios from 'axios'

/**
 * Extract a human-readable message from an Axios error response.
 * Returns undefined if the error is not an Axios error or has no message.
 */
export function getApiErrorMessage(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined
  return (
    err.response?.data?.error?.message ??
    err.response?.data?.detail ??
    undefined
  )
}
