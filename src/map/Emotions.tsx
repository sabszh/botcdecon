import { useEffect, useContext, useMemo, useState } from 'react'
import { AppContext } from '../main'
import { useSpring, config } from '@react-spring/three'
import { useLocation } from 'react-router-dom'
import Pin from './Pin'

function useQuery() {
  return new URLSearchParams(useLocation().search)
}

const dataEndpoint = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function Emotions () {
  const { appState, setAppState } = useContext(AppContext)

  const query = useQuery();
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    const newFilter = query.get('emotion')
    if (newFilter !== filter) {
      setFilter(newFilter)

      const focus = appState.emotions.find((emo) => emo.title === newFilter)
      if (focus && appState.mvCam) {
        appState.mvCam(focus)
      }
    }
    if (filter === null && newFilter) {
      // @ts-ignore-line
      setAppState(state => ({ ...state, currentEntry: null, viewMode: 'filtered' }))
    } else if (newFilter === null && filter) {
      // @ts-ignore-line
      setAppState(state => ({ ...state, currentEntry: null, viewMode: 'explore' }))
    } else if (newFilter && filter && newFilter !== filter) {
      // @ts-ignore-line
      setAppState(state => ({ ...state, currentEntry: null }))
    }
  }, [query, filter])

  const entries = useMemo(() => {
    return appState.filteredEntries
  }, [appState.filteredEntries])
  const showEntries = useMemo(() => {
    return appState.viewMode === 'filtered'
  }, [appState.viewMode])

  const { opacity } = useSpring({ opacity: showEntries ? 1 : 0, config: config.wobbly })

  useEffect(() => {
    if (!filter) return

    fetch(`${dataEndpoint}/emotion?id=${filter}`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, filteredEntries: data }))
    })
  }, [filter])

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
            emo={filter || undefined}
          />
        ))}
      </group>
    </>
  )
}
