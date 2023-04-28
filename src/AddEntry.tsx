import { TypeAnimation } from 'react-type-animation'
import { CSSTransition } from 'react-transition-group'
import { useState, useContext, useMemo } from 'react'
import { AppContext } from './main'
import knot from './assets/knot-1.png'

const api = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function () {
  const { appState, setAppState } = useContext(AppContext)

  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')

  const [shownPickIntro, setShownPickIntro] = useState(false)

  const points = useMemo(() => appState.entryPoints, [appState.entryPoints])
  const showSave = useMemo(() => points.length > 0, [points])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit (e: any) {
    e.preventDefault()

    if (text.length < 10) return

    // @ts-ignore-line
    setAppState(state => ({ ...state, viewMode: 'pick', zoomIn: true, entryPoints: [] }))
  }

  async function saveEntry (e: any) {
    e.preventDefault()

    setSaving(true)
    try {
      const res = await fetch(`${api}/entries`, {
        method: 'POST',
        body: JSON.stringify({ text, name, location, points })
      })
      setSaved(true)
      setText('')
      setName('')
      setLocation('')
      // TODO: save the response in state?
      setSaving(false)
       // @ts-ignore-line
      setAppState(state => ({ ...state, viewMode: 'saved' }))
      console.log(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  const picking = useMemo(() => {
    return appState.viewMode === 'pick' || appState.viewMode === 'saved'
  }, [appState.viewMode])

  function goExplore () {
    // @ts-ignore-line
    setAppState(state => ({ ...state, viewMode: 'explore', entryPoints: [] }))
    reset()
  }
  function reset () {
    setSaved(false)
    setText('')
    setName('')
    setLocation('')
    setSaving(false)
  }

  return (
    <>
      <CSSTransition in={appState.viewMode === 'post'} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute top-0 left-0 right-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40'>
          <form onSubmit={handleSubmit} method='post' className='w-full max-w-2xl mx-auto'>
            <p className='text-2xl md:text-3xl whitespace-pre-line'>
              <TypeAnimation
                sequence={['What do you want the future to remember?']}
                repeat={0}
                cursor={false}
                speed={60}
                wrapper='span'
                className='text-bg'/>
            </p>
            <div className='w-full flex flex-wrap'>
              <textarea autoFocus={true} value={text} onChange={e => setText(e.target.value)} name="text" placeholder='Type your message here' rows={5} className='w-full mt-2 px-4 py-3 text-xl bg-white bg-opacity-95 rounded-3xl' required/>
              <div className='w-1/2 pr-2'>
                <input value={name} onChange={e => setName(e.target.value)} name="name" placeholder='Your name (optional)' className='w-full mt-2 px-4 py-3 text-xl bg-white bg-opacity-95 rounded-3xl'/>
              </div>
              <div className='w-1/2'>
                <input value={location} onChange={e => setLocation(e.target.value)} name="location" placeholder='Location (optional)' className='w-full mt-2 px-4 py-3 text-xl bg-white bg-opacity-95 rounded-3xl'/>
              </div>
              <div className='mt-2 w-full'>
                <button type='submit' className='text-bg active:bg-opacity-50 text-xl md:text-2xl inline-block'>
                  <span>Next</span>
                  <img src={knot} className='inline-block ml-2 h-6 md:h-8'/>
                </button>
              </div>
            </div>
          </form>
        </div>
      </CSSTransition>

      <CSSTransition in={picking && !shownPickIntro} timeout={300} classNames='fade' unmountOnExit>
        <div className='absolute top-0 left-0 right-0 m-10 md:m-16 z-10 blur pt-32 md:pt-40 pointer-events-none'>
          <p className='text-2xl md:text-3xl whitespace-pre-line'>
            <TypeAnimation
              sequence={['When the future remembers your memory, how do you think it will make the future feel?', 2000, 'Place your memory in this landscape of emotions by moving the pointer.', 3000, '', () => {
                setShownPickIntro(true)
              }]}
              repeat={0}
              cursor={false}
              speed={60}
              deletionSpeed={99}
              wrapper='span'
              className='text-bg'/>
          </p>
        </div>
      </CSSTransition>

      <CSSTransition in={picking && showSave && !saved} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute bottom-0 left-0 right-0 m-10 md:m-16 z-10 blur'>
          <form onSubmit={saveEntry} className='text-center'>
            <div className='mt-2 w-full'>
              <button disabled={saving} type='submit' className='text-bg active:bg-opacity-50 text-2xl md:text-3xl inline-block'>
                <span>{ saving ? 'Saving...' : 'Save your memory' }</span>
              </button>
            </div>
          </form>
        </div>
      </CSSTransition>

      <CSSTransition in={picking && saved} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute bottom-0 left-0 right-0 m-10 md:m-16 z-10 blur'>
          <div className='text-center'>
            <div className='mt-2 w-full'>
              <TypeAnimation
                sequence={['Your memory has been saved!']}
                repeat={0}
                cursor={false}
                speed={60}
                wrapper='span'
                className='text-bg text-2xl md:text-3xl'/>
            </div>
            <div className='mt-3.5'>
              <button onClick={goExplore} className='text-bg active:bg-opacity-50 text-2xl md:text-3xl inline-block'>
                <span>Explore memories</span>
              </button>
            </div>
          </div>
        </div>
      </CSSTransition>
    </>
  )
}
