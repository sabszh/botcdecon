import React, { useContext, useEffect, useRef, useState } from 'react'
import { AppContext } from '../context/AppContext'
import ChatPanel from '../components/ChatPanel'
import MapCanvas from '../map/Canvas'
import { bgm } from '../lib/music'

export default function Home() {
  const [language, setLanguage] = useState<'en' | 'da' | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState<boolean>(() => {
    const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    try { return isiOS && localStorage.getItem('audioAllowed') !== '1' } catch { return isiOS }
  })
  const { setAppState } = useContext(AppContext)
  const inactivityTimer = useRef<number | undefined>(undefined)

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

    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'mousemove',
      'keydown',
      'touchstart',
      'wheel'
    ]
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      events.forEach((ev) => window.removeEventListener(ev, resetTimer as any))
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


  return (
    <div className='relative w-full h-screen'>
      {/* iOS audio unlock gate — ensures immediate playback on load/reload */}
      {needsAudioUnlock && (
        <button
          type='button'
          onClick={async () => {
            try {
              await bgm.resumeCtx().catch(() => {})
              await bgm.unlockNow().catch(() => {})
              await bgm.play().catch(() => {})
              try { localStorage.setItem('audioAllowed', '1') } catch {}
            } finally {
              setNeedsAudioUnlock(false)
            }
          }}
          className='absolute inset-0 z-50 flex items-center justify-center bg-black/60 text-white'
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className='rounded-2xl border border-white/30 bg-white/10 px-6 py-4 text-2xl'>
            <span className='block text-center'>Tap to enable sound</span>
            <span className='block text-center opacity-80 text-lg mt-1'>Tryk for at aktivere lyd</span>
          </div>
        </button>
      )}

      <div className='absolute inset-0 -z-10'>
        {/* Remount Canvas when language changes to reset camera/scene */}
        <MapCanvas key={language || 'splash'} onObjLoaded={() => {}} />
      </div>
      <div className='absolute inset-0 -z-5 bg-gradient-to-br from-white/20 via-white/10 to-white/20' />

      {!language && (
        <div className='absolute inset-0 flex items-center justify-center z-10'>
          <div className='px-10 py-8 text-black'>
            <p className='text-2xl uppercase tracking-widest text-black/80 text-center mb-4'>
              Select Language
            </p>
            <div className='flex gap-4 justify-center'>
              <button
                type='button'
                className='rounded-full border border-black px-8 py-4 text-2xl transition hover:bg-black hover:text-white'
                onClick={() => pick('en')}
              >
                English
              </button>
              <button
                type='button'
                className='rounded-full border border-black px-8 py-4 text-2xl transition hover:bg-black hover:text-white'
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
            <div className='w-[1100px] max-w-[95vw] rounded-2xl bg-white/80 px-5 py-3 text-black shadow-lg backdrop-blur border border-black/10'>
              <div className='flex items-center gap-3 justify-between'>
                <h2 className='text-2xl md:text-3xl font-medium tracking-wide'>
                  Bot de Continuonus
                </h2>
                <button
                  type='button'
                  className='rounded-full border border-black/60 px-4 py-2 text-xl text-black hover:bg-black hover:text-white'
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
          </div>
        </>
      )}
    </div>
  )
}
