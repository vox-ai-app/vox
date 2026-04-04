import { resolve } from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

const EXTRA_EXTERNALS = [
  'better-sqlite3',
  'onnxruntime-node',
  '@huggingface/transformers',
  'sharp',
  '@picovoice/pvrecorder-node'
]

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: EXTRA_EXTERNALS,
        input: {
          index: resolve('src/main/index.js'),
          'stt.worker': resolve('src/main/voice/stt.worker.js'),
          'voice.worker': require.resolve('@vox-ai-app/voice/worker'),
          'indexing.parser.worker': require.resolve('@vox-ai-app/indexing/parser/worker'),
          'indexing.process': require.resolve('@vox-ai-app/indexing/process/entry')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/index.html'),
          voice: resolve('src/renderer/voice.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
