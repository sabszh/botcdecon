import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const devCertificatePath = path.resolve(__dirname, '.certs/dev-cert.pem')
const devKeyPath = path.resolve(__dirname, '.certs/dev-key.pem')

function readHttpsOptions () {
  if (!fs.existsSync(devCertificatePath) || !fs.existsSync(devKeyPath)) return undefined

  return {
    cert: fs.readFileSync(devCertificatePath),
    key: fs.readFileSync(devKeyPath)
  }
}

const httpsOptions = readHttpsOptions()

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: httpsOptions,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: true,
    https: httpsOptions,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  },
  build: {
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    minify: process.env.VITE_DISABLE_MINIFY === 'true' ? false : 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'three-core': ['three', '@react-three/fiber', '@react-three/drei']
        }
      }
    },
    commonjsOptions: {
      include: [/stats-gl/, /node_modules/]
    }
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
      { find: 'three', replacement: path.resolve(__dirname, 'node_modules/three') },
      { find: /^three\/src\/.*/, replacement: 'three' },
      { find: /^stats-gl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/core\/StatsGl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/web\/StatsGl$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') },
      { find: /^@react-three\/drei\/web\/Stats$/, replacement: path.resolve(__dirname, 'src/shims/empty.ts') }
    ]
  },
  optimizeDeps: {
    exclude: ['stats-gl'],
    force: true
  }
})
