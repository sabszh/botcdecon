import type { ThreeElements } from '@react-three/fiber'
import { Mesh } from 'three'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Float } from '@react-three/drei'

const gltfSrc = '/models/hippocampus.gltf'
// const gltfSrc = '/models/v002_6.gltf'
// const gltfSrc = '/models/v002_7.gltf'

export default function (props: ThreeElements['mesh'] & { onObjLoaded: () => void }) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  // console.log(nodes, materials)

  const matKey = 'Mat.2' // 'Mat.2'
  useMemo(() => {
    materials[matKey].transparent = true
    materials[matKey].opacity = 0
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo?.current) return
    hippo.current.rotation.y += delta

    if (materials[matKey].opacity !== 1) {
      materials[matKey].opacity += 0.01
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
      speed={0}
      frustumCulled={true}>
      <mesh ref={hippo}
        geometry={nodes.Default.geometry}
        material={nodes.Default.material}
        position={[0, -50, 3600]}
        scale={13}
        {...props}>
      </mesh>
    </Float>
  )
}

useGLTF.preload(gltfSrc)
