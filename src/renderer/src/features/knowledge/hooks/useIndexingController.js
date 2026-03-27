import { useCallback, useEffect, useState } from 'react'
import { getResponseErrorMessage } from '../../../shared/hooks/useSessionRecovery'
import { EMPTY_INDEXING_STATUS, normalizeIndexingStatus } from '../utils/indexing.utils'

export const useIndexingController = ({ syncSessionExpiry }) => {
  const [indexingStatus, setIndexingStatus] = useState(EMPTY_INDEXING_STATUS)

  const refreshIndexingStatus = useCallback(async () => {
    try {
      const data = await window.api.indexing.getStatus()
      setIndexingStatus(normalizeIndexingStatus(data?.status))
      return { success: true }
    } catch (err) {
      await syncSessionExpiry(err)
      return {
        success: false,
        message: getResponseErrorMessage(err, 'Unable to read indexing status.')
      }
    }
  }, [syncSessionExpiry])

  const rebuildIndexing = useCallback(async () => {
    try {
      const data = await window.api.indexing.rebuild()
      setIndexingStatus(normalizeIndexingStatus(data?.status))
      return { success: true, message: 'Index rebuild started.' }
    } catch (err) {
      const didExpire = await syncSessionExpiry(err)
      if (didExpire) {
        return { success: false, message: 'Session expired. Please sign in again.' }
      }
      return {
        success: false,
        message: getResponseErrorMessage(err, 'Unable to rebuild the index.')
      }
    }
  }, [syncSessionExpiry])

  const getIndexedChildren = useCallback(
    async (folderPath, basePath = '') => {
      try {
        const data = await window.api.indexing.getIndexedChildren(folderPath, basePath)
        return {
          success: true,
          folderPath: data?.folderPath || folderPath,
          basePath: data?.basePath || basePath || folderPath,
          children: Array.isArray(data?.children) ? data.children : []
        }
      } catch (err) {
        const didExpire = await syncSessionExpiry(err)
        if (didExpire) {
          return {
            success: false,
            message: 'Session expired. Please sign in again.',
            children: []
          }
        }
        return {
          success: false,
          message: getResponseErrorMessage(err, 'Unable to load indexed files.'),
          children: []
        }
      }
    },
    [syncSessionExpiry]
  )

  useEffect(() => {
    let disposed = false

    window.api.indexing
      .getStatus()
      .then(async (data) => {
        if (!disposed) {
          setIndexingStatus(normalizeIndexingStatus(data?.status))
        }
      })
      .catch(async (err) => {
        await syncSessionExpiry(err)
      })

    return () => {
      disposed = true
    }
  }, [syncSessionExpiry])

  useEffect(() => {
    return window.api.indexing.onStatusChange((status) => {
      setIndexingStatus(normalizeIndexingStatus(status))
    })
  }, [])

  return {
    indexingStatus,
    refreshIndexingStatus,
    rebuildIndexing,
    getIndexedChildren
  }
}
