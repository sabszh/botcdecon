import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { Canvas, ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'

function TextureMesh (props: ThreeElements['mesh']) {
  const mesh = useRef<THREE.Mesh>(null!)

  const useTexture = (url: string) => {
    const texture = useMemo(() => new TextureLoader().load(url), [url])
    return texture
  }

  const texture = useTexture('/Carte_du_tendre.jpg') // 2400 x 1721
  const geometry = useMemo(() => new THREE.PlaneGeometry(2400, 1721), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture }), [texture])

  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    console.log(e.distance)
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      ref={mesh}
      onWheel={onWheel}
      {...props} />
  )
}

function MapCanvas () {
  return (
    <Canvas>
      <ambientLight />
      <TextureMesh position={[0, 0, 0]} />
      <PerspectiveCamera
        makeDefault
        position={[0, 0, 1900]}
        near={10}
        far={8000}
        zoom={1} />
      <OrbitControls
        enableRotate={false}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN }}
        minDistance={450}
        maxDistance={2800}
        zoomSpeed={0.3} />
    </Canvas>
  )
}

export default MapCanvas
