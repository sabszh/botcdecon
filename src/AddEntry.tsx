import type { Entry } from './main'
import { TypeAnimation } from 'react-type-animation'
import { CSSTransition } from 'react-transition-group'
import { useState, useRef, useContext, useMemo } from 'react'
import { AppContext } from './main'
// import Turnstile from 'react-turnstile'
import knot from './assets/knot-1.png'

const api = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function ({ onRestart }: { onRestart: () => void }) {
  const { appState, setAppState } = useContext(AppContext)

  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [token, setToken] = useState('')

  const [shownPickIntro, setShownPickIntro] = useState(false)

  const points = useMemo(() => appState.entryPoints, [appState.entryPoints])
  const showSave = useMemo(() => points.length > 0, [points])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(false)
  const [saved, setSaved] = useState(false)

  const [region, setRegion] = useState('')
  handleRegion()

  async function handleSubmit (e: any) {
    e.preventDefault()

    if (text.length < 10) return

    // @ts-ignore-line
    setAppState(state => ({ ...state, viewMode: 'pick', zoomIn: true, entryPoints: [] }))
  }

  const viewIntro = () => {
    onRestart()
  }

  async function saveEntry (e: any) {
    e.preventDefault()

    setErr(false)
    setSaving(true)

    const onsite = appState.onsite

    try {
      const res = await fetch(`${api}/entries`, {
        method: 'POST',
        body: JSON.stringify({ text, name, location, points, onsite, token, region })
      })
      if (res?.status >= 400) {
        setSaving(false)
        setErr(true)
        return
      }
      setSaved(true)
      setText('')
      setName('')
      setLocation('')
      setToken('')
      setSaving(false)
       // @ts-ignore-line
      setAppState(state => ({ ...state, viewMode: 'saved' }))

      const entry = await res.json()

      const myEntries: Entry[] = JSON.parse(localStorage?.getItem('entries') || '[]')
      myEntries.push(entry)
      localStorage?.setItem('entries', JSON.stringify(myEntries))
      // @ts-ignore-line
      setAppState(state => ({ ...state, myEntries }))
    } catch (err) {
      console.error(err)
    }
  }

  const picking = useMemo(() => {
    return appState.viewMode === 'pick' || appState.viewMode === 'saved'
  }, [appState.viewMode])

  function startAgain () {
    // @ts-ignore-line
    setAppState(state => ({ ...state, viewMode: 'post', zoomIn: false }))
    reset()
  }
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
    setRegion('')
  }

  async function handleRegion () {
    if (region !== '') return

    try {
      const res = await fetch('/region')
      const data = await res.json()
      console.log('got', data)
      setRegion(data.where)
    } catch (err) {
      console.log('region error', err)
      setRegion('Offline')
    }
  }

  const ref1 = useRef(null)
  const ref2 = useRef(null)
  const ref3 = useRef(null)
  const ref4 = useRef(null)
  const ref5 = useRef(null)

  return (
    <>
      <CSSTransition nodeRef={ref1} in={appState.viewMode === 'post'} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute top-0 left-0 right-0 m-10 md:m-16 z-10 blurX pt-32 md:pt-40'>
          <form onSubmit={handleSubmit} method='post' className='w-full max-w-2xl mx-auto'>
            {/* <Turnstile
              sitekey='0x4AAAAAAAEcpIvYt90dSRB7'
              onVerify={setToken}/> */}
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
              <textarea autoFocus={true} value={text} onChange={e => setText(e.target.value)} name="text" placeholder='Type your message here' rows={5} className='w-full mt-2 px-4 py-3 text-xl bg-white bg-opacity-95 rounded-t-3xl' required minLength={10}/>
              <div className='w-1/2 pr-0.5 mt-0.5'>
                <input value={name} onChange={e => setName(e.target.value)} name="name" placeholder='Your name (optional)' className='w-full px-4 py-3 text-xl bg-white bg-opacity-95 rounded-bl-3xl'/>
              </div>
              <div className='w-1/2 mt-0.5'>
                <input value={location} onChange={e => setLocation(e.target.value)} name="location" placeholder='Location (optional)' className='w-full px-4 py-3 text-xl bg-white bg-opacity-95 rounded-br-3xl'/>
              </div>
              <div className='mt-2 w-full flex'>
                <button onClick={viewIntro} type='button' className='text-bg active:bg-opacity-50 text-xl md:text-2xl inline-block mr-2'>
                  <span>Previous</span>
                </button>
                <button type='submit' className='text-bg active:bg-opacity-50 text-xl md:text-2xl inline-block'>
                  <span>Next</span>
                  <img src={knot} className='inline-block ml-2 h-6 md:h-8'/>
                </button>
              </div>
            </div>
          </form>
        </div>
      </CSSTransition>

      <CSSTransition nodeRef={ref2} in={picking && !shownPickIntro} timeout={300} classNames='fade' unmountOnExit>
        <div className='absolute top-0 left-0 right-0 m-10 md:m-16 z-10 blurX pt-32 md:pt-40 pointer-events-none'>
          <p className='text-2xl md:text-3xl whitespace-pre-line'>
            <TypeAnimation
              sequence={['If your memory was found in the future, how do you think it would make the future feel?', 4000, 'Place your memory in this landscape of emotions by clicking on the map', 4000, 'Feel free to add your memory to more than one point on the map', 4000, () => {
                setShownPickIntro(true)
              }]}
              repeat={0}
              cursor={false}
              speed={54}
              deletionSpeed={90}
              wrapper='span'
              className='text-bg'/>
          </p>
        </div>
      </CSSTransition>

      <CSSTransition nodeRef={ref3} in={picking && showSave && !saved} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute bottom-0 left-0 right-0 m-10 md:m-16 z-10 blurX'>
          <form onSubmit={saveEntry} className='text-center'>
            <CSSTransition nodeRef={ref4} in={err} classNames='fade' timeout={300} unmountOnExit>
              <div className='text-bg text-2xl md:text-3xl inline-block text-red-600'>Something went wrong, please try again</div>
            </CSSTransition>
            <div className='mt-2 w-full'>
              <button disabled={saving} type='submit' className='text-bg active:bg-opacity-50 text-2xl md:text-3xl inline-block'>
                <span>{ saving ? 'Saving...' : 'Save your memory' }</span>
              </button>
            </div>
          </form>
        </div>
      </CSSTransition>

      <CSSTransition nodeRef={ref5} in={picking && saved} classNames='fade' timeout={300} unmountOnExit>
        <div className='absolute bottom-0 left-0 right-0 m-10 md:m-16 z-10 blurX'>
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
            <div className='mt-3.5 flex items-center justify-center space-x-2'>
              <button onClick={goExplore} className='text-bg active:bg-opacity-50 text-2xl md:text-3xl inline-block'>
                <span>Explore memories</span>
              </button>
              <button onClick={startAgain} className='text-bg active:bg-opacity-50 text-2xl md:text-3xl inline-block'>
                <span>Add another memory</span>
              </button>
            </div>
          </div>
        </div>
      </CSSTransition>
    </>
  )
}
