import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import ChatScreen from '../features/chat/components/ChatScreen'
import useChatStore from '../features/chat/state/chatStore'
import { useFoldersStore } from '../features/knowledge/hooks/useFoldersStore'
import { useIndexingController } from '../features/knowledge/hooks/useIndexingController'
import { APP_ROUTES } from './route-config'
import AppShell from '../shared/shell/AppShell'

const lazyKnowledge = () => import('../features/knowledge/pages/KnowledgePage')
const lazyActivity = () => import('../features/activity/pages/ActivityPage')
const lazyTools = () => import('../features/tools/pages/ToolsPage')
const lazySettings = () => import('../features/settings/pages/SettingsPage')

const KnowledgePage = lazy(lazyKnowledge)
const ActivityPage = lazy(lazyActivity)
const ToolsPage = lazy(lazyTools)
const SettingsPage = lazy(lazySettings)

function RouteFallback() {
  return (
    <div className="workspace-route-fallback">
      <span className="route-fallback-spinner" />
    </div>
  )
}

const noopSync = async () => false

function LocalApp() {
  const [activeRoute, setActiveRoute] = useState(APP_ROUTES.CHAT)
  const [focusedTaskId, setFocusedTaskId] = useState(null)

  const handleRouteChange = useCallback((route) => {
    if (route !== APP_ROUTES.ACTIVITY) setFocusedTaskId(null)
    setActiveRoute(route)
  }, [])

  const { folders, removeFolder, pickAndAddFolder } = useFoldersStore({
    syncSessionExpiry: noopSync
  })

  const { indexingStatus, rebuildIndexing, getIndexedChildren } = useIndexingController({
    syncSessionExpiry: noopSync
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      lazyKnowledge()
      lazyActivity()
      lazyTools()
      lazySettings()
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    useChatStore.getState().init()
    return () => useChatStore.getState().destroy()
  }, [])

  const renderRoute = () => {
    switch (activeRoute) {
      case APP_ROUTES.CHAT:
        return <ChatScreen />
      case APP_ROUTES.KNOWLEDGE:
        return (
          <Suspense fallback={<RouteFallback />}>
            <KnowledgePage
              folders={folders}
              indexingStatus={indexingStatus}
              onGetIndexedChildren={getIndexedChildren}
              onPickAndAddFolder={pickAndAddFolder}
              onRebuildIndexing={rebuildIndexing}
              onRemoveFolder={removeFolder}
            />
          </Suspense>
        )
      case APP_ROUTES.ACTIVITY:
        return (
          <Suspense fallback={<RouteFallback />}>
            <ActivityPage
              focusedTaskId={focusedTaskId}
              onClearFocus={() => setFocusedTaskId(null)}
              userId="local"
            />
          </Suspense>
        )
      case APP_ROUTES.TOOLS:
        return (
          <Suspense fallback={<RouteFallback />}>
            <ToolsPage />
          </Suspense>
        )
      case APP_ROUTES.SETTINGS:
        return (
          <Suspense fallback={<RouteFallback />}>
            <SettingsPage />
          </Suspense>
        )
      default:
        return <ChatScreen />
    }
  }

  return (
    <AppShell activeRoute={activeRoute} onRouteChange={handleRouteChange}>
      {renderRoute()}
    </AppShell>
  )
}

export default LocalApp
