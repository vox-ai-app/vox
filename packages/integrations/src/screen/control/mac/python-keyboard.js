const MOD_FLAGS_PY = `MOD_FLAGS = {
    'command': Quartz.kCGEventFlagMaskCommand,
    'cmd': Quartz.kCGEventFlagMaskCommand,
    'shift': Quartz.kCGEventFlagMaskShift,
    'option': Quartz.kCGEventFlagMaskAlternate,
    'alt': Quartz.kCGEventFlagMaskAlternate,
    'control': Quartz.kCGEventFlagMaskControl,
    'ctrl': Quartz.kCGEventFlagMaskControl,
}`

export const pyTypeText = (text) => {
  const b64 = Buffer.from(text, 'utf8').toString('base64')
  return `
import Quartz, time, base64

CHAR_TO_KEYCODE = {
    'a': 0, 's': 1, 'd': 2, 'f': 3, 'h': 4, 'g': 5, 'z': 6, 'x': 7, 'c': 8,
    'v': 9, 'b': 11, 'q': 12, 'w': 13, 'e': 14, 'r': 15, 'y': 16, 't': 17,
    '1': 18, '2': 19, '3': 20, '4': 21, '6': 22, '5': 23, '9': 25, '7': 26,
    '8': 28, '0': 29, 'o': 31, 'u': 32, 'i': 34, 'p': 35, 'l': 37, 'j': 38,
    'k': 40, 'n': 45, 'm': 46, ',': 43, '.': 47, '/': 44, ';': 41, "'": 39,
    '[': 33, ']': 30, '\\\\': 42, '-': 27, '=': 24, '\`': 50, ' ': 49,
}
SHIFT_CHAR_MAP = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7',
    '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']',
    '|': '\\\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '\`',
}

text = base64.b64decode('${b64}').decode('utf-8')
src = Quartz.CGEventSourceCreate(Quartz.kCGEventSourceStateHIDSystemState)
for char in text:
    lower = char.lower()
    needs_shift = char.isupper() or char in SHIFT_CHAR_MAP
    lookup = SHIFT_CHAR_MAP.get(char, lower)
    keycode = CHAR_TO_KEYCODE.get(lookup, None)

    if char == '\\n' or char == '\\r':
        keycode = 36
        needs_shift = False

    if char == '\\t':
        keycode = 48
        needs_shift = False

    if keycode is not None:
        e = Quartz.CGEventCreateKeyboardEvent(src, keycode, True)
        if needs_shift:
            Quartz.CGEventSetFlags(e, Quartz.kCGEventFlagMaskShift)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.01)
        e = Quartz.CGEventCreateKeyboardEvent(src, keycode, False)
        if needs_shift:
            Quartz.CGEventSetFlags(e, Quartz.kCGEventFlagMaskShift)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
    else:
        e = Quartz.CGEventCreateKeyboardEvent(src, 0, True)
        Quartz.CGEventKeyboardSetUnicodeString(e, 1, char)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.01)
        e = Quartz.CGEventCreateKeyboardEvent(src, 0, False)
        Quartz.CGEventKeyboardSetUnicodeString(e, 1, char)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
    time.sleep(0.02)
`
}

export const pyKeyCode = (keyCode, mods) => `
import Quartz, time
${MOD_FLAGS_PY}
flags = 0
for m in ${JSON.stringify(mods)}:
    flags |= MOD_FLAGS.get(m.lower(), 0)
src = Quartz.CGEventSourceCreate(Quartz.kCGEventSourceStateHIDSystemState)
e = Quartz.CGEventCreateKeyboardEvent(src, ${keyCode}, True)
if flags:
    Quartz.CGEventSetFlags(e, flags)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
time.sleep(0.05)
e = Quartz.CGEventCreateKeyboardEvent(src, ${keyCode}, False)
if flags:
    Quartz.CGEventSetFlags(e, flags)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
`

export const pyCharKey = (b64, mods) => `
import Quartz, time, base64
${MOD_FLAGS_PY}
flags = 0
for m in ${JSON.stringify(mods)}:
    flags |= MOD_FLAGS.get(m.lower(), 0)
text = base64.b64decode('${b64}').decode('utf-8')
src = Quartz.CGEventSourceCreate(Quartz.kCGEventSourceStateHIDSystemState)
for char in text:
    e = Quartz.CGEventCreateKeyboardEvent(src, 0, True)
    Quartz.CGEventKeyboardSetUnicodeString(e, 1, char)
    if flags:
        Quartz.CGEventSetFlags(e, flags)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
    time.sleep(0.01)
    e = Quartz.CGEventCreateKeyboardEvent(src, 0, False)
    Quartz.CGEventKeyboardSetUnicodeString(e, 1, char)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
    time.sleep(0.02)
`
