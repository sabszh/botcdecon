import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, MOUSE } from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useContext, useMemo, useEffect, useState, useRef } from 'react'
import { AppContext } from '../main'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'
import Memories from './Memories'

export default function ({ onObjLoaded }: { onObjLoaded: () => void }) {
  return (
    <Canvas shadows='basic'>
      <CustomCamera/>
      {/* <ambientLight intensity={0.6}/> */}
      <PlaneMesh receiveShadow/>
      <Memories/>
      <ObjectMesh onObjLoaded={onObjLoaded} castShadow receiveShadow/>

      <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={0.6}/>
      <fog attach='fog' args={[0x988C99, 700, 4400]}/>
    </Canvas>
  )
}

function CustomCamera () {
  const { appState, setAppState } = useContext(AppContext)
  const canInteract = useMemo(() => {
    const list = ['explore', 'pick', 'saved']
    return list.includes(appState.viewMode)
      && !appState.zoomIn
  }, [appState.viewMode, appState.zoomIn])

  const controls = useRef<OrbitControlsImpl>(null)
  const [zooming, setZooming] = useState(false)
  const doneZoom = () => {
    setZooming(false)
    // @ts-ignore-line
    setAppState((state) => ({ ...state, zoomIn: false }))
  }
  useEffect(() => {
    if (appState.zoomIn) {
      setZooming(true)
      setTimeout(() => {
        doneZoom()
      }, 2500)
    }
  }, [appState.zoomIn])

  const vec = new Vector3()
  useFrame((state) => {
    if (!state.camera) return
    if (!zooming) return

    state.camera.position.lerp(vec.set(0, 0, 900), 0.018)
    state.camera.updateProjectionMatrix()

    if (controls?.current) {
      controls.current.target.lerp(vec.set(0, 0, 0), 0.018)
    }
    if (state.camera.position.z === 900) {
      doneZoom()
    }
  })

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, 5500]}
      fov={33}
      near={4}
      far={12000}>
      <OrbitControls
        ref={controls}
        enableRotate={false}
        enabled={canInteract}
        mouseButtons={{ LEFT: MOUSE.PAN }}
        minDistance={380}
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
