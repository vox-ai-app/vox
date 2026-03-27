import { useCallback, useEffect, useState } from 'react'
import { getResponseErrorMessage } from '../../../shared/hooks/useSessionRecovery'

export const useFoldersStore = ({ syncSessionExpiry }) => {
  const [folders, setFolders] = useState([])

  useEffect(() => {
    let disposed = false

    window.api.indexing
      .getFolders()
      .then(async (data) => {
        const nextFolders = Array.isArray(data?.folders)
          ? data.folders.filter((item) => typeof item === 'string' && item.trim())
          : []

        if (!disposed) {
          setFolders(nextFolders)
        }
      })
      .catch(async (err) => {
        await syncSessionExpiry(err)
      })

    return () => {
      disposed = true
    }
  }, [syncSessionExpiry])

  const addFolder = useCallback(
    async (folderPath) => {
      const normalizedPath = String(folderPath || '').trim()

      if (!normalizedPath) {
        return {
          success: false,
          message: 'Folder path is required.'
        }
      }

      try {
        const data = await window.api.indexing.addFolder(normalizedPath)
        if (Array.isArray(data?.folders)) {
          setFolders(data.folders.filter((item) => typeof item === 'string' && item.trim()))
        }
        return { success: true, message: 'Folder added.' }
      } catch (err) {
        const didExpire = await syncSessionExpiry(err)
        if (didExpire) {
          return { success: false, message: 'Session expired. Please sign in again.' }
        }
        return {
          success: false,
          message: getResponseErrorMessage(err, 'Unable to add folder.')
        }
      }
    },
    [syncSessionExpiry]
  )

  const removeFolder = useCallback(
    async (folderPath) => {
      try {
        const data = await window.api.indexing.removeFolder(folderPath)
        if (Array.isArray(data?.folders)) {
          setFolders(data.folders.filter((item) => typeof item === 'string' && item.trim()))
        } else {
          setFolders((currentFolders) => currentFolders.filter((folder) => folder !== folderPath))
        }
        return { success: true, message: 'Folder removed. Indexed data removed.' }
      } catch (err) {
        const didExpire = await syncSessionExpiry(err)
        if (didExpire) {
          return { success: false, message: 'Session expired. Please sign in again.' }
        }
        return {
          success: false,
          message: getResponseErrorMessage(err, 'Unable to remove indexed folder data.')
        }
      }
    },
    [syncSessionExpiry]
  )

  const pickAndAddFolder = useCallback(async () => {
    try {
      const data = await window.api.indexing.pickFolder()
      const pickedPath = String(data?.path || '').trim()
      if (!pickedPath) {
        return { success: false, message: 'Folder selection cancelled.' }
      }
      return addFolder(pickedPath)
    } catch (err) {
      const didExpire = await syncSessionExpiry(err)
      if (didExpire) {
        return { success: false, message: 'Session expired. Please sign in again.' }
      }
      return {
        success: false,
        message: getResponseErrorMessage(err, 'Unable to open folder picker.')
      }
    }
  }, [addFolder, syncSessionExpiry])

  return {
    folders,
    addFolder,
    removeFolder,
    pickAndAddFolder
  }
}
