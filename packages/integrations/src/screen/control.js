import { clipboard } from 'electron'
import { enqueueScreen } from './queue.js'
import {
  CHAR_CODES,
  KEY_CODES,
  LONG_TIMEOUT,
  UI_ELEMENTS_SCRIPT,
  cleanTmp,
  ensureAccessibility,
  execAbortable,
  pyCharKey,
  pyClick,
  pyDrag,
  pyGetMousePos,
  pyKeyCode,
  pyMove,
  pyScroll,
  pyTypeText,
  runPy,
  writeTmp
} from './helpers.js'
export const clickAt = ({ x, y, button = 'left', count = 1 }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    const xInt = Math.round(Number(x))
    const yInt = Math.round(Number(y))
    const btn = button === 'right' ? 'right' : 'left'
    const clicks = Math.max(1, Math.min(3, Number(count)))
    await runPy(pyClick(xInt, yInt, btn, clicks), signal)
    return {
      action: 'click',
      x: xInt,
      y: yInt,
      button: btn,
      count: clicks
    }
  })
export const moveMouse = ({ x, y }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    const xInt = Math.round(Number(x))
    const yInt = Math.round(Number(y))
    await runPy(pyMove(xInt, yInt), signal)
    return {
      action: 'move',
      x: xInt,
      y: yInt
    }
  })
export const typeText = ({ text }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    if (!text) throw new Error('"text" is required.')
    await runPy(pyTypeText(text), signal)
    return {
      action: 'type',
      length: text.length
    }
  })
export const keyPress = ({ key, modifiers = [] }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    if (!key) throw new Error('"key" is required.')
    const keyLower = String(key).toLowerCase().trim()
    const mods = (Array.isArray(modifiers) ? modifiers : [modifiers]).filter(Boolean)
    const keyCode = KEY_CODES[keyLower] ?? CHAR_CODES[keyLower]
    if (keyCode !== undefined) {
      await runPy(pyKeyCode(keyCode, mods), signal)
    } else {
      const b64 = Buffer.from(keyLower, 'utf8').toString('base64')
      await runPy(pyCharKey(b64, mods), signal)
    }
    return {
      action: 'key_press',
      key,
      modifiers: mods
    }
  })
export const scroll = ({ x, y, deltaX = 0, deltaY = -3 }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    const xInt = Math.round(Number(x))
    const yInt = Math.round(Number(y))
    const dx = Math.round(Number(deltaX))
    const dy = Math.round(Number(deltaY))
    await runPy(pyScroll(xInt, yInt, dx, dy), signal)
    return {
      action: 'scroll',
      x: xInt,
      y: yInt,
      deltaX: dx,
      deltaY: dy
    }
  })
export const drag = ({ fromX, fromY, toX, toY }, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    const x1 = Math.round(Number(fromX))
    const y1 = Math.round(Number(fromY))
    const x2 = Math.round(Number(toX))
    const y2 = Math.round(Number(toY))
    await runPy(pyDrag(x1, y1, x2, y2), signal)
    return {
      action: 'drag',
      from: {
        x: x1,
        y: y1
      },
      to: {
        x: x2,
        y: y2
      }
    }
  })
export const getMousePosition = (_, { signal } = {}) =>
  enqueueScreen(async () => {
    const { stdout } = await runPy(pyGetMousePos(), signal)
    const [x, y] = stdout.trim().split(',').map(Number)
    return {
      x: x ?? 0,
      y: y ?? 0
    }
  })
export const getUiElements = ({ app, maxElements } = {}, { signal } = {}) =>
  enqueueScreen(async () => {
    ensureAccessibility()
    const limit = Math.max(1, Math.min(1000, Number(maxElements) || 200))
    let script = UI_ELEMENTS_SCRIPT
    if (app) {
      script = UI_ELEMENTS_SCRIPT.replace(
        'var proc = se.processes.whose({ frontmost: true })[0];',
        `var proc = se.processes.whose({ name: "${String(app).replace(/"/g, '\\"')}" })[0];`
      )
    }
    const file = await writeTmp(script, 'js')
    try {
      const { stdout } = await execAbortable(
        `osascript -l JavaScript "${file}"`,
        {
          timeout: LONG_TIMEOUT
        },
        signal
      )
      const all = JSON.parse(stdout.trim())
      const elements = Array.isArray(all) ? all : (all?.elements ?? [])
      const total = elements.length
      return {
        elements: elements.slice(0, limit),
        total,
        truncated: total > limit
      }
    } catch (err) {
      throw new Error(`UI element inspection failed: ${err?.message || err}`)
    } finally {
      await cleanTmp(file)
    }
  })
export const clipboardRead = () => ({
  text: clipboard.readText()
})
export const clipboardWrite = ({ text }) => {
  clipboard.writeText(String(text || ''))
  return {
    ok: true
  }
}
export const focusApp = async ({ app }, { signal } = {}) => {
  await execAbortable(
    `open -a ${JSON.stringify(app)}`,
    {
      timeout: 10_000
    },
    signal
  )
  return {
    action: 'focus_app',
    app
  }
}
export const launchApp = async ({ app, args = [] }, { signal } = {}) => {
  const argStr =
    Array.isArray(args) && args.length
      ? ` --args ${args.map((a) => JSON.stringify(a)).join(' ')}`
      : ''
  await execAbortable(
    `open -a ${JSON.stringify(app)}${argStr}`,
    {
      timeout: 15_000
    },
    signal
  )
  return {
    action: 'launch_app',
    app
  }
}
export const listApps = async (_, { signal } = {}) => {
  const { stdout } = await execAbortable(
    'ls /Applications/',
    {
      timeout: 10_000
    },
    signal
  )
  const apps = stdout
    .trim()
    .split('\n')
    .filter((a) => a.endsWith('.app'))
    .map((a) => a.replace(/\.app$/, ''))
  return {
    apps
  }
}
