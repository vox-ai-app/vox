import { SCREEN_TOOL_DEFINITIONS } from './def.js'
import { captureFullScreen, captureRegion } from './capture/index.js'
import {
  clickAt,
  moveMouse,
  typeText,
  keyPress,
  scroll,
  drag,
  getMousePosition,
  getUiElements,
  clipboardRead,
  clipboardWrite,
  focusApp,
  launchApp,
  listApps
} from './control/index.js'
import { acquireScreen, releaseScreen } from './queue.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const platformExecutors = resolveExecutors(
  {
    darwin: {
      capture_full_screen: captureFullScreen,
      capture_region: captureRegion,
      click_at: clickAt,
      move_mouse: moveMouse,
      type_text: typeText,
      key_press: keyPress,
      scroll: scroll,
      drag: drag,
      get_mouse_position: getMousePosition,
      get_ui_elements: getUiElements,
      focus_app: focusApp,
      launch_app: launchApp,
      list_apps: listApps
    }
  },
  'Screen'
)

const executors = {
  ...platformExecutors,
  clipboard_read: (_ctx) => clipboardRead,
  clipboard_write: (_ctx) => clipboardWrite,
  acquire_screen: (_ctx) => acquireScreen,
  release_screen: (_ctx) => releaseScreen
}

export const SCREEN_TOOLS = makePlatformTools(SCREEN_TOOL_DEFINITIONS, executors)
