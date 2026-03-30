import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, MOUSE, TOUCH } from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useContext, useEffect, useRef, useState } from 'react'
import { AppContext } from '../context/AppContext'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'

export default function ({ onObjLoaded }: { onObjLoaded: () => void }) {
  const { appState, setAppState } = useContext(AppContext)

  useEffect(() => {
    onObjLoaded()
  }, [onObjLoaded])

  function pointerDown () {
    if (appState.zoomIn) {
      setAppState((state) => ({ ...state, zoomIn: false }))
    }
  }

  return (
    <Canvas shadows='basic' onPointerDown={pointerDown}>
      <CustomCamera/>
      <ambientLight intensity={5}/>
      <PlaneMesh receiveShadow/>
      <ObjectMesh onObjLoaded={onObjLoaded} castShadow receiveShadow/>
      <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={1}/>
      <fog attach='fog' args={[0xb2a4b6, 700, 4400]}/>
    </Canvas>
  )
}

function CustomCamera () {
  const { appState, setAppState } = useContext(AppContext)
  const controls = useRef<OrbitControlsImpl>(null)
  const [zooming, setZooming] = useState(false)
  const [timer, setTimer] = useState<number>()
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [z, setZ] = useState(1200)
  const [angle, setAngle] = useState(0)

  const doneZoom = () => {
    setZooming(false)
    setAppState((state) => ({ ...state, zoomIn: false }))
    setX(0)
    setY(0)
    setZ(1200)
  }

  useEffect(() => {
    if (appState.zoomIn) {
      window.clearTimeout(timer)
      setZooming(true)
      setTimer(window.setTimeout(doneZoom, 2500))
    } else {
      window.clearTimeout(timer)
      setZooming(false)
    }
  }, [appState.zoomIn])

  const vec = new Vector3()
  useFrame((state) => {
    if (!state.camera) return

    if (appState.viewMode === 'post') {
      setAngle((value) => (value + 0.0007) % (Math.PI * 2))
      const radius = 300
      const cx = -150 + Math.cos(angle) * radius
      const cy = Math.sin(angle) * radius
      state.camera.position.lerp(vec.set(cx, cy, z), 0.03)
      return
    }

    if (!zooming) return

    state.camera.position.lerp(vec.set(x, y, z), 0.03)
    state.camera.updateProjectionMatrix()

    if (controls.current) {
      controls.current.target.lerp(vec.set(x, y, 0), 0.03)
    }

    if (state.camera.position.distanceToSquared(vec.set(x, y, z)) < 1) {
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
        enabled={false}
        mouseButtons={{ LEFT: MOUSE.PAN }}
        touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
        minDistance={680}
        maxDistance={6000}
        zoomSpeed={0.53}
        minPolarAngle={Math.PI / 2.5}
        maxPolarAngle={Math.PI / 1.7}
        minAzimuthAngle={-Math.PI / 8}
        maxAzimuthAngle={Math.PI / 8}
        enableDamping
        dampingFactor={0.03}/>
    </PerspectiveCamera>
  )
}
