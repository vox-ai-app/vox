import { useCallback } from 'react'

const AUTH_RECOVERY_ERROR_CODES = new Set([
  'NOT_AUTHENTICATED',
  'INVALID_SESSION',
  'INVALID_DEVICE'
])

export const getResponseErrorMessage = (errorOrResponse, fallbackMessage) =>
  errorOrResponse?.error?.message || errorOrResponse?.message || fallbackMessage

export const isAuthExpiredResponse = (errorOrResponse) => {
  const code = errorOrResponse?.error?.code || errorOrResponse?.code
  return AUTH_RECOVERY_ERROR_CODES.has(code)
}

export const useSessionRecovery = (onSessionExpired) => {
  return useCallback(
    async (response) => {
      if (!isAuthExpiredResponse(response)) {
        return false
      }

      await onSessionExpired?.()
      return true
    },
    [onSessionExpired]
  )
}
