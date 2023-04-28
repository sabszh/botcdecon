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

  return (
    <>
      <CSSTransition in={showEntry} classNames='fade' timeout={300} unmountOnExit>
        <div className='fixed inset-0 p-4 md:p-16 z-10 blur overflow-auto'>
          <div className='w-full max-w-4xl mx-auto bg-white rounded-3xl px-8 py-6 text-xl md:text-2xl mt-32 md:mt-40 relative'>
            <ul className='flex flex-wrap -mx-2'>
              {entry?.points?.map((point: any, i: number) => (
                <EntryPoint key={i} point={point}/>
              ))}
            </ul>
            <div className='whitespace-pre-line'>
              <p>{entry?.text}</p>
            </div>
            {(entry?.name || entry?.location) && (
              <div className='flex mt-4 text-gray-500'>
                <p className=''>{entry?.name}</p>
                {(entry?.name && entry?.location) && (
                  <p className='px-2'>&middot;</p>
                )}
                <p className=''>{entry?.location}</p>
              </div>
            )}

            <div className='absolute bottom-full left-0'>
              <button onClick={close} className='text-bg bg-white text-3xl'>
                <span className='sr-only'>Close</span>
                <img src='/x.svg' alt='Close' className='' style={{ width:'28px', height:'15px' }}/>
              </button>
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
}

function EntryPoint ({ point }: { point: Point }) {
  return (
    <li className='mx-2'>
      <p className=''>
        <span>{point.emotion} </span>
        <span className='text-gray-300 text-xs'>{Number(point.distance).toFixed(2)}</span>
      </p>
    </li>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
