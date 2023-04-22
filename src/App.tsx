import Menu from './Menu'
import MapCanvas from './map/Canvas'

function App() {
  return (
    <div className='App'>
      <div className='w-full h-screen'>
        <MapCanvas />
      </div>

      <header className='absolute top-0 left-0 m-10 md:m-16 z-10 blur'>
        <p>
          <span className='text-bg'>Welcome to the</span>
        </p>
        <h1 className='text-2xl md:text-3xl'>
          <span className='text-bg'>Carte de Continuonus</span>
        </h1>
        <p className='map-label hidden'>Label style</p>
      </header>

      {/* <div>
        hlp
      </div> */}

      <Menu />
    </div>
  )
}

export default App
