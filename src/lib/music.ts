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
    // iOS ignores HTMLMediaElement.volume; we still set it as a fallback on desktop
    el.volume = this.original
    // @ts-ignore
    el.playsInline = true
    // Ensure attribute as well (some iOS builds check attribute form)
    try { el.setAttribute('playsinline', 'true') } catch {}
    el.preload = 'auto'
    this.audio = el

    // Do NOT eagerly create/resume AudioContext on iOS; wait for a gesture
    // We still prepare the chain after unlocking to control gain reliably

    this.initialized = true

    const startOnGesture = async () => {
      try {
        // Mark as unlocked so context/graph is created only after a gesture
        this.unlocked = true
        // Build WebAudio chain now that we have a user gesture
        this.ensureChain()
        // iOS autoplay policy: perform a muted play first to unlock the element
        if (this.audio) {
          try {
            this.audio.muted = true
            const unlocked = await this.audio.play().then(() => true).catch(() => false)
            this.audio.muted = false
            // Mark consent if unlock succeeded
            try { if (unlocked) localStorage.setItem('audioAllowed', '1') } catch {}
          } catch {}
        }
        await this.resumeCtx()
        await this.play().then(() => {
          try { localStorage.setItem('audioAllowed', '1') } catch {}
        }).catch(() => {})
      } finally {
        window.removeEventListener('pointerdown', startOnGesture)
        window.removeEventListener('click', startOnGesture)
        window.removeEventListener('touchstart', startOnGesture)
        window.removeEventListener('touchend', startOnGesture)
        window.removeEventListener('keydown', startOnGesture)
      }
    }
    window.addEventListener('pointerdown', startOnGesture, { once: true, passive: true })
    window.addEventListener('click', startOnGesture, { once: true })
    window.addEventListener('touchstart', startOnGesture, { once: true, passive: true })
    window.addEventListener('touchend', startOnGesture, { once: true })
    window.addEventListener('keydown', startOnGesture, { once: true })

    // Initial attempt (may be blocked on iOS; gesture handler above will recover)
    this.play().catch(() => {})

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.resumeCtx().catch(() => {})
        await this.play().catch(() => {})
      }
    })
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
      } catch (_e) {
        // If source already exists or failed, ignore
      }
    }
    if (this.ctx && !this.gain) {
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.original
    }
    if (this.ctx && this.source && this.gain) {
      try {
        this.source.disconnect()
      } catch {}
      try {
        this.gain.disconnect()
      } catch {}
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
      // Fallback for non–Web Audio browsers
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

function clamp01(x: number) { return Math.max(0, Math.min(1, x)) }

export const bgm = new BackgroundMusicController()
