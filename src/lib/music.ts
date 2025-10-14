// Simple singleton background music controller
class BackgroundMusicController {
  private audio: HTMLAudioElement | null = null
  private initialized = false
  private fading = 0 as number | 0
  private target = 1
  private original = 1

  init(src: string = '/audio/backgroundmusic.mp3', originalVolume = 1) {
    if (this.initialized) return
    this.original = originalVolume
    const el = new Audio(src)
    el.loop = true
    el.volume = originalVolume
    // Hint to mobile browsers
    // @ts-ignore
    el.playsInline = true
    el.preload = 'auto'
    this.audio = el
    this.initialized = true
    // Try autoplay; if blocked, start on first user gesture
    this.play().catch(() => {
      const startOnGesture = () => {
        this.play().finally(() => {
          window.removeEventListener('pointerdown', startOnGesture)
          window.removeEventListener('keydown', startOnGesture)
          window.removeEventListener('touchstart', startOnGesture)
        })
      }
      window.addEventListener('pointerdown', startOnGesture, { once: true, passive: true })
      window.addEventListener('keydown', startOnGesture, { once: true })
      window.addEventListener('touchstart', startOnGesture, { once: true, passive: true })
    })
  }

  async play() {
    if (!this.audio) return
    try {
      await this.audio.play()
    } catch (e) {
      throw e
    }
  }

  private cancelFade() {
    if (this.fading) {
      cancelAnimationFrame(this.fading)
      this.fading = 0 as number | 0
    }
  }

  private fadeTo(volume: number, duration = 600) {
    if (!this.audio) return
    this.cancelFade()
    const el = this.audio
    this.target = Math.max(0, Math.min(1, volume))
    const start = el.volume
    const delta = this.target - start
    if (Math.abs(delta) < 0.001 || duration <= 0) {
      el.volume = this.target
      return
    }
    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      el.volume = start + delta * t
      if (t < 1) {
        this.fading = requestAnimationFrame(step)
      } else {
        this.fading = 0 as number | 0
      }
    }
    this.fading = requestAnimationFrame(step)
  }

  fadeDown(duration = 600, to = 0.15) {
    this.fadeTo(to, duration)
  }

  fadeUp(duration = 600) {
    this.fadeTo(this.original, duration)
  }
}

export const bgm = new BackgroundMusicController()

