import type { Vector3 } from '@react-three/fiber'

import * as THREE from 'three'
import { useRef, useMemo, Suspense } from 'react'
import { Canvas, ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { OrbitControls, PerspectiveCamera, Html, Stage, useGLTF } from '@react-three/drei'

function TextureMesh (props: ThreeElements['mesh']) {
  const mesh = useRef<THREE.Mesh>(null!)

  const useTexture = (url: string) => {
    const texture = useMemo(() => new TextureLoader().load(url), [url])
    return texture
  }

  const texture = useTexture('/layers/Carte_du_tendre.jpg') // 2400 x 1721
  const geometry = useMemo(() => new THREE.PlaneGeometry(2400, 1721), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture }), [texture])

  // const onWheel = (e: ThreeEvent<WheelEvent>) => {
  //   console.log(e.distance)
  // }

  type Label = {
    name: string
    position: Vector3
  }
  const labels: Label[] = [
    { name: 'Boredom', position: [-240, 700, 30] },
    { name: 'Care', position: [340, 660, 10] },
    { name: 'Tenderness', position: [-500, 600, 22] },
    { name: 'Envy', position: [600, 600, 12] },
    { name: 'Disgust', position: [-100, 560, 10] },
    { name: 'Guilt', position: [-740, 420, 14] },
    { name: 'Playfulness', position: [660, 370, 15] },
    { name: 'Surprise', position: [-300, 290, 12] },
    { name: 'Empathy', position: [200, 280, 22] },
    { name: 'Hope', position: [-600, 240, 19] },
    { name: 'Sadness', position: [40, 190, 11] },
    { name: 'Panic', position: [400, 170, 9] },
    { name: 'Anger', position: [-334, 70, 4] },
    { name: 'Joy', position: [180, 150, 12] },
    { name: 'Love', position: [10, -70, 19] },
    { name: 'Peaceful', position: [560, -130, 13] },
    { name: 'Grief', position: [-620, -250, 8] },
    { name: 'Fear', position: [200, -370, 14] },
    { name: 'Indifference', position: [520, -470, 9] },
    { name: 'Trust', position: [-410, -410, 20] },
  ]

  return (
    <mesh
      geometry={geometry}
      material={material}
      ref={mesh}
      // onWheel={onWheel}
      {...props}>
        {labels.map((label, index) => {
          return (<Html
            key={index}
            position={label.position}
            center={true}
            distanceFactor={900} // ensures scaling with map layer
            transform // fixes to plane
            className='map-label'>
            <p>{label.name}</p>
          </Html>)
        })}
      </mesh>
  )
}

function HippoMesh () {
  const { nodes } = useGLTF('/models/hippocampus.glb') as any

  return (
    <mesh
      geometry={nodes.mesh_0.geometry}
      material={nodes.mesh_0.material}
      position={[0, 0, 900]}>
    </mesh>
  )
}

function MapCanvas () {
  return (
    <Canvas>
      <Suspense fallback={null}>
        {/* <Stage> */}
        <HippoMesh/>
        <ambientLight />
        <TextureMesh position={[0, 0, 0]}/>
        <PerspectiveCamera
          makeDefault
          position={[0, 0, 1900]}
          near={1}
          far={12000}
          zoom={1} />
        <OrbitControls
          // enableRotate={true}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN }}
          minDistance={450}
          maxDistance={4800}
          zoomSpeed={0.45} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload('/models/hippocampus.glb')

export default MapCanvas
