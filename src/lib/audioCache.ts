// Lightweight audio preloader/cache to remove playback delays for scripted clips
// - Fetches audio to a Blob and returns a blob: URL for instant play
// - Keeps a simple in-memory map per session; call clear() on language change if desired

const cache = new Map<string, string>()

export async function preloadAudio(url: string): Promise<string> {
  if (cache.has(url)) return cache.get(url) as string
  const res = await fetch(url, { cache: 'force-cache' })
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  cache.set(url, objUrl)
  return objUrl
}

export function getCached(url: string): string | null {
  return cache.get(url) || null
}

export function clearCache() {
  for (const [, objUrl] of cache) {
    try { URL.revokeObjectURL(objUrl) } catch {}
  }
  cache.clear()
}

