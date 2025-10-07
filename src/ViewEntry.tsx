import type { Point } from './main'
import { useContext, useMemo, useState, useEffect, useRef } from 'react'
import { AppContext, Entry } from './main'
import { CSSTransition } from 'react-transition-group'
import { Link } from 'react-router-dom'

function euclideanDistance (point1: Point, point2: Point) {
  const dx = point1.x - point2.x
  const dy = point1.y - point2.y
  return Math.sqrt(dx * dx + dy * dy)
}

function calculateDistance (referencePoint: Point, objectsArray: Entry[]) {
  return objectsArray.map(obj => {
    const pointsDistances = obj.points.map(point => euclideanDistance(referencePoint, point))
    const minDistance = Math.min(...pointsDistances)
    return {
      ...obj,
      minDistance
    }
  })
}

function sortByProximity(objectsArray: (Entry & { minDistance: number })[]) {
  return objectsArray.sort((a, b) => a.minDistance - b.minDistance);
}

type EntryWithDistance = Entry & { minDistance: number }

export default function () {
  const { appState, setAppState } = useContext(AppContext)

  const entry = useMemo(() => appState.currentEntry, [appState.currentEntry])
  const [closing, setClosing] = useState(false)
  const showEntry = useMemo(() => (entry !== null && !closing), [entry, closing])

  const [sortedEntries, setSortedEntries] = useState<EntryWithDistance[]>([])

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

  useEffect(() => {
    const refPoint = appState.currentMarker
    if (!refPoint) return

    const list = appState.viewMode === 'filtered' ? appState.filteredEntries : entries

    const objectsWithDistances = calculateDistance(refPoint, list)
    const sortedObjects = sortByProximity(objectsWithDistances)
    setSortedEntries(sortedObjects)
  }, [appState.currentMarker])

  const close = async () => {
    setClosing(true)

    await sleep(300)

    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: null }))
    setClosing(false)
  }

  const nextEntry = () => {
    const current = sortedEntries.findIndex(entry => entry.slug === appState.currentEntry?.slug)
    if (current === -1) return

    const nextindex = (current + 1) % sortedEntries.length
    const next = sortedEntries[nextindex]

    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: next }))
    // appState.mvCam(next.points[0], 1000)
  }
  const prevEntry = () => {
    const current = sortedEntries.findIndex(entry => entry.slug === appState.currentEntry?.slug)
    if (current === -1) return

    const prev = sortedEntries[(current - 1 + sortedEntries.length) % sortedEntries.length]

    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: prev }))
    // appState.mvCam(prev.points[0], 1000)
  }

  const ref1 = useRef(null)

  return (
    <>
      <CSSTransition nodeRef={ref1} in={showEntry} classNames='fade' timeout={300} unmountOnExit>
        <div onClick={close} className='fixed inset-0 p-4 md:p-16 z-10 blurX overflow-auto'>
          <div onClick={e => e.stopPropagation()} className='w-full max-w-2xl mx-auto bg-white rounded-3xl px-8 py-6 text-xl md:text-2xl mt-32 md:mt-40 relative'>
            <ul className='flex flex-wrap -mx-2 mb-4 text-base'>
              {entry?.points?.map((point: any, i: number) => (
                <EntryPoint key={i} point={point}/>
              ))}
            </ul>
            <div className='whitespace-pre-line'>
              <p>{entry?.text}</p>
            </div>
            {(entry?.name || entry?.location) && (
              <div className='flex mt-4 text-base'>
                <p className=''>{entry?.name}</p>
                {(entry?.name && entry?.location) && (
                  <p className='px-2'>&middot;</p>
                )}
                <p className=''>{entry?.location}</p>
              </div>
            )}

            <div onClick={e => e.stopPropagation()} className='absolute bottom-full left-0 mb-0.5'>
              <div className='flex items-center'>
                <button onClick={close} className='text-bg bg-white text-3xl'>
                  <span className='sr-only'>Close</span>
                  <img src='/x.svg' alt='Close' className='' style={{ width:'28px', height:'15px' }}/>
                </button>
                <button onClick={prevEntry} className='text-bg bg-white text-sm ml-0.5 !leading-normal'>
                  <span className='sr-only'>Previous entry</span>
                  <span>&larr;</span>
                </button>
                <button onClick={nextEntry} className='text-bg bg-white text-sm ml-0.5 !leading-normal'>
                  <span className='sr-only'>Next entry</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </CSSTransition>
    </>
  )
}

function EntryPoint ({ point }: { point: Point }) {
  const opacity = () => {
    if (point.distance === undefined) return
    const pc = 1 / (1 + point.distance / 400)
    return pc
  }

  const link = `?emotion=${point.emotion}`

  return (
    <li className='mx-2'>
      <p style={{ opacity: opacity() }}>
        {point.emotion === 'Beyond' ? (
          <span>{point.emotion}</span>
        ) : (
        <Link to={link}>{point.emotion}</Link>
        )}
      </p>
    </li>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
