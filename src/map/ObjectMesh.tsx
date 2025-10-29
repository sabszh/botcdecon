import { useRef, useMemo, useEffect } from 'react'
import { Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'     // ✅ essential import
import type { ThreeElements } from '@react-three/fiber'

// ✅ Path to your GLTF model
const gltfSrc = '/models/hippocampus.gltf'

export default function ObjectMesh(
  props: ThreeElements['mesh'] & { onObjLoaded: () => void }
) {
  // Load model
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  const matKey = 'Mat.2' // Adjust if your GLTF uses a different material key

  // ✅ Defensive setup for material transparency
  useMemo(() => {
    if (materials && materials[matKey]) {
      const mat = materials[matKey]
      mat.transparent = true
      mat.opacity = 0
    }
  }, [materials])

  // ✅ Rotation + fade-in animation
  useFrame((_state, delta) => {
    if (!hippo.current || !materials || !materials[matKey]) return

    // gentle rotation
    hippo.current.rotation.y += delta * 0.12

    // smooth fade-in
    const mat = materials[matKey]
    if (mat.opacity < 1) {
      mat.opacity = Math.min(1, mat.opacity + 0.01)
    }
  })

  // ✅ Callback once object is ready
  useEffect(() => {
    if (nodes && materials) {
      props.onObjLoaded()
    }
  }, [nodes, materials, props])

  // ✅ Prevent render before ready
  if (!nodes || !materials || !materials[matKey] || !nodes.Default) return null

  return (
    <mesh
      ref={hippo}
      geometry={nodes.Default.geometry}
      material={nodes.Default.material}
      position={[0, -50, 3600]}
      scale={13}
      frustumCulled
      {...props}
    />
  )
}

// ✅ Preload GLTF for faster startup
useGLTF.preload(gltfSrc)
