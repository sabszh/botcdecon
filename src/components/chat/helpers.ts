import type { ChatMessage, Language } from './types'

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

export function isNegativeResponse (text: string, lang: Language) {
  const t = (text || '').toLowerCase().trim()
  if (!t) return false
  if (lang === 'da') {
    const negatives = [
      'nej', 'nej tak', 'ikke', 'ingen', 'nej,', 'nej.', 'nej ', 'stop', 'slut', 'det er det', 'det var det',
      'intet mere', 'ikke mere', 'nej tak,', 'nej tak.'
    ]
    return negatives.some(k => t.includes(k))
  }

  const negatives = [
    'no', 'nope', 'nah', "don't", 'do not', 'not now', 'nothing', "that's all", 'stop', 'no,', 'no.',
    'no thanks', 'no thank you', "that's it", 'nothing else', 'i am done', 'im done', "i'm done"
  ]
  return negatives.some(k => t.includes(k))
}

export function isAffirmativeResponse (text: string, lang: Language) {
  const t = (text || '').toLowerCase().trim()
  if (!t) return false
  if (lang === 'da') {
    const affirm = [
      'ja', 'ja tak', 'jo', 'jep', 'jeps', 'klart', 'sikkert', 'okay', 'ok', 'lad os', 'gerne'
    ]
    return affirm.some(k => t.startsWith(k) || t === k)
  }

  const affirm = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', 'alright', 'please', 'go ahead'
  ]
  return affirm.some(k => t.startsWith(k) || t === k)
}
