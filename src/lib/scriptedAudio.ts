let scriptedAudio: HTMLAudioElement | null = null
let pendingUnlock: Promise<void> | null = null
let unlocked = false
const SCRIPTED_AUDIO_VERSION = import.meta.env.VITE_SCRIPTED_AUDIO_VERSION || '20260425-return-exit-hint-1'

export function scriptedAudioSrc(language: string, label: string): string {
  const base = `/audio/${language}_${label}.mp3`
  return `${base}?v=${encodeURIComponent(SCRIPTED_AUDIO_VERSION)}`
}

export function getScriptedAudioElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (scriptedAudio) return scriptedAudio

  const el = new Audio()
  el.preload = 'auto'
  ;(el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  try { el.setAttribute('playsinline', 'true') } catch {}
  scriptedAudio = el
  return el
}

export async function unlockScriptedAudio(src = scriptedAudioSrc('en', 'THANK_YOU')): Promise<void> {
  if (pendingUnlock) return pendingUnlock
  const el = getScriptedAudioElement()
  if (!el) return

  pendingUnlock = (async () => {
    const previousSrc = el.currentSrc || el.src
    const previousMuted = el.muted
    const needsTemporarySrc = !previousSrc
    const temporarySrc = new URL(src, window.location.href).href

    try {
      el.muted = true
      if (needsTemporarySrc) {
        el.src = src
        try { el.load?.() } catch {}
      }
      await el.play()
      if (!needsTemporarySrc || el.src === temporarySrc) {
        try { el.pause() } catch {}
        try { el.currentTime = 0 } catch {}
      }
      unlocked = true
    } finally {
      if (!needsTemporarySrc || el.src === temporarySrc) {
        el.muted = previousMuted
      }
      if (needsTemporarySrc && el.src === temporarySrc) {
        try { el.removeAttribute('src') } catch {}
        try { el.load?.() } catch {}
      }
    }
  })().finally(() => {
    pendingUnlock = null
  })

  return pendingUnlock
}

export function waitForScriptedAudioUnlock(): Promise<void> {
  return pendingUnlock || Promise.resolve()
}

export function hasPendingScriptedAudioUnlock(): boolean {
  return Boolean(pendingUnlock)
}

export function isScriptedAudioUnlocked(): boolean {
  return unlocked
}

export function stopScriptedAudio(): void {
  const el = scriptedAudio
  if (!el) return

  try { el.pause() } catch {}
  try { el.currentTime = 0 } catch {}
  el.muted = false
  el.onplay = null
  el.onloadedmetadata = null
  el.ontimeupdate = null
  el.onpause = null
  el.onended = null
  el.onerror = null
  try { el.removeAttribute('src') } catch {}
  try { el.load?.() } catch {}
}
