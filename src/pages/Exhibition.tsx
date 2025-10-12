import { useNavigate } from 'react-router-dom'
import { useEffect, useContext } from 'react'
import { AppContext } from '../main'

export default function () {
  const { setAppState } = useContext(AppContext)
  const navigate = useNavigate()

  useEffect(() => {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, onsite: 2 }))
    navigate('/')
  }, [])

  return (
    <div className='p-4 md:p-10 blurX'>
      <div className='mt-32 bg-whiteX rounded-3xl px-8 py-6 text-xl'>
        <div className='max-w-prose prose'>
          <p>Loading</p>
        </div>
      </div>
    </div>
  )
}

