import { useState, useRef, useEffect, useContext } from 'react'
import MapCanvas from '../map/Canvas'
import { TypeAnimation } from 'react-type-animation'
import { CSSTransition } from 'react-transition-group'
import { AppContext } from '../main'
import AddEntry from '../AddEntry'
import ViewEntry from '../ViewEntry'

export default function () {
  const [introStep, setIntroStep] = useState(0)

  const { appState, setAppState } = useContext(AppContext)
  const stateRef = useRef(appState)
  useEffect(() => {
    stateRef.current = appState
  }, [appState])

  const introRef = useRef(null)
  const intro = [
    'Welcome to Carte de Continuonus, an emotional map in which you are invited to leave behind a memory for the future.',
    'What do you remember that you want the future to remember?'
  ]

  const doIntro = async () => {
    if (stateRef.current.introSeen || stateRef.current.introStarted) return
    // @ts-ignore-line
    setAppState((state) => ({ ...state, introStarted: true }))

    await sleep(600)
    if (stateRef.current.introSeen || !stateRef.current.introStarted) return
    setIntroStep(1)

    await sleep(7000)
    if (stateRef.current.introSeen) return
    setIntroStep(2)

    await sleep(6000)
    if (stateRef.current.introSeen) return
    // @ts-ignore-line
    setAppState((state) => ({ ...state, introStarted: false, introSeen: true }))

    await sleep(600)
    if (stateRef.current.viewMode !== 'empty') return

    stateRef.current.mvCam?.({ x: 0, y: 0 }, 2800)
    // @ts-ignore-line
    setAppState(state => ({ ...state, headerVisible: false, viewMode: 'post', zoomIn: true }))
  }

  const restart = async () => {
    setIntroStep(0)
    // @ts-ignore-line
    setAppState((state) => ({ ...state, introStarted: false, introSeen: false, viewMode: 'empty' }))
    if (location.pathname === '/') {
      // @ts-ignore-line
      setAppState((state) => ({ ...state, headerVisible: false }))
    }
    await sleep(1)
    doIntro()
  }

  const typeSpeed = 55

  return (
    <>
      <div className='w-full h-screen relative z-10'>
        <MapCanvas onObjLoaded={doIntro}/>
      </div>

      <CSSTransition in={!appState.introSeen} nodeRef={introRef} classNames='fade' timeout={300} unmountOnExit>
        <div ref={introRef} className='absolute top-0 left-0 m-10 md:m-16 z-10 blurX pt-32 md:pt-40'>
          {introStep > 0 && (<div className='text-2xl md:text-3xl whitespace-pre-line mb-8 md:mb-10'>
            <TypeAnimation
              sequence={[intro[0]]}
              repeat={0}
              cursor={false}
              speed={typeSpeed}
              wrapper='span'
              className='text-bg'/>
          </div>)}
          {introStep > 1 && (<div className='text-2xl md:text-3xl'>
            <TypeAnimation
              sequence={[intro[1]]}
              repeat={0}
              cursor={false}
              speed={typeSpeed}
              wrapper='span'
              className='text-bg'/>
          </div>)}
        </div>
      </CSSTransition>

      <AddEntry onRestart={restart}/>
      <ViewEntry/>
    </>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
