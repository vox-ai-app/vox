# @vox-ai-app/ui

Shared React component library for the Vox design system. Built with Vite, exported as pre-built ESM.

## Install

```sh
npm install @vox-ai-app/ui
```

Peer dependencies: `react >= 19`, `react-dom >= 19`

## Setup

Import the base styles once in your app entry:

```js
import '@vox-ai-app/ui/styles.css'
```

## Components

### Primitives

Low-level, unstyled-ish building blocks.

```js
import {
  IconButton,
  CopyButton,
  Drawer,
  Skeleton,
  ToastLayer, useToast,
  ExpandableMarkdown
} from '@vox-ai-app/ui/primitives'
```

### Composites

Feature components built from primitives.

```js
import {
  ChatMessage, ToolGroup,
  ChatComposer,
  ChatEmptyState,
  ChatScreenMessages, groupMessages,
  ChatSkeleton,
  ActionItem,
  ActivityListRow,
  TimelineMarker, StepItem,
  ExplorerSidebar,
  ExplorerTile,
  VoiceOrb
} from '@vox-ai-app/ui/composites'
```

### Layouts

Full-page layout shells.

```js
import { AppShell, LeftRail, UserMenu } from '@vox-ai-app/ui/layouts'
```

### Hooks

```js
import {
  useClickOutside,       // fires handler on mousedown outside the returned ref
  useEscapeKey,          // fires handler when the Escape key is pressed
  useIntersectionObserver // fires callback when the returned ref enters/leaves viewport
} from '@vox-ai-app/ui/hooks'
```

```js
const ref = useClickOutside(() => setOpen(false))
return <div ref={ref}>...</div>
```

### Utils

```js
import {
  cn,                // merge Tailwind class names (clsx + twMerge)
  parseToolArgs,     // safely parse tool args from a raw JSON string or object
  toolLabel,         // human-readable label for a tool call name
  relativeTime,      // format ISO date as "3m ago", "2h ago"
  elapsedLabel,      // format elapsed time as "12s", "3m 14s"
  formatBytes,       // format byte count as "4.2 MB"
  formatIndexedTime, // format ISO date as a short locale-aware string
  getStatusLabel,    // map an indexing status key to a display string
  PHASE,             // task phase constants: IDLE, SENDING, STREAMING, …
  TERMINAL_STATUSES, // Set of statuses representing a finished task
  RUNNING_STATUSES,  // Set of statuses representing an active task
  TASK_STATUS_COLOR, // map of task status → CSS color token
  TASK_STATUS_LABEL, // map of task status → display label
  PRIMARY_ARG_KEYS,  // priority-ordered list of arg keys shown as the primary value
  getToolSub,        // get a secondary display label for a tool call
  getOutcomeBadge    // get badge variant + label for a task outcome
} from '@vox-ai-app/ui/utils'
```

### Tokens

Design tokens as JS constants or CSS custom properties.

```js
import { colors } from '@vox-ai-app/ui/tokens'
```

```css
@import '@vox-ai-app/ui/tokens.css';
/* exposes --vox-color-* custom properties */
```

## All exports

All primitives, composites, layouts, hooks, utilities, and tokens are re-exported from the package root:

```js
import {
  // primitives
  Drawer, ToastLayer, useToast, Skeleton, CopyButton, ExpandableMarkdown, IconButton,
  // composites
  ChatMessage, ToolGroup, ChatComposer, ChatEmptyState, ChatScreenMessages, groupMessages,
  ChatSkeleton, VoiceOrb, TimelineMarker, StepItem, ActivityListRow, ActionItem,
  ExplorerTile, ExplorerSidebar,
  // layouts
  AppShell, LeftRail, UserMenu,
  // layouts
  AppShell, LeftRail, UserMenu,
  // hooks
  useClickOutside, useEscapeKey, useIntersectionObserver,
  // utils
  cn, parseToolArgs, toolLabel, relativeTime, elapsedLabel, formatBytes,
  formatIndexedTime, getStatusLabel, PHASE, TERMINAL_STATUSES, RUNNING_STATUSES,
  TASK_STATUS_COLOR, TASK_STATUS_LABEL, PRIMARY_ARG_KEYS, getToolSub, getOutcomeBadge,
  // tokens
  colors, darkColors, getColors
} from '@vox-ai-app/ui'
```

## License

MIT
