import type { OrbitControlsChangeEvent } from '@react-three/drei'
import { Vector3, MOUSE, MeshBasicMaterial } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'

function CustomCamera () {
  const minPan = new Vector3(-333, -333, 300);
  const maxPan = new Vector3(333, 333, 6000);

  const enforcePanLimits = (e?: OrbitControlsChangeEvent) => {
    if (!e?.target?.object) return

    // e.target.object.position.clamp(minPan, maxPan)
  }

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, 6000]}
      fov={33}
      near={4}
      far={12000}>
      <OrbitControls
        onChange={enforcePanLimits}
        // enableRotate={false}
        mouseButtons={{ LEFT: MOUSE.PAN }}
        minDistance={300}
        maxDistance={6000}
        zoomSpeed={0.2}
        minPolarAngle={Math.PI / 2.5}
        maxPolarAngle={Math.PI / 1.7}
        minAzimuthAngle={-Math.PI / 8}
        maxAzimuthAngle={Math.PI / 8}
        enableDamping={true}
        dampingFactor={0.14}/>
    </PerspectiveCamera>
  )
}

export default function () {
  return (
    <Canvas shadows>
      <CustomCamera/>
      <color attach='background' args={[0x988C99]}/>
      <Background/>
      {/* <ambientLight /> */}
      <PlaneMesh receiveShadow/>
      <ObjectMesh castShadow receiveShadow/>

      <pointLight position={[-600, -500, 5000]} color={0xffffff}/>
      {/* <fog attach='fog' args={[0xefd1b5, 0, 4400]}/> */}
      <fog attach='fog' args={[0x988C99, 700, 4400]}/>
      {/* <fogExp2 attach='fog' args={[0x988C99, 0.0005]}/> */}
    </Canvas>
  )
}

const Background = () => {
  const material = new MeshBasicMaterial({ color: 'white' })

  return (
    <mesh material={material} position={[0, 0, 0]}>
      <planeGeometry args={[100000, 100000]} />
    </mesh>
  )
}
