import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function () {
  const navigate = useNavigate()

  useEffect(() => {
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
