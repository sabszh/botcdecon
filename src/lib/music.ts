// Simple singleton background music controller
class BackgroundMusicController {
  private audio: HTMLAudioElement | null = null
  private initialized = false
  private original = 1
  private unlocked = false

  // Web Audio
  private ctx: (AudioContext | null) = null
  private source: MediaElementAudioSourceNode | null = null
  private gain: GainNode | null = null

  init(src: string = '/audio/backgroundmusic.mp3', originalVolume = 1) {
    if (this.initialized) return
    this.original = clamp01(originalVolume)

    const el = new Audio(src)
    el.loop = true
    el.volume = this.original
    // iOS requires both property and attribute for inline playback
    // @ts-ignore
    el.playsInline = true
    try { el.setAttribute('playsinline', 'true') } catch {}
    el.preload = 'auto'
    this.audio = el

    this.initialized = true

    // Register gesture listeners to unlock audio context when user interacts
    const startOnGesture = async () => {
      await this.unlockNow()
      window.removeEventListener('pointerdown', startOnGesture)
      window.removeEventListener('click', startOnGesture)
      window.removeEventListener('touchstart', startOnGesture)
      window.removeEventListener('touchend', startOnGesture)
      window.removeEventListener('keydown', startOnGesture)
    }

    window.addEventListener('pointerdown', startOnGesture, { once: true, passive: true })
    window.addEventListener('click', startOnGesture, { once: true })
    window.addEventListener('touchstart', startOnGesture, { once: true, passive: true })
    window.addEventListener('touchend', startOnGesture, { once: true })
    window.addEventListener('keydown', startOnGesture, { once: true })

    // ⚠️ Removed eager autoplay attempt — it’s blocked on iOS anyway

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.resumeCtx().catch(() => {})
        await this.play().catch(() => {})
      }
    })

    // --- KEEP-ALIVE + VISIBILITY FIXES ---
    // Prevent browsers (especially iOS) from suspending audio after idle
    setInterval(() => {
      if (this.ctx && this.ctx.state === 'running' && this.audio && !this.audio.paused) {
        try {
          this.gain?.gain.setValueAtTime(this.gain.gain.value, this.ctx.currentTime)
        } catch {}
      }
    }, 15000)

    // Ensure playback resumes when tab or screen becomes visible again
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        try {
          await this.resumeCtx()
          if (this.audio && this.audio.paused) {
            await this.audio.play().catch(() => {})
          }
        } catch {}
      }
    })
    // --- END FIXES ---
  }

  /** Public helper: manually unlock audio context and playback (iOS fix) */
  async unlockNow() {
    if (this.unlocked) return
    this.unlocked = true
    this.ensureChain()

    if (!this.audio) return

    try {
      // Build Web Audio graph now that gesture happened
      this.ensureChain()

      // Muted play to unlock HTMLMediaElement
      this.audio.muted = true
      await this.audio.play().catch(() => {})
      this.audio.pause()
      this.audio.muted = false

      await this.resumeCtx()
      await this.play().catch(() => {})

      try { localStorage.setItem('audioAllowed', '1') } catch {}
    } catch (e) {
      console.warn('[BGM] unlockNow failed', e)
    }
  }

  private ensureChain() {
    if (!this.audio) return
    if (!this.ctx && this.unlocked) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (Ctx) this.ctx = new Ctx()
    }
    if (this.ctx && !this.source) {
      try {
        this.source = this.ctx.createMediaElementSource(this.audio)
      } catch {
        // Ignore duplicate source errors
      }
    }
    if (this.ctx && !this.gain) {
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.original
    }
    if (this.ctx && this.source && this.gain) {
      try { this.source.disconnect() } catch {}
      try { this.gain.disconnect() } catch {}
      this.source.connect(this.gain)
      this.gain.connect(this.ctx.destination)
    }
  }

  private async resumeCtx() {
    this.ensureChain()
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume() } catch {}
    }
  }

  async play() {
    if (!this.audio) return
    this.ensureChain()
    await this.resumeCtx()
    try {
      await this.audio.play()
    } catch (e) {
      throw e
    }
  }

  private rampTo(volume: number, durationMs = 600) {
    const v = clamp01(volume)
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime
      this.gain.gain.cancelScheduledValues(now)
      this.gain.gain.setValueAtTime(this.gain.gain.value, now)
      this.gain.gain.linearRampToValueAtTime(v, now + Math.max(0, durationMs) / 1000)
    } else if (this.audio) {
      // Fallback for browsers without Web Audio
      this.audio.volume = v
    }
  }

  fadeDown(duration = 600, to = 0.15) {
    this.rampTo(to, duration)
  }

  fadeUp(duration = 600) {
    this.rampTo(this.original, duration)
  }
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

export const bgm = new BackgroundMusicController()
