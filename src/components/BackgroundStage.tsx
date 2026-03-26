import React, { Suspense, lazy } from 'react'

const MapCanvas = lazy(() => import('../map/Canvas'))

const VIDEO_SOURCES = [
  { src: '/video/background-loop.webm', type: 'video/webm' },
  { src: '/video/background-loop.mp4', type: 'video/mp4' }
] as const

const VIDEO_POSTER = '/video/background-poster.jpg'

type Props = {
  needsAudioUnlock: boolean
  onUnlockIntent: () => void
  sceneKey: string
}

export default function BackgroundStage ({
  needsAudioUnlock,
  onUnlockIntent,
  sceneKey
}: Props) {
  const [selectedVideoSrc, setSelectedVideoSrc] = React.useState<string | null>(null)
  const [isVideoReady, setIsVideoReady] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function probeVideoSources () {
      for (const source of VIDEO_SOURCES) {
        try {
          const res = await fetch(source.src, {
            method: 'HEAD',
            cache: 'force-cache',
            signal: controller.signal
          })
          if (res.ok) {
            if (!cancelled) setSelectedVideoSrc(source.src)
            return
          }
        } catch {
          // Ignore network and 404 failures; the Three fallback stays active.
        }
      }

      if (!cancelled) setSelectedVideoSrc(null)
    }

    probeVideoSources().catch(() => {})

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return (
    <div
      className='absolute inset-0 -z-10 overflow-hidden bg-[#b2a4b6]'
      onPointerDown={() => { if (needsAudioUnlock) onUnlockIntent() }}
      onClick={() => { if (needsAudioUnlock) onUnlockIntent() }}
    >
      {selectedVideoSrc && (
        <video
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted
          loop
          playsInline
          preload='metadata'
          poster={VIDEO_POSTER}
          onCanPlay={() => setIsVideoReady(true)}
          onLoadedData={() => setIsVideoReady(true)}
          onError={() => {
            setSelectedVideoSrc(null)
            setIsVideoReady(false)
          }}
        >
          <source src={selectedVideoSrc} />
        </video>
      )}

      {(!selectedVideoSrc || !isVideoReady) && (
        <Suspense fallback={null}>
          <MapCanvas key={sceneKey} onObjLoaded={() => {}} />
        </Suspense>
      )}
    </div>
  )
}
