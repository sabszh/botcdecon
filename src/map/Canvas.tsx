import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera, CubeCamera, Stage, Sky } from '@react-three/drei'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'

export default function () {
  return (
    <Canvas>
      {/* <ambientLight /> */}
      <pointLight
        position={[-600, -500, 1800]}
        castShadow/>
      <PlaneMesh/>
      <ObjectMesh/>
      <PerspectiveCamera
        makeDefault
        fov={16}
        position={[0, 0, 6000]}
        near={2}
        far={12000}/>
      <OrbitControls
        // enableRotate={true}
        mouseButtons={{ LEFT: MOUSE.PAN }}
        minZoom={0.5}
        maxZoom={12}
        minDistance={300}
        maxDistance={6000}
        zoomSpeed={0.2} />
      {/* <color attach="background" args={["#d0d0d0"]} /> */}
      {/* <fog attach="fog" args={["#d0d0d0", 8, 35]} /> */}
      {/* <Sky inclination={1}/> */}
    </Canvas>
  )
}
