import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, MOUSE, TOUCH } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useCallback, useContext, useEffect, useRef } from 'react'
import { AppContext } from '../context/AppContext'

import ObjectMesh from './ObjectMesh'
import PlaneMesh from './PlaneMesh'
import WebGLContextGuard from './WebGLContextGuard'

function FpsThrottle ({ fps }: { fps: number }) {
  const { invalidate } = useThree()
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps)
    return () => clearInterval(id)
  }, [fps, invalidate])
  return null
}

type Props = {
  onObjLoaded: () => void
  freezeMotion?: boolean
  reducedPerformance?: boolean
}

export default function MapCanvas ({ onObjLoaded, freezeMotion = false, reducedPerformance = false }: Props) {
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
    <Canvas
      dpr={reducedPerformance ? [0.75, 1] : [1, 1.35]}
      frameloop={reducedPerformance ? 'demand' : 'always'}
      performance={{ min: 0.5 }}
      gl={{ antialias: !reducedPerformance, alpha: true, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: reducedPerformance ? 'low-power' : 'high-performance' }}
      onPointerDown={pointerDown}
    >
      <WebGLContextGuard />
      {reducedPerformance && <FpsThrottle fps={30} />}
      <CustomCamera freezeMotion={freezeMotion} reducedPerformance={reducedPerformance}/>
      <ambientLight intensity={5}/>
      <PlaneMesh reducedPerformance={reducedPerformance}/>
      <ObjectMesh onObjLoaded={onObjLoaded} reducedPerformance={reducedPerformance}/>
      {!reducedPerformance && <pointLight position={[-600, -500, 5000]} color={0xffffff} intensity={0.9}/>}
      <fog attach='fog' args={[0xb2a4b6, 700, 4400]}/>
    </Canvas>
  )
}

function CustomCamera ({ freezeMotion = false, reducedPerformance = false }: { freezeMotion?: boolean, reducedPerformance?: boolean }) {
  const { appState, setAppState } = useContext(AppContext)
  const controls = useRef<OrbitControlsImpl>(null)
  const zoomingRef = useRef(false)
  const zoomTimerRef = useRef<number | null>(null)
  const angleRef = useRef(0)
  const zoomPosition = useRef(new Vector3(0, 0, 1200))
  const zoomTarget = useRef(new Vector3(0, 0, 0))
  const driftTarget = useRef(new Vector3())

  const doneZoom = useCallback(() => {
    zoomingRef.current = false
    setAppState((state) => ({ ...state, zoomIn: false }))
  }, [setAppState])

  useEffect(() => {
    if (appState.zoomIn) {
      if (zoomTimerRef.current) window.clearTimeout(zoomTimerRef.current)
      zoomingRef.current = true
      zoomTimerRef.current = window.setTimeout(doneZoom, 1500)
    } else {
      if (zoomTimerRef.current) window.clearTimeout(zoomTimerRef.current)
      zoomingRef.current = false
    }
  }, [appState.zoomIn, doneZoom])

  useEffect(() => {
    return () => {
      if (zoomTimerRef.current) window.clearTimeout(zoomTimerRef.current)
    }
  }, [])

  useFrame((state, delta) => {
    if (!state.camera) return

    if (appState.viewMode === 'post') {
      if (freezeMotion) return
      angleRef.current = (angleRef.current + delta * (reducedPerformance ? 0.07 : 0.18)) % (Math.PI * 2)
      const radius = reducedPerformance ? 180 : 260
      const cx = -150 + Math.cos(angleRef.current) * radius
      const cy = Math.sin(angleRef.current) * radius
      driftTarget.current.set(cx, cy, zoomPosition.current.z)
      state.camera.position.lerp(driftTarget.current, reducedPerformance ? 0.01 : 0.015)
      return
    }

    if (!zoomingRef.current) return

    state.camera.position.lerp(zoomPosition.current, 0.055)
    state.camera.updateProjectionMatrix()

    if (controls.current) {
      controls.current.target.lerp(zoomTarget.current, 0.055)
    }

    if (state.camera.position.distanceToSquared(zoomPosition.current) < 1) {
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
        enableDamping={!reducedPerformance}
        dampingFactor={reducedPerformance ? 0 : 0.03}/>
    </PerspectiveCamera>
  )
}
