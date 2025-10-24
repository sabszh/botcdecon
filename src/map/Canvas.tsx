import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, MOUSE, TOUCH } from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useContext, useMemo, useEffect, useState, useRef } from 'react'
import { AppContext, Emotion } from '../context/AppContext'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'
// Removed Memories/Emotions to avoid router dependency and ensure background renders

export default function ({ onObjLoaded }: { onObjLoaded: () => void }) {
  const { appState, setAppState } = useContext(AppContext)

  useEffect(() => {
    onObjLoaded()
  }, [])

  function pointerDown () {
    if (appState.zoomIn) {
      // @ts-ignore-line
      setAppState((state) => ({ ...state, zoomIn: false }))
    }
  }

  return (
    <Canvas shadows='basic' onPointerDown={pointerDown}>
      {/* Near-white with a subtle purple tint */}
      <color attach='background' args={['#f6f2fa']} />
      <CustomCamera/>
      <ambientLight intensity={5}/>
      <PlaneMesh receiveShadow/>

      <ObjectMesh onObjLoaded={onObjLoaded} castShadow receiveShadow/>

      <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={1}/>
      {/* Fog matching the subtle purple-tinted background */}
      <fog attach='fog' args={[0xf6f2fa, 700, 4400]}/>
    </Canvas>
  )
}

function CustomCamera () {
  const { appState, setAppState } = useContext(AppContext)

  const canInteract = useMemo(() => {
    // Allow limited interaction in all modes except when zooming
    return !appState.zoomIn
  }, [appState.zoomIn])

  const controls = useRef<OrbitControlsImpl>(null)
  const [zooming, setZooming] = useState(false)
  const doneZoom = () => {
    setZooming(false)
    // @ts-ignore-line
    setAppState((state) => ({ ...state, zoomIn: false }))
    setx(0)
    sety(0)
    setz(1200)
  }
  const [timer, setTimer] = useState<number>()
  useEffect(() => {
    if (appState.zoomIn) {
      clearTimeout(timer)
      setZooming(true)
      setTimer(setTimeout(doneZoom, 2500))
    } else {
      clearTimeout(timer)
      setZooming(false)
    }
  }, [appState.zoomIn])

  const [x, setx] = useState(0)
  const [y, sety] = useState(0)
  const [z, setz] = useState(1200)

  const [angle, setAngle] = useState(0)

  const vec = new Vector3()
  useFrame((state) => {
    if (!state.camera) return
    if (appState.viewMode === 'post') {
      // Increase amplitude and smooth background movement
      setAngle((val) => (val + 0.0016) % (Math.PI * 2))
      const radius = 1000
      const cx = -300 + Math.cos(angle) * radius
      const cy = 100 + Math.sin(angle * 0.85) * radius
      // gentle in/out zoom between ~1200 and ~1900
      const zz = 1550 + Math.sin(angle * 0.6) * 350
      state.camera.position.lerp(vec.set(cx, cy, zz), 0.035)
      if (controls?.current) {
        controls.current.target.lerp(vec.set(cx * 0.4, cy * 0.4, 0), 0.02)
      }

      return
    }
    if (!zooming) return

    state.camera.position.lerp(vec.set(x, y, z), 0.03)
    state.camera.updateProjectionMatrix()

    if (controls?.current) {
      controls.current.target.lerp(vec.set(x, y, 0), 0.03)
    }
    if (state.camera.position.z === z) {
      doneZoom()
    }
  })

  const mvCam = (focus: Emotion, z = 1200) => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, zoomIn: false }))
    setx(focus.x)
    sety(focus.y)
    setz(z)
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
