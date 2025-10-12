import React, { useContext, useEffect, useRef, useState } from 'react'
import { AppContext } from '../main'
import ChatPanel from '../components/ChatPanel'
import MapCanvas from '../map/Canvas'

export default function Home () {
  const [language, setLanguage] = useState<'en' | 'da' | null>(null)
  const { setAppState } = useContext(AppContext)
  const inactivityTimer = useRef<number | undefined>(undefined)

  // Reset to language selection after 3 minutes of no activity while in chat
  useEffect(() => {
    if (!language) return

    const resetTimer = () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      inactivityTimer.current = window.setTimeout(() => {
        setLanguage(null)
        // Reset background state so hippocampus splash is shown
        // @ts-ignore-line
        setAppState((s) => ({ ...s, headerVisible: true, viewMode: 'empty', zoomIn: false }))
      }, 180000) // 3 minutes
    }

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'wheel']
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      events.forEach((ev) => window.removeEventListener(ev, resetTimer as any))
    }
  }, [language, setAppState])

  const pick = (lang: 'en' | 'da') => {
    setLanguage(lang)
    // Engage zoom/pan map behind chat
    // @ts-ignore-line
    setAppState((s) => ({ ...s, headerVisible: false, viewMode: 'post', zoomIn: true }))
  }

  return (
    <div className='relative w-full h-screen'>
      <div className='absolute inset-0 -z-10'>
        {/* Remount Canvas when language changes to reset camera/scene */}
        <MapCanvas key={language || 'splash'} onObjLoaded={() => {}} />
      </div>
      <div className='absolute inset-0 -z-5 bg-gradient-to-br from-white/20 via-white/10 to-white/20' />

      {!language && (
        <div className='absolute inset-0 flex items-center justify-center z-10'>
          <div className='px-10 py-8 text-black'>
            <p className='text-2xl uppercase tracking-widest text-black/80 text-center mb-4'>Select Language</p>
            <div className='flex gap-4 justify-center'>
              <button type='button' className='rounded-full border border-black px-8 py-4 text-2xl transition hover:bg-black hover:text-white' onClick={() => pick('en')}>English</button>
              <button type='button' className='rounded-full border border-black px-8 py-4 text-2xl transition hover:bg-black hover:text-white' onClick={() => pick('da')}>Dansk</button>
            </div>
          </div>
        </div>
      )}

      {language && (
        <div className='absolute inset-0 z-20 flex items-center justify-center'>
          <ChatPanel language={language} onChangeLanguage={() => {
            setLanguage(null)
            // Reset background state so hippocampus splash is shown
            // @ts-ignore-line
            setAppState((s) => ({ ...s, headerVisible: true, viewMode: 'empty', zoomIn: false }))
          }} />
        </div>
      )}
    </div>
  )
}
