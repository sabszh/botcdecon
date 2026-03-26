import React, { useContext, useEffect, useRef, useState, Suspense, lazy } from 'react'
import { AppContext } from '../context/AppContext'
import { bgm } from '../lib/music'
import MapCanvas from '../map/Canvas'
import SplashHippoCanvas from '../map/SplashHippoCanvas'

const ChatPanel = lazy(() => import('../components/ChatPanel'))
const ACTIVITY_RESET_THROTTLE_MS = 700

export default function Home() {
  const [language, setLanguage] = useState<'en' | 'da' | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState<boolean>(() => {
    const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    try { return isiOS && localStorage.getItem('audioAllowed') !== '1' } catch { return isiOS }
  })
  const { setAppState } = useContext(AppContext)
  const inactivityTimer = useRef<number | undefined>(undefined)
  const lastActivityRef = useRef(0)

  // One-shot unlock+play helper kept as synchronous as possible for iOS
  const unlockAndPlay = async () => {
    try {
      // Fire-and-forget to stay within gesture handling call stack
      bgm.resumeCtx().catch(() => {})
      bgm.unlockNow().catch(() => {})
      await bgm.play().catch(() => {})
      try { localStorage.setItem('audioAllowed', '1') } catch {}
    } finally {
      setNeedsAudioUnlock(false)
    }
  }

  // Reset to language selection after 3 minutes of no activity while in chat
  useEffect(() => {
    if (!language) return

    const resetTimer = () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      inactivityTimer.current = window.setTimeout(() => {
        // Interaction ended: fade music back up
        bgm.fadeUp(800)
        setLanguage(null)
        // Reset background state so hippocampus splash is shown
        // @ts-ignore-line
        setAppState((s) => ({ ...s, headerVisible: true, viewMode: 'empty', zoomIn: false }))
      }, 180000) // 3 minutes
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastActivityRef.current < ACTIVITY_RESET_THROTTLE_MS) return
      lastActivityRef.current = now
      resetTimer()
    }

    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
      'wheel'
    ]
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }))
    resetTimer()

    return () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      events.forEach((ev) => window.removeEventListener(ev, onActivity))
    }
  }, [language, setAppState])

  // Language selection — now iOS-safe for autoplay
  // Home.tsx  — STEP 2: robust iOS unlock + start + fade
  const pick = async (lang: 'en' | 'da') => {
    setLanguage(lang)

    try {
      // Make sure context is ready, then unlock, then play
      await bgm.resumeCtx().catch(() => {})
      await bgm.unlockNow().catch(() => {})
      await bgm.play().catch(() => {})

      // Subtle but clearly audible background level during chat (~ -22 dB)
      // Previously 0.0315 was too quiet on many devices
      bgm.fadeDown(600, 0.08)
    } catch (e) {
      console.warn('[BGM] Playback blocked or failed', e)
    }

    // Engage map / UI state
    // @ts-ignore
    setAppState((s) => ({ ...s, headerVisible: false, viewMode: 'post', zoomIn: true }))
  }

  // If audio previously allowed, ensure autoplay when landing on Home (language null)
  useEffect(() => {
    if (language === null) {
      try {
        if (localStorage.getItem('audioAllowed') === '1') {
          bgm.resumeCtx().catch(() => {})
          bgm.play().catch(() => {})
        }
      } catch {}
    }
  }, [language])

  // Global “tap anywhere” handler on iOS for first visit to unlock & start audio
  useEffect(() => {
    if (!needsAudioUnlock) return
    const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    if (!isiOS) return
    const onFirstGesture = () => { unlockAndPlay() }
    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true })
    window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true })
    window.addEventListener('click', onFirstGesture, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture)
      window.removeEventListener('touchstart', onFirstGesture)
      window.removeEventListener('click', onFirstGesture)
    }
  }, [needsAudioUnlock])


  return (
    <div className='relative w-full h-screen'>
      {/* iOS audio unlock gate — ensures immediate playback on load/reload */}
      {needsAudioUnlock && (
        <div
          role='button'
          onClick={unlockAndPlay}
          onTouchStart={unlockAndPlay}
          onPointerDown={unlockAndPlay}
          className='absolute inset-0 z-50 flex items-center justify-center bg-black/60 text-white'
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className='rounded-2xl border border-white/30 bg-white/10 px-6 py-4 text-2xl'>
            <span className='block text-center'>Tap to enable sound</span>
            <span className='block text-center opacity-80 text-lg mt-1'>Tryk for at aktivere lyd</span>
          </div>
        </div>
      )}
      <div
        className='absolute inset-0 -z-10 overflow-hidden'
        onPointerDown={() => { if (needsAudioUnlock) unlockAndPlay() }}
        onClick={() => { if (needsAudioUnlock) unlockAndPlay() }}
      >
        {language
          ? <MapCanvas key={language} onObjLoaded={() => {}} />
          : <SplashHippoCanvas />}
      </div>
      <div className='absolute inset-0 -z-5 bg-gradient-to-br from-white/20 via-white/10 to-white/20' />

      {!language && (
        <div className='absolute inset-0 flex items-center justify-center z-10'>
          <div className='surface-card rounded-[2rem] px-10 py-8 text-black'>
            <p className='text-2xl uppercase tracking-[0.22em] text-black/80 text-center mb-5'>
              Select Language
            </p>
            <div className='flex gap-4 justify-center'>
              <button
                type='button'
                className='surface-pill rounded-full px-8 py-4 text-2xl transition hover:bg-white hover:text-black'
                onClick={() => pick('en')}
              >
                English
              </button>
              <button
                type='button'
                className='surface-pill rounded-full px-8 py-4 text-2xl transition hover:bg-white hover:text-black'
                onClick={() => pick('da')}
              >
                Dansk
              </button>
            </div>
          </div>
        </div>
      )}

      {language && (
        <>
          {/* Fixed top header with Return */}
          <div className='absolute top-0 left-0 right-0 z-30 flex justify-center pt-4'>
            <div className='surface-card w-[1100px] max-w-[95vw] rounded-[2rem] px-6 py-4 text-black'>
              <div className='flex items-center gap-3 justify-between'>
                <h2 className='text-2xl md:text-3xl font-medium tracking-[0.08em]'>
                  Bot de Continuonus
                </h2>
                <button
                  type='button'
                  className='surface-pill rounded-full px-4 py-2 text-xl text-black transition hover:bg-white hover:text-black'
                  onClick={() => {
                    // Leaving interaction: fade up
                    bgm.fadeUp(800)
                    setLanguage(null)
                    // Reset background state so hippocampus splash is shown
                    // @ts-ignore-line
                    setAppState((s) => ({
                      ...s,
                      headerVisible: true,
                      viewMode: 'empty',
                      zoomIn: false
                    }))
                  }}
                >
                  {language === 'da' ? 'Tilbage' : 'Return'}
                </button>
              </div>
            </div>
          </div>

          {/* Chat panel anchored to bottom */}
          <div className='absolute inset-0 z-20 flex items-end justify-center pb-6'>
            <Suspense fallback={null}>
              <ChatPanel
                language={language}
                onChangeLanguage={() => {
                  // Leaving interaction: fade up
                  bgm.fadeUp(800)
                  setLanguage(null)
                  // Reset background state so hippocampus splash is shown
                  // @ts-ignore-line
                  setAppState((s) => ({
                    ...s,
                    headerVisible: true,
                    viewMode: 'empty',
                    zoomIn: false
                  }))
                }}
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  )
}
