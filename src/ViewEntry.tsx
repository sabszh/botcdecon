import { useContext, useMemo, useRef } from 'react'
import { CSSTransition } from 'react-transition-group'
import { AppContext } from './main'

export default function () {
  const { appState, setAppState } = useContext(AppContext)

  const show = useMemo(() => appState.currentEntry !== null, [appState.currentEntry])

  const ref1 = useRef(null)
  const ref2 = useRef(null)

  function back () {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, currentEntry: null }))
  }

  function backToExplore () {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, currentEntry: null, viewMode: 'explore' }))
  }

  const viewEntry = appState.currentEntry

  return (
    <>
      <CSSTransition nodeRef={ref1} in={show} classNames='fade' timeout={300} unmountOnExit>
        <div ref={ref1} className='absolute top-0 left-20 m-6 md:m-16 z-10 blurX'>
          <button onClick={back} className='text-bg bg-white text-3xl'>
            <span className='sr-only'>Close</span>
            <img src='/x.svg' alt='Close' className='' style={{ width:'28px', height:'15px' }}/>
          </button>
        </div>
      </CSSTransition>

      <CSSTransition nodeRef={ref2} in={show} classNames='fade' timeout={300} unmountOnExit>
        <div ref={ref2} className='absolute right-0 top-0 bottom-0 p-4 md:p-12 w-full max-w-lg z-10 blurX'>
          <div className='bg-white rounded-2xl md:rounded-3xl px-10 py-8 min-h-full overflow-y-auto shadow-lg flex flex-col'>
            <div className='flex-auto'>
              <div className='mt-12'>
                <div className='text-xl md:text-2xl'>A memory to remember for the future:</div>
                <div className='mt-2 text-2xl md:text-3xl italic'>
                  {viewEntry?.text}
                </div>
              </div>
              <div className='mt-8 text-sm'>By <span className='underline'>{viewEntry?.name}</span> from <span className='underline'>{viewEntry?.location || 'Unknown'}</span></div>
              <div className='mt-2 text-sm'>Posted on <span className='underline'>{viewEntry?.date}</span></div>
            </div>
            <div>
              <button onClick={backToExplore} className='text-bg text-2xl md:text-3xl mt-8'>
                <span>Back to the memories</span>
              </button>
            </div>
          </div>
        </div>
      </CSSTransition>
    </>
  )
}

