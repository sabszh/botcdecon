import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

export default function WebGLContextGuard () {
  const { gl, invalidate } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    let lastLostLogAt = 0
    let lastRestoredLogAt = 0
    const LOG_THROTTLE_MS = 10000

    const handleLost = (event: Event) => {
      event.preventDefault()
      const now = Date.now()
      if (now - lastLostLogAt >= LOG_THROTTLE_MS) {
        lastLostLogAt = now
        console.debug('[WebGL] Context lost; waiting for browser restore')
      }
    }

    const handleRestored = () => {
      const now = Date.now()
      if (now - lastRestoredLogAt >= LOG_THROTTLE_MS) {
        lastRestoredLogAt = now
        console.debug('[WebGL] Context restored')
      }
      invalidate()
    }

    canvas.addEventListener('webglcontextlost', handleLost, false)
    canvas.addEventListener('webglcontextrestored', handleRestored, false)

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost, false)
      canvas.removeEventListener('webglcontextrestored', handleRestored, false)
    }
  }, [gl, invalidate])

  return null
}
