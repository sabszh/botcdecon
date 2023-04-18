import { useState } from 'react'
import MapCanvas from './MapCanvas'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className='App'>
      <header className='absolute top-0 left-0 m-10 md:m-16 z-20 blur'>
        <p>Welcome to the</p>
        <h1 className='text-2xl md:text-3xl'>
          Carte de Continuonus
        </h1>
        <p className='map-label inline-block'>Label style</p>
      </header>

      <div className='w-full h-screen'>
        <MapCanvas />
      </div>
    </div>
  )
}

export default App
