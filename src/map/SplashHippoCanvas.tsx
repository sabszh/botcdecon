import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { Mesh } from 'three'

const gltfSrc = '/models/hippocampus.gltf'

function SplashHippoMesh (props: ThreeElements['mesh']) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  useMemo(() => {
    const mat = materials?.['Mat.2']
    if (!mat) return
    mat.transparent = true
    mat.opacity = 0.92
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo.current) return
    hippo.current.rotation.y += delta * 0.14
  })

  if (!nodes?.Default) return null

  return (
    <mesh
      ref={hippo}
      geometry={nodes.Default.geometry}
      material={nodes.Default.material}
      position={[-35, -55, 0]}
      rotation={[-0.1, 0.22, 0.04]}
      scale={10.5}
      frustumCulled
      {...props}
    />
  )
}

useGLTF.preload(gltfSrc)

export default function SplashHippoCanvas () {
  return (
    <Canvas
      dpr={[1, 1.35]}
      frameloop='always'
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      className='pointer-events-none h-full w-full'
    >
      <PerspectiveCamera makeDefault position={[0, 0, 1600]} fov={32} near={4} far={12000} />
      <ambientLight intensity={4.5} />
      <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={1} />
      <SplashHippoMesh />
      <fog attach='fog' args={[0xb2a4b6, 900, 3600]} />
    </Canvas>
  )
}
