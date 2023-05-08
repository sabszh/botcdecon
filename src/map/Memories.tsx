import { useEffect, useContext, useMemo } from 'react'
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

  const { opacity } = useSpring({ opacity: showEntries ? 0.84 : 0, config: config.wobbly })

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
            mult={1}
          />
        ))}
      </group>
    </>
  )
}
