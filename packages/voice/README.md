# @vox-ai-app/voice

ONNX-based wake word detection, keyboard shortcut registration, and voice overlay window for Vox.

## Install

```sh
npm install @vox-ai-app/voice
```

Peer dependencies: `electron >= 28`, `@picovoice/pvrecorder-node >= 1.0.0`, `onnxruntime-web >= 1.18.0`

## Requirements

- ONNX models at `resources/voice/` in the app package:
  - `melspectrogram.onnx`
  - `embedding_model.onnx`
  - `computer.onnx`
- Microphone permission — on macOS this is requested automatically via `systemPreferences.askForMediaAccess`. On other platforms the wake word worker starts without a permission prompt (OS-level mic access is assumed).

The ONNX detection pipeline (`onnxruntime-web` WASM) and `pvrecorder-node` are cross-platform. The keyboard shortcut registers as `CommandOrControl+Alt+V` (`Ctrl+Alt+V` on Windows/Linux, `Cmd+Alt+V` on macOS) with `CommandOrControl+Shift+Space` as a fallback.

## Usage

```js
import {
  initVoiceService,
  destroyVoiceService,
  setLogger,
  setOnWakeWordDetected
} from '@vox-ai-app/voice'

setLogger(logger)
setOnWakeWordDetected(() => {
  // wake word detected — open chat, start listening, etc.
  showChatWindow()
})

await initVoiceService({
  onActivate: () => showChatWindow() // also called on keyboard shortcut
})

// on app quit
await destroyVoiceService()
```

`onActivate` handles both wake word detection and the keyboard shortcut (`CommandOrControl+Alt+V`). If omitted, only the `setOnWakeWordDetected` callback fires on wake word.

## Voice Window

An always-on-top transparent overlay (400×140px, top-right corner) for displaying voice state.

```js
import { createVoiceWindow, getVoiceWindow, destroyVoiceWindow } from '@vox-ai-app/voice'

createVoiceWindow() // creates the window, loads voice.html
getVoiceWindow() // returns BrowserWindow | null
destroyVoiceWindow() // destroys it
```

## Wake word control

```js
import { pauseWakeWord, resumeWakeWord } from '@vox-ai-app/voice'

pauseWakeWord() // pause detection while user is speaking
resumeWakeWord() // resume after response
```

## Worker entry point

The wake word worker runs in a `worker_threads` Worker. Register it as a separate entry point in your build config:

```js
// electron.vite.config.js
export default {
  main: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.js',
          'voice.worker': 'node_modules/@vox-ai-app/voice/src/worker.js'
        }
      }
    }
  }
}
```

## License

MIT
