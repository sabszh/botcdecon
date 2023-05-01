import { useContext, useMemo, useState } from 'react'
import { AppContext } from './main'
import { CSSTransition } from 'react-transition-group'

export default function () {
  const { appState, setAppState } = useContext(AppContext)

  const entry = useMemo(() => appState.currentEntry, [appState.currentEntry])
  const [closing, setClosing] = useState(false)
  const showEntry = useMemo(() => (entry !== null && !closing), [entry, closing])

  const close = async () => {
    setClosing(true)

    await sleep(300)

    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: null }))
    setClosing(false)
  }

  const nextEntry = () => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: null }))
  }
  const prevEntry = () => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, currentEntry: null }))
  }

  return (
    <>
      <CSSTransition in={showEntry} classNames='fade' timeout={300} unmountOnExit>
        <div onClick={close} className='fixed inset-0 p-4 md:p-16 z-10 blur overflow-auto'>
          <div onClick={e => e.stopPropagation()} className='w-full max-w-4xl mx-auto bg-white rounded-3xl px-8 py-6 text-xl md:text-2xl mt-32 md:mt-40 relative'>
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

type Point = {
  x: number
  y: number
  emotion: string
  distance: number
  angle: number
}

function EntryPoint ({ point }: { point: Point }) {
  const rotate = () => {
    if (point.angle === undefined) return
    // convert radians to degrees
    const deg = point.angle * (180 / Math.PI)
    return `rotate(${deg}deg)`
  }
  const opacity = () => {
    if (point.distance === undefined) return
    const pc = 1 / (1 + point.distance / 400)
    return pc
  }

  return (
    <li className='mx-2'>
      <p style={{ opacity: opacity() }}>
        <span>{point.emotion} </span>
        {/* {rotate && (
          <>
            <span style={{ transform: rotate() }} className='inline-block align-middle'>&rarr;</span>
            <span className='text-xs'> {Number(point.distance).toFixed(2)}</span>
          </>
        )} */}
      </p>
    </li>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
