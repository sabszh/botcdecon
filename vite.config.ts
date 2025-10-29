import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ✅ FINAL FIXED CONFIG — prevents TDZ and "Cannot access 'le'" errors
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    minify: process.env.VITE_DISABLE_MINIFY === 'true' ? false : 'esbuild',
    commonjsOptions: {
      include: [/stats-gl/, /node_modules/],
    },
  },
  resolve: {
    dedupe: [
      'three',
      'react',
      'react-dom',
      '@react-three/fiber',
      '@react-three/drei'
    ],
    alias: [
      // Force single Three instance
      { find: 'three', replacement: path.resolve(__dirname, 'node_modules/three') },
      { find: /^three\/src\/.*/, replacement: 'three' },

      // ✅ Safely shim stats-gl and its Drei references
      { find: /^stats-gl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/core\/StatsGl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/web\/StatsGl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/web\/Stats$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
    ],
  },
  optimizeDeps: {
    exclude: ['stats-gl'],
    force: true,
  },
})
