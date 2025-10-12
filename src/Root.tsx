import { useContext, useRef } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { CSSTransition } from 'react-transition-group'
import { AppContext } from './main'
import Menu from './Menu'

export default function () {
  const { appState } = useContext(AppContext)
  const headerRef = useRef(null)

  return (
    <div className=''>
      <CSSTransition in={appState.headerVisible} nodeRef={headerRef} classNames='fade' timeout={300} unmountOnExit>
        <header ref={headerRef} className='absolute top-0 left-0 m-10 md:m-16 z-20 mr-32'>
          <h1 className='text-2xl md:text-3xl'>
            <Link to="/" className='text-bg'>Carte de Continuonus</Link>
          </h1>
        </header>
      </CSSTransition>

      <main>
        <Outlet/>
      </main>

      <Menu/>
    </div>
  )
}

