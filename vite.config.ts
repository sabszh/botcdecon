import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ensure single instance of three in the bundle to avoid TDZ/cycle errors
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: process.env.VITE_SOURCEMAP === 'true'
  },
  resolve: {
    dedupe: ['three', 'react', 'react-dom', '@react-three/fiber', '@react-three/drei'],
    alias: {
      three: path.resolve(__dirname, 'node_modules/three'),
      'stats-gl': path.resolve(__dirname, 'src/shims/empty.ts')
    }
  },
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei'],
    exclude: ['stats-gl'],
    force: true
  }
})
