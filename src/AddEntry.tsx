import { TypeAnimation } from 'react-type-animation'
import { useContext } from 'react'
import { AppContext } from './main'

export default function () {
  const { appState } = useContext(AppContext)

  return (
    <div className='absolute top-0 left-0 right-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40'>
      <p className='text-2xl md:text-3xl whitespace-pre-line'>
        <TypeAnimation
          sequence={['What do you want the future to remember?']}
          repeat={0}
          cursor={false}
          speed={86}
          wrapper='span'
          className='text-bg'/>
      </p>
      <div className='w-full'>
        <textarea placeholder='Type your message here' className='w-full max-w-2xl h-32 mt-2 px-4 py-3 text-xl bg-white bg-opacity-95 rounded-3xl focus:outline-none'/>
      </div>
      <div className='mt-1'>
        <button className='text-bg text-xl'>Submit</button>
      </div>
    </div>
  )
}
