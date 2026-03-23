/* Aggregate CSS — extracted by Vite into dist/styles.css */
import './styles.css'

/* === Primitives === */
export { default as Drawer } from './primitives/Drawer'
export { ToastLayer, useToast } from './primitives/Toast'
export { default as Skeleton } from './primitives/Skeleton'
export { default as CopyButton } from './primitives/CopyButton'
export { default as ExpandableMarkdown } from './primitives/ExpandableMarkdown'
export { default as IconButton } from './primitives/IconButton'

/* === Composites === */
export { default as ChatMessage, ToolGroup } from './composites/ChatMessage'
export { default as ChatComposer } from './composites/ChatComposer'
export { default as ChatEmptyState } from './composites/ChatEmptyState'
export { default as ChatSkeleton } from './composites/ChatSkeleton'
export { default as VoiceOrb } from './composites/VoiceOrb'
export { TimelineMarker, StepItem } from './composites/ActivityTimeline'
export { default as ActivityListRow } from './composites/ActivityListRow'
export { ActionItem } from './composites/ActionItem'
export { default as ExplorerTile } from './composites/ExplorerTile'
export { default as ExplorerSidebar } from './composites/ExplorerSidebar'

/* === Layouts === */
export { default as AppShell } from './layouts/AppShell'
export { default as LeftRail } from './layouts/LeftRail'
export { default as UserMenu } from './layouts/UserMenu'

/* === Hooks === */
export { useClickOutside, useEscapeKey, useIntersectionObserver } from './hooks'

/* === Utils === */
export {
  cn,
  parseToolArgs,
  toolLabel,
  relativeTime,
  elapsedLabel,
  formatBytes,
  formatIndexedTime,
  getStatusLabel,
  PHASE,
  TERMINAL_STATUSES,
  RUNNING_STATUSES,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  PRIMARY_ARG_KEYS,
  getToolSub,
  getOutcomeBadge
} from './utils'
