import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { Group } from 'three'

const gltfSrc = '/models/hippocampus.optimized.glb'

function SplashHippoMesh ({ reducedPerformance = false, ...props }: ThreeElements['mesh'] & { reducedPerformance?: boolean }) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Group>(null!)
  const model = useMemo(() => nodes?.Default?.clone(), [nodes])

  useMemo(() => {
    const mat = materials?.['Mat.2']
    if (!mat) return
    mat.transparent = true
    mat.opacity = 0.92
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo.current) return
    hippo.current.rotation.y += delta * (reducedPerformance ? 0.07 : 0.14)
  })

  if (!model) return null

  return (
    <group
      ref={hippo}
      position={[-35, -55, 0]}
      rotation={[-0.1, 0.22, 0.04]}
      scale={10.5}
      frustumCulled
      {...props}
    >
      <primitive object={model} />
    </group>
  )
}

function FpsThrottle ({ fps }: { fps: number }) {
  const { invalidate } = useThree()
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps)
    return () => clearInterval(id)
  }, [fps, invalidate])
  return null
}

useGLTF.preload(gltfSrc)

export default function SplashHippoCanvas ({ reducedPerformance = false }: { reducedPerformance?: boolean }) {
  return (
    <Canvas
      dpr={reducedPerformance ? [1, 1] : [1, 1.35]}
      frameloop={reducedPerformance ? 'demand' : 'always'}
      performance={{ min: 0.5 }}
      gl={{ antialias: !reducedPerformance, alpha: true, powerPreference: 'low-power' }}
      className='pointer-events-none h-full w-full'
    >
      {reducedPerformance && <FpsThrottle fps={30} />}
      <PerspectiveCamera makeDefault position={[0, 0, 1600]} fov={32} near={4} far={12000} />
      <ambientLight intensity={4.2} />
      {!reducedPerformance && <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={0.85} />}
      <SplashHippoMesh reducedPerformance={reducedPerformance} />
      <fog attach='fog' args={[0xb2a4b6, 900, 3600]} />
    </Canvas>
  )
}
