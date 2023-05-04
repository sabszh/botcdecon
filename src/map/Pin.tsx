import type { ThreeEvent } from '@react-three/fiber'
import type { Entry, Point } from '../main'
import type { SpringValue } from '@react-spring/core'
import type { Texture } from 'three'

import { useEffect, useContext, useState } from 'react'
import { Vector2 } from 'three'
import { useTexture } from '@react-three/drei'
import { AppContext } from '../main'
import { animated } from '@react-spring/three'

type Icon = {
  url: string
  scale: [number, number, number],
  center: Vector2
}
type Pos = { x: number, y: number, z?: number }
type Props = {
  entry?: Entry
  points?: Point[]
  position?: Pos
  idx: number
  opacity?: SpringValue<number>
  mult: number
  rmPin?: any
  emo?: string
}

// @ts-ignore-line
export default function Pin ({ entry, points, position, idx, opacity, mult = 1, rmPin, emo }: Props) {
  const { appState, setAppState } = useContext(AppContext)

  const d = 3 * mult
  const s = 4 * mult
  const icons: Icon[] = [
    { url: '/markers/marker-13.png', scale: [46 / d, 92 / d, 0], center: new Vector2(0.1, 0) },
    { url: '/markers/marker-7.png', scale: [107 / d, 74 / d, 0], center: new Vector2(0, 0) },
    { url: '/markers/marker-5.png', scale: [43 / d, 158 / d, 0], center: new Vector2(1, 0) },
    { url: '/markers/marker-9.png', scale: [58 / d, 90 / d, 0], center: new Vector2(0.66, 1) },
    { url: '/markers/marker-2.png', scale: [50 / d, 153 / d, 0], center: new Vector2(0, 0) },
    { url: '/markers/marker-3.png', scale: [98 / s, 138 / s, 0], center: new Vector2(0.9, 0) },
    { url: '/markers/marker-8.png', scale: [80 / d, 48 / d, 0], center: new Vector2(1, 1) },
    { url: '/markers/marker-4.png', scale: [88 / s, 120 / s, 0], center: new Vector2(0, 0) },
    { url: '/markers/marker-10.png', scale: [70 / d, 90 / d, 0], center: new Vector2(0, 0) },
    { url: '/markers/marker-1.png', scale: [66 / d, 150 / d, 0], center: new Vector2(1, 0) },
    { url: '/markers/marker-6.png', scale: [49 / d, 155 / d, 0], center: new Vector2(0, 0) },
    { url: '/markers/marker-12.png', scale: [73 / d, 74 / d, 0], center: new Vector2(0.62, 1) },
    { url: '/markers/marker-11.png', scale: [71 / d, 80 / d, 0], center: new Vector2(0.8, 0) },
  ]
  const pick = icons[idx % icons.length]
  const texture = useTexture(pick.url) as Texture

  let pin: Point | Point[] | Pos | undefined = position

  if (emo) {
    pin = points?.find((p) => p.emotion === emo)
  } else if (points?.length) {
    pin = points
  }

  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : 'auto'
  }, [hover])

  const isHidden = () => {
    // @ts-ignore-line
    return opacity?.goal < 1
  }

  const interactive = ['explore', 'filtered']
  const onHover = () => {
    if (!interactive.includes(appState.viewMode) || isHidden()) return
    setHover(true)
  }
  const onLeave = () => {
    if (!interactive.includes(appState.viewMode) || isHidden()) return
    setHover(false)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (appState.viewMode === 'pick' && rmPin) {
      e.stopPropagation()
      rmPin(idx)
      return
    }
    if (isHidden()) return
    if (!interactive.includes(appState.viewMode)) return
    if (!points?.length) return

    e.stopPropagation()
    const point = points[0]
    // @ts-ignore-line
    setAppState((state) => ({ ...state, currentEntry: entry, currentMarker: point }))
  }

  if (!pin) return (<></>)

  if (Array.isArray(pin)) {
    return (
      <>
        {pin.map((p) => (
          <sprite key={p.id} onPointerEnter={onHover} onPointerLeave={onLeave} onClick={onClick} position={[p.x, p.y, 4]} scale={pick.scale} center={pick.center}>
            {/* @ts-ignore-line */}
            <animated.spriteMaterial attach="material" map={texture} opacity={opacity} fog={false}/>
          </sprite>
        ))}
      </>
    )
  }

  return (
    <sprite
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onClick={onClick}
      position={[pin.x, pin.y, 4]}
      scale={pick.scale}
      center={pick.center}>
      {/* @ts-ignore-line */}
      <animated.spriteMaterial attach="material" map={texture} opacity={opacity}/>
    </sprite>
  )
}
