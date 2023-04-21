import { Vector3, MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrbitControlsChangeEvent } from '@react-three/drei'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'

function CustomCamera () {
  const minPan = new Vector3(-333, -333, 300);
  const maxPan = new Vector3(333, 333, 6000);

  const enforcePanLimits = (e?: OrbitControlsChangeEvent) => {
    if (!e?.target?.object) return

    e.target.object.position.clamp(minPan, maxPan)
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
        enableRotate={false}
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

      {/* <ambientLight /> */}
      <pointLight position={[-600, -500, 5000]}/>
      <PlaneMesh castShadow/>
      <ObjectMesh castShadow/>

      {/* <color attach="background" args={["#d0d0d0"]} /> */}
      {/* <fog attach="fog" args={["#d0d0d0", 8, 35]} /> */}
    </Canvas>
  )
}
