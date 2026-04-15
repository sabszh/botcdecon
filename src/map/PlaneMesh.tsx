import { Mesh, PlaneGeometry, MeshBasicMaterial, SRGBColorSpace } from 'three'
import { useRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'

// Background-only plane: just render the large map with a neutral backdrop.
export default function ({ reducedPerformance = false, ...props }: ThreeElements['mesh'] & { reducedPerformance?: boolean }) {
  const mesh = useRef<Mesh>(null!)

  const texture = useTexture(reducedPerformance ? '/layers/carte-mobile.jpg' : '/layers/carte.jpg')
  texture.colorSpace = SRGBColorSpace
  const geometry = useMemo(() => new PlaneGeometry(14957 / 3, 9656 / 3), [])
  const material = useMemo(() => new MeshBasicMaterial({ map: texture }), [texture])

  const bgtex = useTexture('/layers/white-px.jpg')
  const bggeometry = useMemo(() => new PlaneGeometry(100_000, 100_000), [])
  const bgmaterial = useMemo(() => new MeshBasicMaterial({ map: bgtex }), [bgtex])

  return (
    <group>
      <mesh geometry={bggeometry} material={bgmaterial} position={[0, 0, -1]} />
      <mesh
        geometry={geometry}
        material={material}
        ref={mesh}
        position={[-582, 140, 0]}
        {...props}
      />
    </group>
  )
}
