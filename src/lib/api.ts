const rawApiBase =
  (import.meta.env.VITE_API_BASE as string) ||
  (import.meta.env.VITE_API_BASE_URL as string) ||
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000'
    : '')

export const apiBase: string = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase

export function resolveApiUrl (path: string): string {
  if (!path) return path
  if (/^(data:|blob:|https?:\/\/)/i.test(path)) return path
  if (!apiBase) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${apiBase}${normalized}`
}

export async function fetchJson<T> (path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const res = await fetch(resolveApiUrl(path), {
    credentials: 'include',
    ...init,
    headers
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  return await res.json() as T
}
