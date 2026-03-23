import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.js'),
        'primitives/index': resolve(__dirname, 'src/primitives/index.js'),
        'composites/index': resolve(__dirname, 'src/composites/index.js'),
        'layouts/index': resolve(__dirname, 'src/layouts/index.js'),
        'hooks/index': resolve(__dirname, 'src/hooks/index.js'),
        'utils/index': resolve(__dirname, 'src/utils/index.js')
      },
      formats: ['es']
    },
    cssFileName: 'styles',
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@info-arnav/vox-tokens',
        '@info-arnav/vox-tokens/css'
      ]
    },
    outDir: 'dist',
    emptyOutDir: true
  }
})
