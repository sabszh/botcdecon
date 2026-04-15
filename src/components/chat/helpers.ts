import type { ChatMessage } from './types'

export function buildSessionId () {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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
