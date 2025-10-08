import { useEffect, useContext, useMemo, useState } from 'react'
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

    fetchEntries(true)
  }, [])

  const COUNT = 5
  function fetchEntries (initial = false) {
    fetch(`${dataEndpoint}/entries`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState((state) => {
        if (initial) {
          return { ...state, entries: data }
        }

        const newlist = state.entries.slice(COUNT)
        const ids = state.entries.map((e: any) => e.slug)

        let replaced = 0
        data.sort(() => Math.random() - 0.5) // shuffle
        data.forEach((entry: any) => {
          if (replaced >= COUNT) return
          if (ids.includes(entry.slug)) return

          newlist.push(entry)
          replaced++
        })

        newlist.sort(() => Math.random() - 0.5) // shuffle

        return { ...state, entries: newlist }
      })
    })
  }

  // every 1 min call fetchEntries
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEntries()
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <group>
        {entries.map((entry, index) => (
          <Pin
            key={entry.slug}
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
