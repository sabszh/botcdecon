import { useState, useRef } from 'react'
import { CSSTransition } from 'react-transition-group'
import { Link } from 'react-router-dom'

export default function () {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnClick = () => {
    setMenuOpen(!menuOpen)
  }
  const menuRef = useRef(null)

  return (
    <div className='contents'>
      <CSSTransition in={menuOpen} nodeRef={menuRef} classNames='fade-right' timeout={300} unmountOnExit>
        <div ref={menuRef} className='fixed top-0 right-0 bottom-0 p-6 md:p-12 w-full max-w-lg z-20'>
          <div className='bg-white rounded-3xl px-10 py-8 min-h-full overflow-y-auto shadow-lg flex flex-col'>
            <ul className='mt-12 blur flex-auto'>
              <li className='mb-4'>
                <a href='#' className='text-xl md:text-2xl'>Save a memory</a>
              </li>
              <li className='mb-4'>
                <a href='#' className='text-xl md:text-2xl'>Explore memories</a>
              </li>
              <li className='mb-4'>
                <Link to='about' className='text-xl md:text-2xl'>About the carte</Link>
              </li>
            </ul>
            <div className='text-sm mb-2'>
              <a href='#' className=''>Imprint</a>
              <span> &middot; </span>
              <a href='#' className=''>Privacy</a>
              <span> &middot; </span>
              <a href='#' className=''>Credits</a>
            </div>
            <div className='text-xs'>&copy; 2023 Studio Olafur Eliason GmbH</div>
          </div>
        </div>
      </CSSTransition>

      <div className='fixed top-0 right-0 m-10 md:m-16 z-30 blur'>
        <button onClick={menuBtnClick} className='text-bg text-3xl'>
          <span className='sr-only'>Menu</span>
          <img src={menuOpen ? '/x.svg' : '/bars.svg'} alt='Menu' className='' style={{ width:'28px', height:'15px' }}/>
        </button>
      </div>
    </div>
  )
}
