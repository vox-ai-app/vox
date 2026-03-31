import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../../../features/chat/state/chatStore'

export const useMessageCache = () =>
  useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      isReady: s.isReady,
      hasMore: s.hasMore,
      loadingOlder: s.loadingOlder,
      loadOlder: s.loadOlder,
      prependCount: s.prependCount
    }))
  )
