import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, MOUSE, TOUCH } from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useContext, useMemo, useEffect, useState, useRef } from 'react'
import { AppContext, Emotion } from '../main'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'
import Memories from './Memories'
import Emotions from './Emotions'

export default function ({ onObjLoaded }: { onObjLoaded: () => void }) {
  useEffect(() => {
    onObjLoaded()
  }, [])
  return (
    <Canvas shadows='basic'>
      <CustomCamera/>
      {/* <ambientLight intensity={0.6}/> */}
      <PlaneMesh receiveShadow/>
      <Memories/>
      <Emotions/>

      <ObjectMesh onObjLoaded={onObjLoaded} castShadow receiveShadow/>

      <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={0.8}/>
      {/* <fog attach='fog' args={[0x988C99, 700, 4400]}/> */}
      <fog attach='fog' args={[0xa984ac, 700, 4400]}/>
      {/* <fog attach='fog' args={[0xdd4c3b, 700, 3400]}/> */}
    </Canvas>
  )
}

function CustomCamera () {
  const { appState, setAppState } = useContext(AppContext)

  const canInteract = useMemo(() => {
    const list = ['explore', 'pick', 'saved', 'filtered']
    return list.includes(appState.viewMode)
      && !appState.zoomIn
  }, [appState.viewMode, appState.zoomIn])

  const controls = useRef<OrbitControlsImpl>(null)
  const [zooming, setZooming] = useState(false)
  const doneZoom = () => {
    setZooming(false)
    // @ts-ignore-line
    setAppState((state) => ({ ...state, zoomIn: false }))
    setx(0)
    sety(0)
  }
  useEffect(() => {
    if (appState.zoomIn) {
      setZooming(true)
      setTimeout(() => {
        doneZoom()
      }, 2500)
    }
  }, [appState.zoomIn])

  const [x, setx] = useState(0)
  const [y, sety] = useState(0)

  const vec = new Vector3()
  useFrame((state) => {
    if (!state.camera) return
    if (!zooming) return

    state.camera.position.lerp(vec.set(x, y, 1000), 0.018)
    state.camera.updateProjectionMatrix()

    if (controls?.current) {
      controls.current.target.lerp(vec.set(x, y, 0), 0.018)
    }
    if (state.camera.position.z === 1000) {
      doneZoom()
    }
  })

  const mvCam = (focus: Emotion) => {
    setx(focus.x)
    sety(focus.y)
    // @ts-ignore-line
    setAppState(state => ({ ...state, zoomIn: true }))
  }

  useEffect(() => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, mvCam }))
  }, [])

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
        touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
        minDistance={680}
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
