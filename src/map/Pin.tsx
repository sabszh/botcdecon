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

  const d = 6 * mult
  // const s = 4 * mult
  const icons: Icon[] = [
    { url: '/markers/knot-1.png?v=1', scale: [185 / d, 404/ d, 0], center: new Vector2(1, 0) },
    { url: '/markers/knot-5.png?v=1', scale: [121 / d, 246 / d, 0], center: new Vector2(0.1, 0) },
    { url: '/markers/knot-2.png?v=1', scale: [100 / d, 291 / d, 0], center: new Vector2(0.1, 0) },
    { url: '/markers/knot-3.png?v=1', scale: [175 / d, 152 / d, 0], center: new Vector2(0.1, 0) },
    { url: '/markers/knot-4.png?v=1', scale: [169 / d, 210 / d, 0], center: new Vector2(1, 0) },

    // { url: '/markers/marker-13.png', scale: [46 / d, 92 / d, 0], center: new Vector2(0.1, 0) },
    // { url: '/markers/marker-7.png', scale: [107 / d, 74 / d, 0], center: new Vector2(0, 0) },
    // { url: '/markers/marker-5.png', scale: [43 / d, 158 / d, 0], center: new Vector2(1, 0) },
    // { url: '/markers/marker-9.png', scale: [58 / d, 90 / d, 0], center: new Vector2(0.66, 1) },
    // { url: '/markers/marker-2.png', scale: [50 / d, 153 / d, 0], center: new Vector2(0, 0) },
    // { url: '/markers/marker-3.png', scale: [98 / s, 138 / s, 0], center: new Vector2(0.9, 0) },
    // { url: '/markers/marker-8.png', scale: [80 / d, 48 / d, 0], center: new Vector2(1, 1) },
    // { url: '/markers/marker-4.png', scale: [88 / s, 120 / s, 0], center: new Vector2(0, 0) },
    // { url: '/markers/marker-10.png', scale: [70 / d, 90 / d, 0], center: new Vector2(0, 0) },
    // { url: '/markers/marker-1.png', scale: [66 / d, 150 / d, 0], center: new Vector2(1, 0) },
    // { url: '/markers/marker-6.png', scale: [49 / d, 155 / d, 0], center: new Vector2(0, 0) },
    // { url: '/markers/marker-12.png', scale: [73 / d, 74 / d, 0], center: new Vector2(0.62, 1) },
    // { url: '/markers/marker-11.png', scale: [71 / s, 80 / s, 0], center: new Vector2(0.8, 0) },

    // { url: '/markers/marker-14.png', scale: [138 / s, 87 / s, 0], center: new Vector2(0.8, 0) },
    // { url: '/markers/marker-15.png', scale: [89 / s, 140 / s, 0], center: new Vector2(0.8, 0) },
    // { url: '/markers/marker-16.png', scale: [131 / s, 152 / s, 0], center: new Vector2(0.8, 0) },
    // { url: '/markers/marker-17.png', scale: [84 / s, 140 / s, 0], center: new Vector2(0.8, 0) },
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
    return opacity?.goal < 0.8
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

  const allTextures = icons.map((icon) => useTexture(icon.url) as Texture)

  if (!pin) return (<></>)

  if (Array.isArray(pin)) {
    return (
      <>
        {pin.map((p, i) => {
          const pp = (idx + i) % icons.length
          const tex = allTextures[pp]
          return (
            <sprite key={i} onPointerEnter={onHover} onPointerLeave={onLeave} onClick={onClick} position={[p.x, p.y, 4]} scale={icons[pp].scale} center={icons[pp].center}>
              {/* @ts-ignore-line */}
              <animated.spriteMaterial attach="material" map={tex} opacity={opacity} fog={true}/>
            </sprite>
          )
        })}
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
