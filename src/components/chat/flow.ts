import { MEMORY_FALLBACK_TEXTS } from './config'
import type { Language } from './types'

export type ChatPhase = 'intro' | 'await_memory' | 'await_question' | 'confirm_more' | 'await_return'
export type ChatTurnMode = 'memory' | 'question'
export type ManualReturnAction = 'ask_for_destination' | 'farewell'

function normalizeMessageLineBreaks(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
}

function sanitizeAssistantText(value: string): string {
  if (!value) return ''
  return normalizeMessageLineBreaks(value)
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

function normalizeSpeechText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isLikelyQuestionInput(value: string, language: Language): boolean {
  const normalized = normalizeSpeechText(value).toLowerCase()
  if (!normalized) return false
  if (normalized.includes('?')) return true

  const questionStarts = language === 'da'
    ? ['hvad', 'hvordan', 'hvorfor', 'hvornår', 'hvor', 'hvem', 'hvilken', 'hvilke', 'kan', 'kunne', 'vil', 'ville', 'er', 'har', 'fortæl']
    : ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'is', 'are', 'do', 'does', 'did', 'has', 'have', 'tell me']

  return questionStarts.some(prefix => normalized.startsWith(prefix + ' ') || normalized === prefix)
}

export function selectTurnMode(
  phase: ChatPhase,
  hasSharedMemory: boolean,
  text: string,
  language: Language,
  hasReachedQuestionPrompt: boolean = false
): ChatTurnMode {
  if (phase === 'confirm_more') {
    return isLikelyQuestionInput(text, language) ? 'question' : 'memory'
  }

  if (phase === 'await_memory' && hasReachedQuestionPrompt) {
    return 'question'
  }

  if (phase === 'await_memory' || !hasSharedMemory) {
    return 'memory'
  }

  return 'question'
}

export function resolveMemoryReplyMessage(
  data: { message?: string | null } | null | undefined,
  language: Language
): { text: string, usedFallback: boolean } {
  const replyText = sanitizeAssistantText((data?.message || '').trim())
  if (replyText) {
    return { text: replyText, usedFallback: false }
  }

  return {
    text: MEMORY_FALLBACK_TEXTS[language],
    usedFallback: true,
  }
}

export function getManualReturnAction(phase: ChatPhase, hasUserContribution: boolean): ManualReturnAction {
  if (phase === 'await_return') {
    return 'farewell'
  }

  if (hasUserContribution) {
    return 'ask_for_destination'
  }

  return 'farewell'
}

export function isReturnIntentText(value: string, language: Language): boolean {
  const normalized = normalizeSpeechText(value).toLowerCase()
  if (!normalized) return false

  const common = new Set(['no', 'nope', 'nah'])
  const danish = new Set(['nej', 'nej tak'])
  const english = new Set(['no thanks'])

  if (common.has(normalized)) return true
  if (language === 'da') return danish.has(normalized)
  return english.has(normalized)
}

export function buildReturnAnswerData(answer: string): Record<string, unknown> {
  return {
    returnPromptAnswer: answer,
    returnPromptStage: 'answered',
  }
}
