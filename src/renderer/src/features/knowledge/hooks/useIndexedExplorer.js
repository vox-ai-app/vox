import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EMPTY_NODE_STATE,
  compareExplorerNodes,
  getNodeKey,
  getPathLabel,
  getStatusLabel
} from '../components/explorer/explorer.utils'

export function useIndexedExplorer({ folders, onGetIndexedChildren }) {
  const [selectedRoot, setSelectedRoot] = useState('')
  const [pathStack, setPathStack] = useState([])
  const [rootStateByFolder, setRootStateByFolder] = useState({})
  const [nodeStateByKey, setNodeStateByKey] = useState({})
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)

  const loadNode = useCallback(
    async (rootPath, nodePath) => {
      const nodeKey = getNodeKey(rootPath, nodePath)

      if (!onGetIndexedChildren) {
        const message = 'Indexed explorer is unavailable.'
        setNodeStateByKey((current) => ({
          ...current,
          [nodeKey]: { loading: false, loaded: false, error: message, children: [] }
        }))
        return { success: false, message }
      }

      setNodeStateByKey((current) => ({
        ...current,
        [nodeKey]: {
          ...(current[nodeKey] || EMPTY_NODE_STATE),
          loading: true,
          loaded: false,
          error: ''
        }
      }))

      const result = await onGetIndexedChildren(rootPath, nodePath)
      if (!result?.success) {
        const message = result?.message || 'Failed to load indexed files.'
        setNodeStateByKey((current) => ({
          ...current,
          [nodeKey]: { loading: false, loaded: false, error: message, children: [] }
        }))
        return { success: false, message }
      }

      const children = Array.isArray(result.children) ? result.children : []
      setNodeStateByKey((current) => ({
        ...current,
        [nodeKey]: { loading: false, loaded: true, error: '', children }
      }))
      return { success: true, children }
    },
    [onGetIndexedChildren]
  )

  useEffect(() => {
    let disposed = false

    const hydrateRoots = async () => {
      if (!folders.length) {
        setSelectedRoot('')
        setPathStack([])
        setRootStateByFolder({})
        setNodeStateByKey({})
        setSelectedFile(null)
        return
      }

      setRootStateByFolder(
        folders.reduce((acc, fp) => {
          acc[fp] = { loading: true, loaded: false, hasIndexedChildren: false, error: '' }
          return acc
        }, {})
      )

      if (!onGetIndexedChildren) {
        if (disposed) return
        const state = folders.reduce((acc, fp) => {
          acc[fp] = {
            loading: false,
            loaded: false,
            hasIndexedChildren: false,
            error: 'Indexed explorer is unavailable.'
          }
          return acc
        }, {})
        setRootStateByFolder(state)
        setNodeStateByKey({})
        setPathStack([])
        setSelectedFile(null)
        setSelectedRoot((current) => (folders.includes(current) ? current : ''))
        return
      }

      const fetches = await Promise.all(
        folders.map(async (fp) => ({ fp, result: await onGetIndexedChildren(fp, fp) }))
      )

      if (disposed) return

      const nextRootState = {}
      const nextNodeState = {}

      for (const { fp, result } of fetches) {
        const nodeKey = getNodeKey(fp, fp)
        if (!result?.success) {
          const message = result?.message || 'Failed to load indexed files.'
          nextRootState[fp] = {
            loading: false,
            loaded: false,
            hasIndexedChildren: false,
            error: message
          }
          nextNodeState[nodeKey] = { loading: false, loaded: false, error: message, children: [] }
          continue
        }
        const children = Array.isArray(result.children) ? result.children : []
        nextRootState[fp] = {
          loading: false,
          loaded: true,
          hasIndexedChildren: children.length > 0,
          error: ''
        }
        nextNodeState[nodeKey] = { loading: false, loaded: true, error: '', children }
      }

      setRootStateByFolder(nextRootState)
      setNodeStateByKey(nextNodeState)
      setPathStack([])
      setSelectedFile(null)
      setSelectedRoot((current) => (folders.includes(current) ? current : ''))
    }

    void hydrateRoots()
    return () => {
      disposed = true
    }
  }, [folders, onGetIndexedChildren, refreshToken])

  const activePath = pathStack.length ? pathStack[pathStack.length - 1].path : selectedRoot
  const activeNodeKey = selectedRoot ? getNodeKey(selectedRoot, activePath) : ''
  const activeNodeState = (activeNodeKey ? nodeStateByKey[activeNodeKey] : null) || EMPTY_NODE_STATE

  const explorerItems = useMemo(
    () =>
      Array.isArray(activeNodeState.children)
        ? [...activeNodeState.children].sort(compareExplorerNodes)
        : [],
    [activeNodeState.children]
  )

  const isLoadingRootData = folders.some((fp) => rootStateByFolder[fp]?.loading)
  const canGoBack = Boolean(selectedRoot)
  const currentTitle = selectedRoot ? getPathLabel(activePath) : 'Indexed Files'
  const currentPathDescription = selectedRoot
    ? activePath
    : 'Select a starting folder to explore indexed files.'

  const handleOpenRoot = (folderPath) => {
    setSelectedFile(null)
    setSelectedRoot(folderPath)
    setPathStack([])
  }

  const handleOpenDirectory = async (node) => {
    if (!selectedRoot) return
    setSelectedFile(null)
    setPathStack((current) => [...current, { name: node.name, path: node.path }])
    const nodeKey = getNodeKey(selectedRoot, node.path)
    const cached = nodeStateByKey[nodeKey]
    if (cached?.loading || cached?.loaded) return
    await loadNode(selectedRoot, node.path)
  }

  const handleGoBack = () => {
    if (!canGoBack) return
    setSelectedFile(null)
    if (pathStack.length > 0) {
      setPathStack((current) => current.slice(0, -1))
    } else {
      setSelectedRoot('')
    }
  }

  const handleRefresh = () => {
    setSelectedFile(null)
    setRefreshToken((current) => current + 1)
  }

  return {
    selectedFile,
    setSelectedFile,
    selectedRoot,
    explorerItems,
    activeNodeState,
    isLoadingRootData,
    canGoBack,
    currentTitle,
    currentPathDescription,
    handleOpenRoot,
    handleOpenDirectory,
    handleGoBack,
    handleRefresh,
    getPathLabel,
    getStatusLabel
  }
}
