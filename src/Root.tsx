import { Link, Outlet } from 'react-router-dom'
import Menu from './Menu'

export default function () {
  return (
    <div className='App'>
      <header className='absolute top-0 left-0 m-10 md:m-16 z-10 blur'>
        <p className='mb-0.5 mx-2'>
          <span className='text-bg'>Welcome to the</span>
        </p>
        <h1 className='text-2xl md:text-3xl'>
          <Link to="/" className='text-bg'>Carte de Continuonus</Link>
        </h1>
        <p className='map-label hidden'>Label style</p>
      </header>

      <main>
        <Outlet/>
      </main>

      <Menu/>
    </div>
  )
}
