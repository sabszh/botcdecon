import { useRef, useMemo, useEffect } from 'react'
import { Group } from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const gltfSrc = '/models/hippocampus.optimized.glb'

export default function ObjectMesh(
  props: ThreeElements['mesh'] & { onObjLoaded: () => void, reducedPerformance?: boolean }
) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Group>(null!)
  const { reducedPerformance = false, ...meshProps } = props
  const model = useMemo(() => nodes?.Default?.clone(), [nodes])

  const matKey = 'Mat.2'

  useMemo(() => {
    if (!materials?.[matKey]) return
    const mat = materials[matKey]
    mat.transparent = true
    mat.opacity = 0.92
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo.current || !materials || !materials[matKey]) return
    hippo.current.rotation.y += delta * (reducedPerformance ? 0.2 : 0.55)
  })

  useEffect(() => {
    if (nodes && materials) {
      props.onObjLoaded()
    }
  }, [nodes, materials, props])

  if (!nodes || !materials || !materials[matKey] || !model) return null

  return (
    <group
      ref={hippo}
      position={[0, -50, 3600]}
      scale={13}
      frustumCulled
      {...meshProps}
    >
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(gltfSrc)
