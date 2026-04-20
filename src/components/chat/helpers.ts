import type { ChatMessage } from './types'

function buildUuidFallback () {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function buildSessionId () {
  const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : buildUuidFallback()
  return `session_${uuid}`
}

export function buildHistoryPayload (history: ChatMessage[]) {
  const noiseFragments = [
    'Udforsk Carte de Continuonus',
    'Explore Carte de Continuonus',
    'Change language',
    'Skift sprog'
  ]

  return history
    .slice(-4)
    .map((m) => {
      let content = (m.content || '').trim()
      if (!content) return null
      if (noiseFragments.some((f) => content.includes(f))) return null
      if (content.length > 200) content = content.slice(0, 200) + '…'
      return { role: m.role, content }
    })
    .filter((v): v is { role: 'user' | 'bot'; content: string } => Boolean(v))
}
