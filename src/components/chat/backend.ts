import { resolveApiUrl } from '../../lib/api'

export type BackendChatResponse = {
  message?: string
  error?: string | null
  audioUrl?: string | null
  audio_url?: string | null
  audioTurnId?: string | null
  audio_turn_id?: string | null
  handoffAction?: 'continue' | 'return' | 'question' | 'memory' | null
  handoff_action?: 'continue' | 'return' | 'question' | 'memory' | null
}

const CHAT_ENDPOINT = '/api/chat'
const CHAT_AUDIO_ENDPOINT = `${CHAT_ENDPOINT}/audio`

export async function requestChatTurn (
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<BackendChatResponse> {
  const res = await fetch(resolveApiUrl(CHAT_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  })
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Chat request failed (${res.status})`)
  }

  const data = await res.json() as BackendChatResponse
  if (!res.ok) {
    throw new Error(data.error || `Chat request failed (${res.status})`)
  }

  if (!data.message && !data.handoffAction && !data.handoff_action) {
    throw new Error(data.error || 'Empty chat response')
  }

  return data
}

export async function resolveAudioTurn (
  turnId: string,
  signal: AbortSignal
): Promise<string | null> {
  if (!turnId) return null
  const deadline = Date.now() + 8000

  while (Date.now() < deadline) {
    const res = await fetch(resolveApiUrl(`${CHAT_AUDIO_ENDPOINT}/${encodeURIComponent(turnId)}`), {
      method: 'GET',
      headers: { Accept: 'audio/mpeg' },
      signal
    })
    if (res.status === 202) {
      await new Promise(resolve => window.setTimeout(resolve, 250))
      continue
    }
    if (!res.ok) {
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const payload = await res.json().catch(() => null) as { error?: string, detail?: string } | null
        const message = payload?.error || payload?.detail || `Audio turn failed (${res.status})`
        throw new Error(message)
      }
      throw new Error(`Audio turn failed (${res.status})`)
    }
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }
  return null
}
