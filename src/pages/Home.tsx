import { useState, useEffect } from 'react'
import MapCanvas from '../map/Canvas'
import { TypeAnimation } from 'react-type-animation'

export default function () {
  const [introStep, setIntroStep] = useState(0)
  const [doneIntro, setDoneIntro] = useState(false)

  const intro = [
    'Welcome to Carte de Continuonus, a map of emotions that invites you to leave something behind for the ones who come after.',
    'What do you remember, that you want the future to remember?'
  ]

  useEffect(() => {
    console.log('home mounted')
    setTimeout(() => {
      console.log('set 1')
      if (doneIntro) return

      setIntroStep(1)
    }, 1000)
    setTimeout(() => {
      setDoneIntro(true)
      setIntroStep(2)
    }, 6000)
  }, [])

  return (
    <>
      <div className='w-full h-screen'>
        <MapCanvas/>
      </div>

      <div className='absolute top-0 left-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40'>
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
    </>
  )
}
