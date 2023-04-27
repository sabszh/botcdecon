import { useEffect, useContext, useMemo, useState } from 'react'
import type { Texture } from 'three'
import { useTexture } from '@react-three/drei'
import { AppContext } from '../main'
import { useSpring, animated, config } from '@react-spring/three'

const dataEndpoint = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function Memories () {
  const { appState, setAppState } = useContext(AppContext)

  const entries = useMemo(() => {
    return appState.entries.filter((entry) => entry.points.length > 0)
  }, [appState.entries])
  const showEntries = useMemo(() => {
    return appState.viewMode === 'explore'
  }, [appState.viewMode])

  const { opacity } = useSpring({ opacity: showEntries ? 1 : 0, config: config.wobbly })

  useEffect(() => {
    if (appState.entries.length > 0) return

    fetch(`${dataEndpoint}/entries`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, entries: data }))
    })
  }, [])

  return (
    <>
      <group>
        {entries.map((entry, index) => (
          <Pin
            key={index}
            entry={entry}
            idx={index}
            opacity={opacity}
            points={entry.points}
          />
        ))}
      </group>
    </>
  )
}

type Icon = {
  url: string
  scale: [number, number, number]
}
// @ts-ignore-line
function Pin ({ entry, points, idx, opacity }) {
  const { setAppState } = useContext(AppContext)

  const d = 2
  const icons: Icon[] = [
    { url: '/markers/marker-1.png', scale: [66 / d, 150 / d, 0] },
    { url: '/markers/marker-2.png', scale: [50 / d, 153 / d, 0] },
    { url: '/markers/marker-3.png', scale: [98 / 3, 138 / 3, 0] },
    { url: '/markers/marker-4.png', scale: [88 / 3, 120 / 3, 0] },
    { url: '/markers/marker-5.png', scale: [43 / d, 158 / d, 0] },
    { url: '/markers/marker-6.png', scale: [49 / d, 155 / d, 0] }
  ]
  const pick = icons[idx % icons.length]
  const texture = useTexture(pick.url) as Texture

  const pin = points[0]

  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : 'auto'
  }, [hover])

  const onClick = () => {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, currentEntry: entry }))
  }

  return (
    <sprite onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onClick={onClick} position={[pin.x, pin.y, 2]} scale={pick.scale}>
      <animated.spriteMaterial attach="material" map={texture} opacity={opacity}/>
    </sprite>
  )
}
