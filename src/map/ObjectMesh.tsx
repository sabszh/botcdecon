import type { ThreeElements } from '@react-three/fiber'
import { Mesh } from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Float } from '@react-three/drei'

export default function (props: ThreeElements['mesh']) {
  // const { nodes } = useGLTF('/models/hippocampus.glb') as any
  // const { nodes } = useGLTF('/models/hippo-sm.gltf') as any
  // const { nodes } = useGLTF('/models/hippo-xl.gltf') as any
  // const { nodes } = useGLTF('/models/hippo-md.glb') as any
  const { nodes } = useGLTF('/models/hippocampus-centered.glb') as any

  const hippo = useRef<Mesh>(null!)

  useFrame((_state, delta) => {
    if (!hippo?.current) return
    hippo.current.rotation.y += delta
  })

  return (
    <Float
      rotationIntensity={0}
      floatIntensity={0}
      speed={0}>
      <mesh ref={hippo}
        geometry={nodes.Default.geometry}
        material={nodes.Default.material}
        position={[0, 0, 3600]}
        scale={1650}
        {...props}>
      </mesh>
    </Float>
  )
}
