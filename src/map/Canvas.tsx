import type { OrbitControlsChangeEvent } from '@react-three/drei'
import { Vector3, MOUSE, MeshBasicMaterial } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useContext, useMemo } from 'react'
import { AppContext } from '../main'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'

export default function ({ onObjLoaded }: { onObjLoaded: () => void }) {
  return (
    <Canvas shadows='basic'>
      <CustomCamera/>
      <Background/>
      {/* <ambientLight /> */}
      <PlaneMesh receiveShadow/>
      <ObjectMesh onObjLoaded={onObjLoaded} castShadow receiveShadow/>

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
    <mesh material={material} position={[0, 0, -1]}>
      <planeGeometry args={[100000, 100000]} />
    </mesh>
  )
}

function CustomCamera () {
  const { appState } = useContext(AppContext)
  const canInteract = useMemo(() => {
    return appState.viewMode === 'pick' || appState.viewMode === 'explore'
  }, [appState.viewMode])
  // const minPan = new Vector3(-333, -333, 300);
  // const maxPan = new Vector3(333, 333, 6000);

  // const enforcePanLimits = (e?: OrbitControlsChangeEvent) => {
  //   if (!e?.target?.object) return

  //   e.target.object.position.clamp(minPan, maxPan)
  // }

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, 5500]}
      fov={33}
      near={4}
      far={12000}>
      <OrbitControls
        // onChange={enforcePanLimits}
        // enableRotate={false}
        enabled={canInteract}
        mouseButtons={{ LEFT: MOUSE.PAN }}
        minDistance={300}
        maxDistance={6000}
        zoomSpeed={0.53}
        minPolarAngle={Math.PI / 2.5}
        maxPolarAngle={Math.PI / 1.7}
        minAzimuthAngle={-Math.PI / 8}
        maxAzimuthAngle={Math.PI / 8}
        enableDamping={true}
        dampingFactor={0.03}/>
    </PerspectiveCamera>
  )
}
