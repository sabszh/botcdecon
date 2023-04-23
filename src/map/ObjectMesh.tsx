import type { ThreeElements } from '@react-three/fiber'
import { Mesh } from 'three'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Float } from '@react-three/drei'

// const gltfSrc = '/models/hippocampus.glb')
// const gltfSrc = '/models/hippo-sm.gltf')
// const gltfSrc = '/models/hippo-xl.gltf')
// const gltfSrc = '/models/hippo-md.glb')
const gltfSrc = '/models/hippocampus-centered.glb'

export default function (props: ThreeElements['mesh'] & { onObjLoaded: () => void }) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  useMemo(() => {
    materials.Mat.transparent = true
    materials.Mat.opacity = 0
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo?.current) return
    hippo.current.rotation.y += delta

    if (materials.Mat.opacity !== 1) {
      materials.Mat.opacity += 0.01
    }
  })

  useEffect(() => {
    if (nodes) {
      props.onObjLoaded()
    }
  }, [])

  return (
    <Float
      rotationIntensity={0}
      floatIntensity={0}
      speed={0}>
      <mesh ref={hippo}
        geometry={nodes.Default.geometry}
        material={nodes.Default.material}
        position={[0, 64, 3600]}
        scale={1650}
        {...props}>
      </mesh>
    </Float>
  )
}

useGLTF.preload(gltfSrc)
