import { useState, useRef } from 'react'
import MapCanvas from '../map/Canvas'
import { TypeAnimation } from 'react-type-animation'
import { CSSTransition } from 'react-transition-group'

export default function () {
  const [introStarted, setIntroStarted] = useState(false)
  const [introStep, setIntroStep] = useState(0)
  const [doneIntro, setDoneIntro] = useState(false)

  const introRef = useRef(null)
  const intro = [
    'Welcome to Carte de Continuonus, a map of emotions that invites you to leave something behind for the ones who come after.',
    'What do you remember, that you want the future to remember?'
  ]

  async function doIntro () {
    if (introStarted) return
    setIntroStarted(true)

    console.log('starting the intro')
    await sleep(1500)
    setIntroStep(1)

    await sleep(4000)
    setIntroStep(2)

    await sleep(4000)
    setDoneIntro(true)
  }

  return (
    <>
      <div className='w-full h-screen'>
        <MapCanvas onObjLoaded={doIntro}/>
      </div>

      <CSSTransition in={!doneIntro} nodeRef={introRef} classNames='fade' timeout={300} unmountOnExit>
        <div ref={introRef} className='absolute top-0 left-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40'>
          {introStep > 0 && (<div className='text-2xl md:text-3xl whitespace-pre-line mb-12 md:mb-16'>
            <TypeAnimation
              sequence={[intro[0]]}
              repeat={0}
              cursor={false}
              speed={86}
              wrapper='span'
              className='text-bg'/>
          </div>)}
          {introStep > 1 && (<div className='text-2xl md:text-3xl'>
            <TypeAnimation
              sequence={[intro[1]]}
              repeat={0}
              cursor={false}
              speed={86}
              wrapper='span'
              className='text-bg'/>
          </div>)}
        </div>
      </CSSTransition>
    </>
  )
}

function sleep (ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
