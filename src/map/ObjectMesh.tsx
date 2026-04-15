import { useRef, useEffect } from 'react'
import { Group } from 'three'
import { useFrame } from '@react-three/fiber'
import type { ThreeElements } from '@react-three/fiber'
import { useHippocampusModel } from './hippocampusModel'

export default function ObjectMesh(
  props: ThreeElements['mesh'] & { onObjLoaded: () => void, reducedPerformance?: boolean }
) {
  const hippo = useRef<Group>(null!)
  const { reducedPerformance = false, ...meshProps } = props
  const { model, ready } = useHippocampusModel()

  useFrame((_state, delta) => {
    if (!hippo.current || !ready) return
    hippo.current.rotation.y += delta * (reducedPerformance ? 0.2 : 0.55)
  })

  useEffect(() => {
    if (ready) {
      props.onObjLoaded()
    }
  }, [props, ready])

  if (!ready || !model) return null

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
