import { useRef, useMemo, useEffect } from 'react'
import { Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { Float, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const gltfSrc = '/models/hippocampus.gltf'

export default function ObjectMesh(
  props: ThreeElements['mesh'] & { onObjLoaded: () => void }
) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  const matKey = 'Mat.2'

  useMemo(() => {
    if (!materials?.[matKey]) return
    const mat = materials[matKey]
    mat.transparent = true
    mat.opacity = 0.92
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo.current || !materials || !materials[matKey]) return

    hippo.current.rotation.y += delta
  })

  useEffect(() => {
    if (nodes && materials) {
      props.onObjLoaded()
    }
  }, [nodes, materials, props])

  if (!nodes || !materials || !materials[matKey] || !nodes.Default) return null

  return (
    <Float
      rotationIntensity={0}
      floatIntensity={0}
      speed={0}
      frustumCulled>
      <mesh
        ref={hippo}
        geometry={nodes.Default.geometry}
        material={nodes.Default.material}
        position={[0, -50, 3600]}
        scale={13}
        {...props}
      />
    </Float>
  )
}

useGLTF.preload(gltfSrc)
