import { resolveApiUrl } from '../../lib/api'
import type { Language } from './types'

export function resolveAudioSrc (value: string | null | undefined): string | null {
  if (!value) return null
  return resolveApiUrl(value.toString())
}

export function getSpeechErrorMessage (err: string, language: Language): string | null {
  if (!err || err === 'aborted' || err === 'no-speech') return null
  if (err === 'not-allowed' || err === 'service-not-allowed') {
    return language === 'da'
      ? 'Mikrofonadgang er blokeret. Tillad adgang i browserens indstillinger.'
      : 'Microphone access is blocked. Allow it in your browser settings.'
  }
  if (err === 'audio-capture') {
    return language === 'da'
      ? 'Mikrofonen er ikke tilgængelig lige nu. Du kan skrive i stedet.'
      : 'Microphone is unavailable right now. You can type instead.'
  }
  if (err === 'network') {
    return language === 'da'
      ? 'Taleinput er midlertidigt utilgængeligt. Du kan skrive i stedet.'
      : 'Voice input is temporarily unavailable. You can type instead.'
  }
  return language === 'da'
    ? 'Taleinput kunne ikke starte. Du kan skrive i stedet.'
    : 'Voice input could not start. You can type instead.'
}

export function normalizeSpeechText (value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeMessageLineBreaks (value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
}

export function sanitizeAssistantText (value: string): string {
  if (!value) return ''
  return normalizeMessageLineBreaks(value)
    .replace(/\r\n/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function isLikelyQuestionInput (value: string, language: Language): boolean {
  const normalized = normalizeSpeechText(value).toLowerCase()
  if (!normalized) return false
  if (normalized.includes('?')) return true

  const questionStarts = language === 'da'
    ? ['hvad', 'hvordan', 'hvorfor', 'hvornår', 'hvor', 'hvem', 'hvilken', 'hvilke', 'kan', 'kunne', 'vil', 'ville', 'er', 'har', 'fortæl']
    : ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'is', 'are', 'do', 'does', 'did', 'has', 'have', 'tell me']

  return questionStarts.some(prefix => normalized.startsWith(prefix + ' ') || normalized === prefix)
}

export function getConfirmMoreReprompt (language: Language): string {
  return language === 'da'
    ? 'Del en ny erindring eller stil et nyt spørgsmål nu. Tryk på Del, når du er færdig. Hvis du vil afslutte sessionen, så tryk på tilbage.'
    : 'Please share another memory or ask another question now. Press the Share button when you’re done. If you want to end this session, press return.'
}
