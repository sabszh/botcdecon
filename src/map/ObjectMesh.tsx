import type { ThreeElements } from '@react-three/fiber'
import { Mesh } from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Bounds, Float } from '@react-three/drei'

export default function (props: ThreeElements['mesh']) {
  const { nodes } = useGLTF('/models/hippocampus.glb') as any

  const hippo = useRef<Mesh>(null!)

  useFrame((_state, delta) => {
    if (!hippo?.current) return
    hippo.current.rotation.y += delta
  })

  return (
    <Float
      rotationIntensity={0.2}
      floatIntensity={4}
      speed={3}>
      <mesh ref={hippo}
        geometry={nodes.mesh_0.geometry}
        material={nodes.mesh_0.material}
        position={[120, -320, 3600]}
        scale={15}
        {...props}>
      </mesh>
    </Float>
  )
}
