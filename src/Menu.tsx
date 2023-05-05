import { useRef, useContext } from 'react'
import { CSSTransition } from 'react-transition-group'
import { Link } from 'react-router-dom'
import { AppContext } from './main'
import { useNavigate } from 'react-router-dom'

export default function () {
  const { appState, setAppState } = useContext(AppContext)
  const navigate = useNavigate()

  const menuBtnClick = () => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, menuOpen: !appState.menuOpen }))
  }
  const close = () => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, menuOpen: false }))
  }

  const toSave = () => {
    // @ts-ignore-line
    setAppState(state => ({ ...state, viewMode: 'post', introSeen: true, headerVisible: false, zoomIn: true }))
  }
  const toExplore = () => {
    // @ts-ignore-line
    setAppState(state => ({
      ...state,
      viewMode: 'explore',
      introSeen: true,
      headerVisible: false,
      zoomIn: true,
      currentEntry: null
    }))
    navigate('/')
  }

  const menuRef = useRef(null)

  return (
    <div className='contents'>
      <CSSTransition in={appState.menuOpen} nodeRef={menuRef} classNames='fade-right' timeout={300} unmountOnExit>
        <div ref={menuRef} onClick={close} className='fixed top-0 right-0 bottom-0 p-4 md:p-12 w-full max-w-lg z-20 blurX'>
          <div className='bg-white rounded-2xl md:rounded-3xl px-10 py-8 min-h-full overflow-y-auto shadow-lg flex flex-col'>
            <ul className='mt-12 flex-auto'>
              <li className='mb-4'>
                <Link to='/' onClick={toSave} className='text-xl md:text-2xl'>Save a memory</Link>
              </li>
              <li className='mb-4'>
                <Link to='/' onClick={toExplore} className='text-xl md:text-2xl'>Explore memories</Link>
              </li>
              <li className='mb-4'>
                <Link to='about' className='text-xl md:text-2xl'>About the carte</Link>
              </li>
            </ul>
            <div className=''>
              <div className='text-sm mb-2'>
                <Link to='/impressum' className=''>Imprint</Link>
                <span> &middot; </span>
                <Link to='/privacy' className=''>Privacy</Link>
                <span> &middot; </span>
                <Link to='/credits' className=''>Credits</Link>
              </div>
              <div className='text-xs'>&copy; 2023 Helene Nymann</div>
            </div>
          </div>
        </div>
      </CSSTransition>

      <CSSTransition in={appState.viewMode === 'filtered'} nodeRef={menuRef} classNames='fade' timeout={300} unmountOnExit>
        <div className='fixed top-0 right-20 m-6 md:m-16 z-10 blurX'>
          <button onClick={toExplore} className='text-bg bg-white text-3xl'>
            <span className='sr-only'>Close</span>
            <img src='/x.svg' alt='Close' className='' style={{ width:'28px', height:'15px' }}/>
          </button>
        </div>
      </CSSTransition>

      <div className='fixed top-0 right-0 m-6 md:m-16 z-30 blurX'>
        <button onClick={menuBtnClick} className='text-bg text-3xl'>
          <span className='sr-only'>Menu</span>
          <img src={appState.menuOpen ? '/x.svg' : '/bars.svg'} alt='Menu' className='' style={{ width:'28px', height:'15px' }}/>
        </button>
      </div>
    </div>
  )
}
