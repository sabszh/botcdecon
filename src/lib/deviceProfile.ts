export type DevicePerformanceProfile = {
  isTouchDevice: boolean
  isIPadLike: boolean
  reducedEffects: boolean
  reducedMotion: boolean
  preferLowPower: boolean
  antialias: boolean
  splashDpr: [number, number]
  mapDpr: [number, number]
}

function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function getDeviceMemory(): number | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { deviceMemory?: number }
  return typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null
}

export function getDevicePerformanceProfile(): DevicePerformanceProfile {
  if (typeof navigator === 'undefined') {
    return {
      isTouchDevice: false,
      isIPadLike: false,
      reducedEffects: false,
      reducedMotion: false,
      preferLowPower: false,
      antialias: true,
      splashDpr: [1, 1.35],
      mapDpr: [1, 1.5]
    }
  }

  const ua = navigator.userAgent || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0
  const coarsePointer = hasCoarsePointer()
  const isTouchDevice = coarsePointer || maxTouchPoints > 1
  const isIPadLike = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)
  const lowMemory = (getDeviceMemory() ?? 8) <= 4
  const reducedEffects = isTouchDevice || isIPadLike || lowMemory
  const reducedMotion = isTouchDevice || isIPadLike

  return {
    isTouchDevice,
    isIPadLike,
    reducedEffects,
    reducedMotion,
    preferLowPower: reducedEffects,
    antialias: !reducedEffects,
    splashDpr: reducedEffects ? [1, 1] : [1, 1.35],
    mapDpr: reducedEffects ? [1, 1.1] : [1, 1.5]
  }
}
