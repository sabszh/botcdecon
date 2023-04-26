import { useState, useRef, useEffect, useContext } from 'react'
import MapCanvas from '../map/Canvas'
import { TypeAnimation } from 'react-type-animation'
import { CSSTransition } from 'react-transition-group'
import { AppContext } from '../main'
import AddEntry from '../AddEntry'

export default function () {
  const [introStarted, setIntroStarted] = useState(false)
  const [introStep, setIntroStep] = useState(0)

  const { appState, setAppState } = useContext(AppContext)
  const stateRef = useRef(appState)
  useEffect(() => {
    stateRef.current = appState
  }, [appState])

  const introRef = useRef(null)
  const intro = [
    'Welcome to Carte de Continuonus, a map of emotions that invites you to leave something behind for the ones who come after.',
    'What do you remember, that you want the future to remember?'
  ]

  async function doIntro () {
    if (appState.introSeen || introStarted) return
    setIntroStarted(true)

    await sleep(1500)
    setIntroStep(1)

    await sleep(6000)
    setIntroStep(2)

    await sleep(4000)
    // @ts-ignore-line
    setAppState((state) => ({ ...state, introSeen: true }))

    await sleep(600)
    if (stateRef.current.viewMode !== 'empty') return
    // @ts-ignore-line
    setAppState(state => ({ ...state, headerVisible: false, viewMode: 'post' }))
  }

  useEffect(() => {
    doIntro()
  }, [])

  const typeSpeed = 65

  return (
    <>
      <div className='w-full h-screen'>
        <MapCanvas onObjLoaded={doIntro}/>
      </div>

      <CSSTransition in={!appState.introSeen} nodeRef={introRef} classNames='fade' timeout={300} unmountOnExit>
        <div ref={introRef} className='absolute top-0 left-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40'>
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

      <AddEntry/>
    </>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
