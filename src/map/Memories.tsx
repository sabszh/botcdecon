import { useEffect, useContext, useMemo, useState, useRef } from 'react'
import { AppContext } from '../main'
import { useSpring, config } from '@react-spring/three'
import Pin from './Pin'

const dataEndpoint = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function Memories () {
  const { appState, setAppState } = useContext(AppContext)

  const entries = useMemo(() => {
    const db = appState.entries.filter((entry) => entry.points.length > 0)
    if (appState.myEntries?.length) {
      appState.myEntries.forEach((entry) => {
        if (db.find((e) => e.slug === entry.slug)) return
        db.push(entry)
      })
    }
    return db
  }, [appState.entries, appState.myEntries])
  const showEntries = useMemo(() => {
    return appState.viewMode === 'explore'
  }, [appState.viewMode])

  const { opacity } = useSpring({ opacity: showEntries ? 0.94 : 0, config: config.gentle })

  useEffect(() => {
    if (appState.entries.length > 0) return

    fetch(`${dataEndpoint}/entries`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, entries: data }))
    })
  }, [])

  const points = [
    { x: -56, y: 24 },
    { x: -16, y: 23 },
    { x: -37, y: -35 },
    { x: 30, y: -4 }
  ]
  const [idx, setIdx] = useState(0)
  const [int, setInt] = useState<number>()
  const idxRef = useRef(idx)

  function cycle () {
    const ci = idxRef.current
    const p = points[ci]
    appState.mvCam(p, 1200)
    setIdx((val) => (val + 1) % points.length)
  }

  useEffect(() => {
    idxRef.current = idx
  }, [idx])

  // useEffect(() => {
  //   clearInterval(int)
  //
  //   if (appState.viewMode !== 'post') {
  //     // setIdx(0)
  //     return
  //   }
  //
  //   cycle()
  //   setInt(setInterval(cycle, 4000))
  // }, [appState.viewMode])

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
            mult={1}
          />
        ))}
      </group>
    </>
  )
}
