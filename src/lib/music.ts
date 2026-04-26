import { getAudioContextCtor } from './browserApis'

export const BGM_LEVELS = {
  idle: 0.16,
  chat: 0.045,
  active: 0.025,
} as const

type BgmMode = keyof typeof BGM_LEVELS

// Singleton background music controller.
// Audio element creation is deferred until first real playback/unlock to avoid
// downloading the full background track on initial page load.
class BackgroundMusicController {
  private audio: HTMLAudioElement | null = null
  private initialized = false
  private original = 1
  private unlocked = false
  private src = '/audio/backgroundmusic.mp3'

  // Web Audio
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private gain: GainNode | null = null
  private ducks = new Map<string, number>()
  private baseVolume = BGM_LEVELS.idle

  init(src: string = '/audio/backgroundmusic.mp3', originalVolume = 1) {
    if (this.initialized) return
    this.initialized = true
    this.src = src
    this.original = clamp01(originalVolume)
    this.baseVolume = BGM_LEVELS.idle

    const startOnGesture = () => {
      // Defer the heavier unlock work outside the input handler to keep gesture handling snappy.
      window.setTimeout(() => { void this.unlockNow() }, 0)
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

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return
      await this.resumeCtx().catch(() => {})
      if (this.audio && this.audio.paused) {
        await this.play().catch(() => {})
      }
    })

    // Keep-alive poke so long-running sessions are less likely to suspend audio.
    window.setInterval(() => {
      if (this.ctx && this.ctx.state === 'running' && this.audio && !this.audio.paused) {
        try {
          this.gain?.gain.setValueAtTime(this.gain.gain.value, this.ctx.currentTime)
        } catch {}
      }
    }, 15000)
  }

  /** Public helper: manually unlock audio context and playback (iOS fix). */
  async unlockNow() {
    if (this.unlocked) return
    this.unlocked = true
    this.ensureChain()

    if (!this.audio) return

    try {
      // Muted play unlocks HTMLMediaElement audio on iOS gesture stacks.
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

  private ensureAudio() {
    if (this.audio) return
    const el = new Audio(this.src)
    el.loop = true
    el.volume = this.currentTargetVolume()
    // iOS requires both property and attribute for inline playback.
    ;(el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    try { el.setAttribute('playsinline', 'true') } catch {}
    // Defer full download until playback is requested.
    el.preload = 'none'
    this.audio = el
  }

  private ensureChain() {
    this.ensureAudio()
    if (!this.audio) return

    if (!this.ctx && this.unlocked) {
      const Ctx = getAudioContextCtor()
      if (Ctx) this.ctx = new Ctx()
    }
    if (this.ctx && !this.source) {
      try {
        this.source = this.ctx.createMediaElementSource(this.audio)
      } catch {
        // Ignore duplicate source errors.
      }
    }
    if (this.ctx && !this.gain) {
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.currentTargetVolume()
    }
    if (this.ctx && this.source && this.gain) {
      try { this.source.disconnect() } catch {}
      try { this.gain.disconnect() } catch {}
      this.source.connect(this.gain)
      this.gain.connect(this.ctx.destination)
    }
  }

  async resumeCtx() {
    this.ensureChain()
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume() } catch {}
    }
  }

  async play() {
    this.ensureChain()
    if (!this.audio) return
    await this.resumeCtx()
    await this.audio.play()
  }

  private rampTo(volume: number, durationMs = 600) {
    const v = clamp01(volume)
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime
      this.gain.gain.cancelScheduledValues(now)
      this.gain.gain.setValueAtTime(this.gain.gain.value, now)
      this.gain.gain.linearRampToValueAtTime(v, now + Math.max(0, durationMs) / 1000)
    } else if (this.audio) {
      this.audio.volume = v
    }
  }

  fadeDown(duration = 600, to = 0.15) {
    this.baseVolume = clamp01(to)
    this.rampTo(this.currentTargetVolume(), duration)
  }

  fadeUp(duration = 600) {
    this.baseVolume = BGM_LEVELS.idle
    this.rampTo(this.currentTargetVolume(), duration)
  }

  setMode(mode: BgmMode, duration = 600) {
    this.baseVolume = BGM_LEVELS[mode]
    this.rampTo(this.currentTargetVolume(), duration)
  }

  private currentTargetVolume() {
    if (!this.ducks.size) return this.baseVolume
    return Math.min(this.baseVolume, ...this.ducks.values())
  }

  /** Duck volume for TTS/speech or active user input. */
  duckForSpeech(duration = 300, to = BGM_LEVELS.active, reason = 'speech') {
    this.ducks.set(reason, clamp01(to))
    this.rampTo(to, duration)
  }

  /** Restore volume after a specific ducking reason is no longer active. */
  restoreFromDuck(duration = 500, reason = 'speech') {
    this.ducks.delete(reason)
    this.rampTo(this.currentTargetVolume(), duration)
  }
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

export const bgm = new BackgroundMusicController()
