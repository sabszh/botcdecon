import type { ThreeEvent } from '@react-three/fiber'
import type { Entry, Point } from '../main'
import type { SpringValue } from '@react-spring/core'
import { useEffect, useContext, useState } from 'react'
import type { Texture } from 'three'
import { useTexture } from '@react-three/drei'
import { AppContext } from '../main'
import { animated } from '@react-spring/three'

type Icon = {
  url: string
  scale: [number, number, number]
}
type Pos = { x: number, y: number, z?: number }
type Props = {
  entry?: Entry
  points?: Point[]
  position?: Pos
  idx: number
  opacity: SpringValue<number> | number
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
    { url: '/markers/marker-1.png', scale: [66 / d, 150 / d, 0] },
    { url: '/markers/marker-2.png', scale: [50 / d, 153 / d, 0] },
    { url: '/markers/marker-3.png', scale: [98 / s, 138 / s, 0] },
    { url: '/markers/marker-4.png', scale: [88 / s, 120 / s, 0] },
    { url: '/markers/marker-5.png', scale: [43 / d, 158 / d, 0] },
    { url: '/markers/marker-6.png', scale: [49 / d, 155 / d, 0] }
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

  const interactive = ['explore', 'filtered']

  const onHover = () => {
    if (!interactive.includes(appState.viewMode)) return
    setHover(true)
  }
  const onLeave = () => {
    if (!interactive.includes(appState.viewMode)) return
    setHover(false)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (appState.viewMode === 'pick' && rmPin) {
      e.stopPropagation()
      rmPin(idx)
      return
    }
    if (!interactive.includes(appState.viewMode)) return
    // TODO: which point was clicked?
    if (!points?.length) return
    const point = points[0]
    // @ts-ignore-line
    setAppState((state) => ({ ...state, currentEntry: entry, currentMarker: point }))
  }

  if (!pin) return (<></>)

  if (Array.isArray(pin)) {
    return (
      <>
        {pin.map((p) => (
          <sprite key={p.id} onPointerEnter={onHover} onPointerLeave={onLeave} onClick={onClick} position={[p.x, p.y, 4]} scale={pick.scale}>
            {/* @ts-ignore-line */}
            <animated.spriteMaterial attach="material" map={texture} opacity={opacity}/>
          </sprite>
        ))}
      </>
    )
  }

  return (
    <sprite onPointerEnter={onHover} onPointerLeave={onLeave} onClick={onClick} position={[pin.x, pin.y, 4]} scale={pick.scale}>
      {/* @ts-ignore-line */}
      <animated.spriteMaterial attach="material" map={texture} opacity={opacity}/>
    </sprite>
  )
}
