import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { preloadAudio, getCached, clearCache } from '../lib/audioCache'
import { bgm } from '../lib/music'
import { getScriptedAudioElement, hasPendingScriptedAudioUnlock, isScriptedAudioUnlocked, scriptedAudioSrc, stopScriptedAudio, unlockScriptedAudio, waitForScriptedAudioUnlock } from '../lib/scriptedAudio'
import { persistSystemTurn, requestChatTurn as requestChatTurnRequest, resolveAudioTurn as resolveAudioTurnRequest } from './chat/backend'
import { BROWSER_TTS_RATE, GENERATED_SPEECH_RATE, INTRO_MIN_DELAY_MS, INTRO_START_MAX_WAIT_MS, scripts, THANK_YOU_TEXTS } from './chat/config'
import { buildReturnAnswerData, getManualReturnAction, isReturnIntentText, resolveMemoryReplyMessage, selectTurnMode } from './chat/flow'
import ChatComposer from './chat/ChatComposer'
import ChatTranscript from './chat/ChatTranscript'
import { buildHistoryPayload, buildSessionId } from './chat/helpers'
import type { ChatMessage, Language } from './chat/types'
import { getSpeechRecognitionCtor, getSpeechSynthesisApi, requestMicrophonePermission } from '../lib/browserApis'
import {
  getSpeechErrorMessage,
  normalizeInputStreamText,
  sanitizeAssistantText,
  normalizeMessageLineBreaks,
  normalizeSpeechText,
  resolveAudioSrc
} from './chat/runtime'

type Props = {
  language: Language
  onExitSession: () => void
  manualReturnRequestId: number
  onManualReturnAvailabilityChange: (available: boolean) => void
}

// Debug toggle: set localStorage.audioDebug = '1' to enable logs
const AUDIO_DEBUG = (() => { try { return localStorage.getItem('audioDebug') === '1' } catch { return false } })()
const dlog = (...args: unknown[]) => { if (AUDIO_DEBUG) console.log('[AUDIO]', ...args) }
const MIC_DEBUG = (() => { try { return localStorage.getItem('micDebug') === '1' } catch { return false } })()
const mlog = (...args: unknown[]) => { if (MIC_DEBUG) console.log('[MIC]', ...args) }

function appendWithTokenOverlap (baseText: string, recognizedText: string): string {
  const base = normalizeSpeechText(baseText)
  const recognized = normalizeSpeechText(recognizedText)
  if (!base) return recognized
  if (!recognized) return base

  if (recognized.startsWith(base)) return recognized
  if (base.startsWith(recognized)) return base

  const baseTokens = base.split(' ')
  const recognizedTokens = recognized.split(' ')
  const maxOverlap = Math.min(baseTokens.length, recognizedTokens.length)

  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    const baseTail = baseTokens.slice(baseTokens.length - overlap).join(' ')
    const recognizedHead = recognizedTokens.slice(0, overlap).join(' ')
    if (baseTail === recognizedHead) {
      const rest = recognizedTokens.slice(overlap).join(' ')
      return normalizeSpeechText(`${base} ${rest}`)
    }
  }

  return normalizeSpeechText(`${base} ${recognized}`)
}

function collapseAdjacentDuplicateWords (value: string): string {
  const normalized = normalizeSpeechText(value)
  if (!normalized) return ''
  const tokens = normalized.split(' ')
  const compact: string[] = []
  for (const token of tokens) {
    const prev = compact[compact.length - 1]
    if (prev && prev === token) continue
    compact.push(token)
  }
  return compact.join(' ')
}

export default function ChatPanel ({
  language,
  onExitSession,
  manualReturnRequestId,
  onManualReturnAvailabilityChange
}: Props) {
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
  type Phase = 'intro' | 'await_memory' | 'await_question' | 'confirm_more' | 'await_return'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sttBuffer, setSttBuffer] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  // Control whether the on-screen keyboard is allowed to appear (default Off everywhere)
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(false)
  const [micDesired, setMicDesired] = useState(false)
  const [phase, setPhase] = useState<Phase>('intro')
  const [hasSharedMemory, setHasSharedMemory] = useState(false)
  const [hasReachedQuestionPrompt, setHasReachedQuestionPrompt] = useState(false)
  const [hasReachedFinalPrompt, setHasReachedFinalPrompt] = useState(false)
  const [isFarewellPlaying, setIsFarewellPlaying] = useState(false)
  const [introAssetsReady, setIntroAssetsReady] = useState(false)
  // No UI or persistence for speech rate; use a fixed constant for generated audio only
  const [micError, setMicError] = useState<string | null>(null)
  // Track whether we've started the intro flow (prevents double-start on iOS unlock)
  const introStartedRef = useRef(false)
  const introTimerRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(getScriptedAudioElement()) // Keep audio element reference
  const messageIdRef = useRef(0) // Message ID reference
  const lastAudioSrcRef = useRef<string | null>(null) // Last audio source reference
  const lastAudioRateRef = useRef<number>(1) // Last audio rate reference
  const activeNarrationAdvanceRef = useRef<(() => void) | null>(null)
  const activePlaybackKindRef = useRef<'media' | 'speech' | null>(null)
  const suppressSpeechOnEndRef = useRef(false)
  const speechReplayRef = useRef<{ text: string, lang: Language, onEnded?: () => void, autoScrollMsgId?: number, enableMicAfter?: boolean } | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null) // Speech recognition reference
  const isMicOnRef = useRef(false) // Microphone state reference
  const isAudioPlayingRef = useRef(false) // Audio playing state reference
  const micDesiredRef = useRef(false) // Desired microphone state reference
  const isLoadingRef = useRef(false) // Loading state reference
  const committedMicRef = useRef('') // Committed microphone reference
  const speechSessionBaseRef = useRef('')
  const speechSessionFinalRef = useRef('')
  const speechSessionCurrentRef = useRef('')
  const speechResultSegmentsRef = useRef<Array<{ text: string, isFinal: boolean }>>([])
  const ignoreRecognitionResultsRef = useRef(false)
  const awaitingFreshRecognitionStartRef = useRef(false)
  const draftRef = useRef('')
  const sessionIdRef = useRef(buildSessionId())
  const requestAbortRef = useRef<AbortController | null>(null)
  const audioFetchAbortRef = useRef<AbortController | null>(null)
  // Auto-follow / scroll management
  const autoFollowRef = useRef(true)
  const [showFollow, setShowFollow] = useState(false)
  const [hasSpeechReplay, setHasSpeechReplay] = useState(false)
  const NEAR_BOTTOM_PX = 48
  // Repeating delete (backspace) support
  const deleteHoldTimeoutRef = useRef<number | null>(null)
  const deleteHoldIntervalRef = useRef<number | null>(null)
  const manualReturnInFlightRef = useRef(false)
  const pendingManualReturnRef = useRef(false)
  const lastHandledReturnRequestRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => { isMicOnRef.current = isMicOn }, [isMicOn])
  useEffect(() => { isAudioPlayingRef.current = isAudioPlaying }, [isAudioPlaying])
  useEffect(() => { micDesiredRef.current = micDesired }, [micDesired])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => {
    sessionIdRef.current = buildSessionId()
    requestAbortRef.current?.abort()
    audioFetchAbortRef.current?.abort()
    activeNarrationAdvanceRef.current = null
    activePlaybackKindRef.current = null
    speechReplayRef.current = null
    speechSessionBaseRef.current = ''
    speechSessionFinalRef.current = ''
    speechSessionCurrentRef.current = ''
    speechResultSegmentsRef.current = []
    ignoreRecognitionResultsRef.current = false
    awaitingFreshRecognitionStartRef.current = false
    manualReturnInFlightRef.current = false
    pendingManualReturnRef.current = false
    lastHandledReturnRequestRef.current = 0
    setHasSpeechReplay(false)
    setHasReachedQuestionPrompt(false)
    setHasReachedFinalPrompt(false)
    setIsFarewellPlaying(false)
  }, [language])
  useEffect(() => () => {
    isMountedRef.current = false
    requestAbortRef.current?.abort()
    audioFetchAbortRef.current?.abort()
    stopScriptedAudio()
    bgm.restoreFromDuck(250)
  }, [])

  useEffect(() => {
    onManualReturnAvailabilityChange(hasSharedMemory)
  }, [hasSharedMemory, onManualReturnAvailabilityChange])

  const addMessage = useCallback((role: ChatMessage['role'], content: string, extras: Partial<ChatMessage> = {}) => {
    const normalizedContent = normalizeMessageLineBreaks(content || '').trim()
    if (!normalizedContent && !extras.pending) return null as number | null
    const id = messageIdRef.current++
    setMessages(cur => [...cur, { id, role, content: normalizedContent, ...extras }])
    return id
  }, [])

  const addPendingMessage = useCallback(() => {
    return addMessage('bot', '', { pending: true })
  }, [addMessage])

  const updateMessage = useCallback((id: number | null, content: string, extras: Partial<ChatMessage> = {}) => {
    if (id == null) return
    const normalizedContent = normalizeMessageLineBreaks(content || '').trim()
    setMessages(cur => cur.map(message => (
      message.id === id ? { ...message, content: normalizedContent, ...extras } : message
    )))
  }, [])

  const markQuestionPromptReached = useCallback(() => {
    setHasReachedQuestionPrompt(true)
  }, [])

  const syncDraftFromManualEdit = useCallback((nextValue: string) => {
    const raw = (nextValue || '').toString()
    const normalized = normalizeInputStreamText(raw)
    // Keep keyboard input exactly as typed (including punctuation/case).
    setDraft(raw)
    draftRef.current = raw
    // Keep speech state normalized so microphone continuation remains deterministic.
    setSttBuffer(normalized)
    committedMicRef.current = normalized
    speechSessionBaseRef.current = normalized
    speechSessionFinalRef.current = ''
    speechSessionCurrentRef.current = ''
    speechResultSegmentsRef.current = []
    // Ignore late results from the previous recognition run until a new session starts.
    ignoreRecognitionResultsRef.current = true
    awaitingFreshRecognitionStartRef.current = true
  }, [])

  const deleteOneWord = useCallback(() => {
    const current = (draftRef.current || '').toString()
    if (!current) return
    // Remove trailing spaces first, then remove last word
    const trimmedEnd = current.replace(/\s+$/g, '')
    const withoutLast = trimmedEnd.replace(/\S+\s*$/g, '')
    syncDraftFromManualEdit(withoutLast)

    // Force the recognizer to restart from the edited base text.
    if (isMicOnRef.current) {
      try { recognitionRef.current?.stop?.() } catch {}
      setIsMicOn(false)
    }
  }, [syncDraftFromManualEdit])

  const startDeleteHold = useCallback(() => {
    // Immediate delete, then start repeating after a short delay
    deleteOneWord()
    if (deleteHoldTimeoutRef.current) window.clearTimeout(deleteHoldTimeoutRef.current)
    if (deleteHoldIntervalRef.current) window.clearInterval(deleteHoldIntervalRef.current)
    deleteHoldTimeoutRef.current = window.setTimeout(() => {
      deleteHoldIntervalRef.current = window.setInterval(() => {
        deleteOneWord()
      }, 150)
    }, 300)
  }, [deleteOneWord])

  const stopDeleteHold = useCallback(() => {
    if (deleteHoldTimeoutRef.current) {
      window.clearTimeout(deleteHoldTimeoutRef.current)
      deleteHoldTimeoutRef.current = null
    }
    if (deleteHoldIntervalRef.current) {
      window.clearInterval(deleteHoldIntervalRef.current)
      deleteHoldIntervalRef.current = null
    }
  }, [])

  useEffect(() => () => stopDeleteHold(), [stopDeleteHold])

  // ChatPanel.tsx  — STEP 3: one-time mic pre-warm (iOS friendly)
  useEffect(() => {
    const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    if (!isiOS) return

    let cleaned = false
    navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then((stream) => {
        if (cleaned) return
        // immediately stop — just to grant permission
        stream.getTracks().forEach(t => t.stop())
      })
      .catch(() => { /* ignore; user may deny, UI already handles */ })

    return () => { cleaned = true }
  }, [])

  // Preload scripted audio for the selected language to eliminate start lag
  useEffect(() => {
    if (!language) {
      setIntroAssetsReady(false)
      clearCache()
      return
    }
    let cancelled = false
    setIntroAssetsReady(false)
    const clips = [
      scriptedAudioSrc(language, 'WELCOME'),
      scriptedAudioSrc(language, 'MEMORY_1'),
      scriptedAudioSrc(language, 'QUESTION_1'),
      scriptedAudioSrc(language, 'QUESTION_2'),
      scriptedAudioSrc(language, 'RETURN_PROMPT'),
      scriptedAudioSrc(language, 'RETURN_EXIT_HINT'),
      scriptedAudioSrc(language, 'FAREWELL'),
      scriptedAudioSrc(language, 'THANK_YOU'),
    ]
    const [welcomeClip, memoryClip] = clips
    Promise.all([
      preloadAudio(welcomeClip),
      preloadAudio(memoryClip)
    ]).then(() => {
      if (!cancelled) setIntroAssetsReady(true)
    }).catch(() => {
      if (!cancelled) setIntroAssetsReady(true)
    })

    // Fire-and-forget the remaining preloads
    clips.slice(2).forEach(src => { preloadAudio(src).catch(() => {}) })

    return () => {
      cancelled = true
      clearCache()
    }
  }, [language])


  const playAudio = useCallback(async (
    src: string,
    onEnded?: () => void,
    onError?: () => void,
    rate?: number,
    autoScrollMsgId?: number,
    enableMicAfter: boolean = true
  ) => {
    if (!src) {
      if (onError && isMountedRef.current) onError()
      return false
    }
    await waitForScriptedAudioUnlock().catch(() => {})
    if (!isMountedRef.current) return false
    // Swap to cached blob URL if preloaded (removes network/decode lag)
    const cached = getCached(src)
    const chosenSrc = cached || src
    lastAudioSrcRef.current = src
    lastAudioRateRef.current = rate && rate > 0 ? rate : 1
    activePlaybackKindRef.current = 'media'
    activeNarrationAdvanceRef.current = onEnded || null
    speechReplayRef.current = null
    setHasSpeechReplay(false)
    const el = audioElRef.current || getScriptedAudioElement()
    audioElRef.current = el
    if (!el) {
      activePlaybackKindRef.current = null
      setIsAudioPlaying(false)
      if (onError && isMountedRef.current) onError()
      return false
    }

    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    setIsAudioPlaying(true)

    const fade = (from: number, to: number, duration: number) => {
      const startTime = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration)
        // Clamp volume to [0, 1] to avoid IndexSizeError
        el.volume = Math.min(1, Math.max(0, from + (to - from) * t))
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }


    el.src = chosenSrc
    try { el.load?.() } catch {}
    el.playbackRate = rate || 1
    el.volume = 0
    el.onplay = () => {
      fade(0, 1, 400)
      bgm.duckForSpeech(300, 0.08)
      if (typeof autoScrollMsgId === 'number') {
        // For audio-led experiences (e.g., iPad kiosk), force follow when narration starts.
        autoFollowRef.current = true
        setShowFollow(false)
      }
    }
    el.onloadedmetadata = () => {
      if (typeof autoScrollMsgId !== 'number') return
      if (!autoFollowRef.current) return
      const list = chatListRef.current
      if (!list) return
      const messageEl = list.querySelector(`[data-msg-id="${autoScrollMsgId}"]`) as HTMLElement | null
      if (!messageEl) return
      const nextTop = Math.max(0, messageEl.offsetTop - 8)
      list.scrollTo({ top: nextTop, behavior: 'auto' })
    }
    el.ontimeupdate = () => {
      if (typeof autoScrollMsgId !== 'number') return
      if (!autoFollowRef.current) return
      const list = chatListRef.current
      if (!list) return
      const messageEl = list.querySelector(`[data-msg-id="${autoScrollMsgId}"]`) as HTMLElement | null
      if (!messageEl) return
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
      if (!duration) return
      const ratio = Math.max(0, Math.min(1, el.currentTime / duration))
      const total = Math.max(0, messageEl.scrollHeight - list.clientHeight * 0.9)
      const target = messageEl.offsetTop + (total * ratio)
      list.scrollTo({ top: target, behavior: 'auto' })
    }
    el.onpause = () => {
      setIsAudioPlaying(false)
    }
    el.onended = () => {
      if (!isMountedRef.current) return
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      bgm.restoreFromDuck(500)
      const after = activeNarrationAdvanceRef.current
      activeNarrationAdvanceRef.current = null
      if (enableMicAfter) setMicDesired(true)
      if (after) after()
    }
    el.onerror = () => {
      if (!isMountedRef.current) return
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      bgm.restoreFromDuck(500)
      activeNarrationAdvanceRef.current = null
      if (onError) onError()
    }
    return el.play().then(() => true).catch(err => {
      dlog('audio play rejected', err)
      if (!isMountedRef.current) return false
      bgm.restoreFromDuck(500)
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      activeNarrationAdvanceRef.current = null
      if (onError) onError()
      return false
    })
  }, [])

  // Start the scripted intro, with iOS unlock-aware gating
  const startIntro = useCallback(() => {
    if (!language) return
    if (introStartedRef.current) return
    introStartedRef.current = true
    const conf = scripts[language]
    const welcomeId = addMessage('bot', conf.welcome)
    const startMemoryPrompt = () => {
      // chain Memory 1 prompt
      const idM1 = addMessage('bot', conf.memory1)
      // After the prompt audio finishes, enable mic automatically
      playAudio(scriptedAudioSrc(language, 'MEMORY_1'), () => {
        setPhase('await_memory')
        setMicDesired(true)
      }, () => {
        setPhase('await_memory')
        setMicDesired(true)
      }, GENERATED_SPEECH_RATE, idM1 ?? undefined, true)
    }
    void playAudio(scriptedAudioSrc(language, 'WELCOME'), startMemoryPrompt, () => {
      introStartedRef.current = false
      startMemoryPrompt()
    }, GENERATED_SPEECH_RATE, undefined, false)
  }, [language, addMessage, playAudio])

  useEffect(() => {
    if (!language) return

    // Clear any previous timer when language changes.
    if (introTimerRef.current) {
      window.clearTimeout(introTimerRef.current)
      introTimerRef.current = null
    }
    introStartedRef.current = false
  }, [language])

  useEffect(() => {
    if (!language) return

    const audioAllowed = isScriptedAudioUnlocked()

    const cleanupTimers = (fallbackTimer?: number) => {
      if (introTimerRef.current) {
        window.clearTimeout(introTimerRef.current)
        introTimerRef.current = null
      }
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
    }

    if (!isIOS || audioAllowed) {
      let started = false
      const runIntro = () => {
        if (started) return
        started = true
        startIntro()
      }
      if (introAssetsReady) {
        introTimerRef.current = window.setTimeout(runIntro, INTRO_MIN_DELAY_MS)
      }
      const fallbackTimer = window.setTimeout(runIntro, INTRO_START_MAX_WAIT_MS)
      return () => cleanupTimers(fallbackTimer)
    }

    if (hasPendingScriptedAudioUnlock()) {
      let cancelled = false
      waitForScriptedAudioUnlock()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) window.setTimeout(() => startIntro(), INTRO_MIN_DELAY_MS)
        })
      return () => { cancelled = true }
    }

    // iOS and not yet allowed: wait for first user gesture to both unlock and start
    const onFirstGesture = () => {
      dlog('intro: first gesture received; starting intro')
      unlockScriptedAudio(scriptedAudioSrc(language, 'THANK_YOU'))
        .catch(() => {})
        .finally(() => window.setTimeout(() => startIntro(), INTRO_MIN_DELAY_MS))
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('pointerdown', onFirstGesture)
      window.removeEventListener('click', onFirstGesture)
      window.removeEventListener('touchend', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
    }
    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true })
    window.addEventListener('click', onFirstGesture, { once: true })
    window.addEventListener('touchend', onFirstGesture, { once: true })
    window.addEventListener('keydown', onFirstGesture, { once: true })
    return cleanup
  }, [language, isIOS, startIntro, introAssetsReady])

  useEffect(() => {
    const list = chatListRef.current
    if (!list) return
    // If this is the very first message, show from the top so the
    // beginning of a long message isn't clipped off-screen.
    if (messages.length <= 1) {
      list.scrollTop = 0
      return
    }
    // Only stick to bottom when auto-follow is enabled (i.e., user is near bottom)
    if (autoFollowRef.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, isLoading])

  // Autosize the text input as content grows
  const resizeTextarea = useCallback((el?: HTMLTextAreaElement | null) => {
    const node = el || inputRef.current
    if (!node) return
    node.style.height = 'auto'
    const max = Math.round(window.innerHeight * 0.4)
    const nextHeight = Math.min(node.scrollHeight, max)
    node.style.height = `${nextHeight}px`
    node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden'
  }, [])

  const scrollToMessageTop = useCallback((msgId: number | null) => {
    if (msgId == null) return
    if (!autoFollowRef.current) return
    const list = chatListRef.current
    if (!list) return
    const el = list.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null
    if (!el) return
    const nextTop = Math.max(0, el.offsetTop - 8)
    list.scrollTo({ top: nextTop, behavior: 'auto' })
  }, [])

  useEffect(() => { resizeTextarea() }, [draft, resizeTextarea])

  const scrollMessageProgress = useCallback((msgId: number, ratio: number) => {
    if (!autoFollowRef.current) return
    const list = chatListRef.current
    if (!list) return
    const el = list.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null
    if (!el) return
    const total = Math.max(0, el.scrollHeight - list.clientHeight * 0.9)
    const baseTop = el.offsetTop
    const targetWithin = total * Math.max(0, Math.min(1, ratio))
    const target = baseTop + targetWithin
    list.scrollTo({ top: target, behavior: 'auto' })
  }, [])

  // Track user scroll position and toggle auto-follow accordingly
  useEffect(() => {
    const list = chatListRef.current
    if (!list) return
    const onScroll = () => {
      const atBottom = (list.scrollHeight - (list.scrollTop + list.clientHeight)) <= NEAR_BOTTOM_PX
      autoFollowRef.current = atBottom
      setShowFollow(!atBottom)
    }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [])

  // Fallback TTS using the browser's SpeechSynthesis
  const speakBrowserTTS = useCallback((text: string, lang: Language, onEnded?: () => void, autoScrollMsgId?: number, enableMicAfter: boolean = true) => {
    const safeText = sanitizeAssistantText(text)
    // Estimate how long a message would take to read aloud (~180 ms/word, 1–6 s).
    // Used when no audio engine is available so the next message is still gated by a
    // reading-time delay rather than appearing simultaneously with the current one.
    const readDelay = () => Math.max(1000, Math.min(safeText.trim().split(/\s+/).filter(Boolean).length * 180, 6000))
    if (!safeText) { if (onEnded) onEnded(); return }
    const synth = getSpeechSynthesisApi()
    if (!synth) { window.setTimeout(() => { if (onEnded) onEnded() }, readDelay()); return }
    try { synth.cancel() } catch {}
    // Stop mic while speaking
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    setIsAudioPlaying(true)
    bgm.duckForSpeech(300, 0.08)
    if (typeof autoScrollMsgId === 'number') {
      scrollToMessageTop(autoScrollMsgId)
    }
    activePlaybackKindRef.current = 'speech'
    activeNarrationAdvanceRef.current = onEnded || null
    speechReplayRef.current = { text: safeText, lang, onEnded, autoScrollMsgId, enableMicAfter }
    setHasSpeechReplay(true)
    const utter = new SpeechSynthesisUtterance(safeText)
    utter.lang = lang === 'da' ? 'da-DK' : 'en-US'
    // Slightly faster (5%) for browser TTS fallback only
    utter.rate = BROWSER_TTS_RATE
    if (typeof autoScrollMsgId === 'number') {
      const total = Math.max(1, safeText.length)
      utter.onboundary = (ev: SpeechSynthesisEvent) => {
        const idx = typeof ev?.charIndex === 'number' ? ev.charIndex : 0
        const ratio = Math.max(0, Math.min(1, idx / total))
        scrollMessageProgress(autoScrollMsgId, ratio)
      }
    }
    const ttsStartedAt = Date.now()
    const minimumMs = readDelay()
    utter.onend = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      bgm.restoreFromDuck(500)
      if (suppressSpeechOnEndRef.current) {
        suppressSpeechOnEndRef.current = false
        return
      }
      const after = activeNarrationAdvanceRef.current
      activeNarrationAdvanceRef.current = null
      // Guard against Chrome's known bug where onend fires immediately (0ms after speak())
      // before the audio has actually played. Enforce a minimum reading-time delay.
      const elapsed = Date.now() - ttsStartedAt
      const remaining = Math.max(0, minimumMs - elapsed)
      window.setTimeout(() => { if (enableMicAfter) setMicDesired(true); if (after) after() }, remaining)
    }
    utter.onerror = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      bgm.restoreFromDuck(500)
      if (suppressSpeechOnEndRef.current) {
        suppressSpeechOnEndRef.current = false
        return
      }
      activeNarrationAdvanceRef.current = null
      window.setTimeout(() => { if (onEnded) onEnded() }, readDelay())
    }
    synth.speak(utter)
  }, [scrollMessageProgress, scrollToMessageTop])

  const advanceCurrentNarration = useCallback(() => {
    const after = activeNarrationAdvanceRef.current
    activeNarrationAdvanceRef.current = null
    if (activePlaybackKindRef.current === 'speech') {
      const synth = getSpeechSynthesisApi()
      suppressSpeechOnEndRef.current = true
      try { synth?.cancel() } catch {}
      activePlaybackKindRef.current = null
      setIsAudioPlaying(false)
      if (after) after()
      return
    }

    const el = audioElRef.current
    try { el?.pause() } catch {}
    activePlaybackKindRef.current = null
    setIsAudioPlaying(false)
    if (after) after()
  }, [])

  // Speech recognition setup per language
  useEffect(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor()
    if (!SpeechRecognitionCtor) {
      setIsSpeechSupported(false)
      recognitionRef.current = null
      return
    }
    setIsSpeechSupported(true)
    const rec = new SpeechRecognitionCtor()
    rec.lang = language === 'da' ? 'da-DK' : 'en-US'
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    rec.continuous = !isIOS
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (event: SpeechRecognitionEvent) => {
      // Ignore stale results if it's not user's turn or mic not desired
      if (!micDesiredRef.current || isAudioPlayingRef.current || isLoadingRef.current) {
        mlog('result ignored', {
          reason: {
            micDesired: micDesiredRef.current,
            audioPlaying: isAudioPlayingRef.current,
            loading: isLoadingRef.current
          }
        })
        return
      }
      if (ignoreRecognitionResultsRef.current) {
        mlog('result ignored', { reason: 'awaiting-fresh-session-start' })
        return
      }
      const finalParts: string[] = []
      const interimParts: string[] = []
      const nextSegments = speechResultSegmentsRef.current.slice(0, event.resultIndex)

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = normalizeInputStreamText(result?.[0]?.transcript || '')
        if (!transcript) continue
        nextSegments.push({ text: transcript, isFinal: !!result?.isFinal })
      }

      speechResultSegmentsRef.current = nextSegments

      for (const segment of nextSegments) {
        if (!segment.text) continue
        if (segment.isFinal) finalParts.push(segment.text)
        else interimParts.push(segment.text)
      }

      const sessionFinal = normalizeSpeechText(finalParts.join(' '))
      const sessionInterim = normalizeSpeechText(interimParts.join(' '))

      speechSessionFinalRef.current = sessionFinal
      speechSessionCurrentRef.current = sessionInterim
      const committed = normalizeInputStreamText(speechSessionBaseRef.current)
      const sessionRecognized = normalizeSpeechText([sessionFinal, sessionInterim].filter(Boolean).join(' '))
      const nextVisibleDraft = appendWithTokenOverlap(committed, sessionRecognized)
      const normalizedVisibleDraft = normalizeInputStreamText(collapseAdjacentDuplicateWords(nextVisibleDraft))

      mlog('result', {
        resultIndex: event.resultIndex,
        sessionBase: speechSessionBaseRef.current,
        sessionFinal: speechSessionFinalRef.current,
        interim: sessionInterim,
        committed,
        visibleDraft: nextVisibleDraft,
        results: Array.from({ length: event.results.length }, (_, idx) => {
          const res = event.results[idx]
          return {
            idx,
            final: !!res?.isFinal,
            transcript: normalizeInputStreamText(res?.[0]?.transcript || '')
          }
        })
      })

      committedMicRef.current = normalizedVisibleDraft || committed || speechSessionBaseRef.current
      setSttBuffer(committedMicRef.current)
      setDraft(committedMicRef.current)
      draftRef.current = committedMicRef.current
    }
    ;(rec as SpeechRecognition & { onstart?: () => void }).onstart = () => {
      if (awaitingFreshRecognitionStartRef.current) {
        ignoreRecognitionResultsRef.current = false
        awaitingFreshRecognitionStartRef.current = false
      }
      setIsMicOn(true)
    }
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      setIsMicOn(false)
      const err = (ev?.error || '').toString()
      mlog('error', { error: err, language, isIOS })
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicError(getSpeechErrorMessage(err, language))
        setMicDesired(false)
      } else if (err === 'no-speech' || err === 'aborted') {
        // benign; will auto-restart via onend
      } else if (err) {
        setMicError(getSpeechErrorMessage(err, language))
        setMicDesired(false)
      }
    }
    rec.onend = () => {
      // Keep listening while desired and it's the user's turn
      const shouldListen = micDesiredRef.current && !isAudioPlayingRef.current && !isLoadingRef.current
      const mergedSessionBase = normalizeInputStreamText(
        appendWithTokenOverlap(
          speechSessionBaseRef.current,
          normalizeSpeechText([speechSessionFinalRef.current, speechSessionCurrentRef.current].filter(Boolean).join(' '))
        )
      )
      const visibleDraft = normalizeInputStreamText(draftRef.current)
      const nextBase = normalizeInputStreamText(visibleDraft || mergedSessionBase)
      speechSessionBaseRef.current = nextBase
      committedMicRef.current = nextBase
      setSttBuffer(nextBase)
      setDraft(nextBase)
      draftRef.current = nextBase
      speechSessionFinalRef.current = ''
      speechSessionCurrentRef.current = ''
      speechResultSegmentsRef.current = []
      mlog('end', {
        shouldListen,
        nextBase,
        micDesired: micDesiredRef.current,
        audioPlaying: isAudioPlayingRef.current,
        loading: isLoadingRef.current
      })
      if (shouldListen) {
        awaitingFreshRecognitionStartRef.current = true
        setTimeout(() => { try { rec.start() } catch {} }, 150)
      } else {
        setIsMicOn(false)
        ignoreRecognitionResultsRef.current = false
        awaitingFreshRecognitionStartRef.current = false
      }
    }
    recognitionRef.current = rec
    return () => {
      try { rec.stop() } catch {}
    }
  }, [language])

  // Proactively request mic permission once (speeds up STT start and surfaces prompt)
  // Removed proactive mic permission request on language change

  const startMic = useCallback(() => {
    // Mark desired and try to start immediately (helps with iOS user-gesture rules)
    setMicDesired(true)
    setMicError(null)
    try {
      if (isSpeechSupported && recognitionRef.current && !isAudioPlayingRef.current && !isLoadingRef.current) {
        // Capture current input as base for interim/final appends
        const base = normalizeInputStreamText(committedMicRef.current || draftRef.current || sttBuffer || draft || '')
        committedMicRef.current = base
        speechSessionBaseRef.current = base
        speechSessionFinalRef.current = ''
        speechSessionCurrentRef.current = ''
        speechResultSegmentsRef.current = []
        awaitingFreshRecognitionStartRef.current = true
        setSttBuffer(base)
        mlog('startMic immediate', { base, draft, sttBuffer })
        recognitionRef.current.start()
      }
    } catch {}
  }, [draft, isSpeechSupported, sttBuffer])

  const stopMic = useCallback(() => {
    // external toggle: mark undesired, controller effect will stop
    setMicDesired(false)
    mlog('stopMic manual')
    ignoreRecognitionResultsRef.current = false
    awaitingFreshRecognitionStartRef.current = false
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
  }, [])

  // When it's the user's turn, automatically focus the input
  useEffect(() => {
    if (!language) return
    const usersTurn = micDesired && !isAudioPlaying && !isLoading
    if (usersTurn && keyboardEnabled) {
      const el = inputRef.current
      if (el) {
        try {
          el.focus()
          const val = (draft || '').toString()
          const pos = val.length
          // place caret at end
          el.setSelectionRange?.(pos, pos)
          resizeTextarea(el)
        } catch {}
      }
    }
  }, [language, micDesired, isAudioPlaying, isLoading, draft, keyboardEnabled, resizeTextarea])

  // Mic controller: start/stop recognition based on desired state and turn
  useEffect(() => {
    if (!language) return
    if (!isSpeechSupported || !recognitionRef.current) return
    const shouldListen = micDesired && !isAudioPlaying && !isLoading
    if (shouldListen && !isMicOn) {
      try {
        // Capture current input as base for interim/final appends
        const base = normalizeInputStreamText(committedMicRef.current || draftRef.current || sttBuffer || draft || '')
        committedMicRef.current = base
        speechSessionBaseRef.current = base
        speechSessionFinalRef.current = ''
        speechSessionCurrentRef.current = ''
        speechResultSegmentsRef.current = []
        awaitingFreshRecognitionStartRef.current = true
        setSttBuffer(base)
        mlog('startMic effect', { base, draft, sttBuffer, shouldListen })
        recognitionRef.current.start()
      } catch {}
    } else if (!shouldListen && isMicOn) {
      mlog('stopMic effect', { shouldListen, isMicOn })
      try { recognitionRef.current.stop() } catch {}
      setIsMicOn(false)
    }
  }, [language, micDesired, isAudioPlaying, isLoading, isSpeechSupported, isMicOn, draft, sttBuffer])

  const requestChatTurn = useCallback(async (payload: Record<string, unknown>) => {
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller
    return await requestChatTurnRequest(payload, controller.signal)
  }, [])

  const resolveAudioTurn = useCallback(async (turnId: string): Promise<string | null> => {
    if (!turnId) return null
    audioFetchAbortRef.current?.abort()
    const controller = new AbortController()
    audioFetchAbortRef.current = controller
    return await resolveAudioTurnRequest(turnId, controller.signal)
  }, [])

  const persistArchiveSystemTurn = useCallback(async (
    botMessage: string,
    options: { clearSessionMemory?: boolean, userMessage?: string, continuousData?: Record<string, unknown> } = {}
  ) => {
    await persistSystemTurn({
      sessionId: sessionIdRef.current,
      message: options.userMessage || '',
      botMessage,
      clearSessionMemory: options.clearSessionMemory ?? false,
      continuousData: options.continuousData,
      language,
      userName: 'Visitor',
      userLocation: 'Museum',
      mode: 'system' as const,
      history: buildHistoryPayload(messages)
    })
  }, [language, messages])

  const startManualReturn = useCallback(() => {
    if (manualReturnInFlightRef.current) return
    if (isLoadingRef.current) {
      pendingManualReturnRef.current = true
      return
    }
    manualReturnInFlightRef.current = true
    pendingManualReturnRef.current = false

    audioFetchAbortRef.current?.abort()
    activeNarrationAdvanceRef.current = null
    setIsLoading(false)
    setMicDesired(false)
    stopMic()

    if (activePlaybackKindRef.current === 'speech') {
      const synth = getSpeechSynthesisApi()
      suppressSpeechOnEndRef.current = true
      try { synth?.cancel() } catch {}
    }
    const el = audioElRef.current
    try { el?.pause() } catch {}
    try { if (el) el.currentTime = 0 } catch {}
    activePlaybackKindRef.current = null
    setIsAudioPlaying(false)

    const conf = scripts[language]
    const playFarewell = () => {
      setPhase('intro')
      setIsFarewellPlaying(true)
      const farewellId = addMessage('bot', conf.farewell)
      void persistArchiveSystemTurn(conf.farewell, { clearSessionMemory: true }).catch((err) => {
        dlog('system farewell persist failed', err)
      })
      playAudio(
        scriptedAudioSrc(language, 'FAREWELL'),
        () => {
          setIsFarewellPlaying(false)
          onExitSession()
        },
        () => {
          speakBrowserTTS(conf.farewell, language, () => {
            setIsFarewellPlaying(false)
            onExitSession()
          }, farewellId ?? undefined, false)
        },
        GENERATED_SPEECH_RATE,
        farewellId ?? undefined,
        false
      )
    }

    const returnAction = getManualReturnAction(phase, hasSharedMemory)
    if (returnAction === 'ask_for_destination') {
      const returnPromptId = addMessage('bot', conf.returnPrompt)
      const playReturnExitHint = () => {
        if (!isMountedRef.current) return
        const returnExitHintId = addMessage('bot', conf.returnExitHint)
        setPhase('await_return')
        setMicDesired(true)
        scrollToMessageTop(returnExitHintId ?? returnPromptId)
        void playAudio(
          scriptedAudioSrc(language, 'RETURN_EXIT_HINT'),
          undefined,
          () => {
            manualReturnInFlightRef.current = false
            speakBrowserTTS(conf.returnExitHint, language, undefined, returnExitHintId ?? undefined)
          },
          GENERATED_SPEECH_RATE,
          returnExitHintId ?? undefined,
          true
        ).then((started) => {
          if (started && isMountedRef.current) manualReturnInFlightRef.current = false
        })
      }
      void persistArchiveSystemTurn(conf.returnPrompt, {
        continuousData: { returnPromptStage: 'asked' }
      }).catch((err) => {
        dlog('system return prompt persist failed', err)
      })
      playAudio(
        scriptedAudioSrc(language, 'RETURN_PROMPT'),
        () => {
          playReturnExitHint()
        },
        () => {
          speakBrowserTTS(conf.returnPrompt, language, playReturnExitHint, returnPromptId ?? undefined, false)
        },
        GENERATED_SPEECH_RATE,
        returnPromptId ?? undefined,
        false
      )
      return
    }

    playFarewell()
  }, [addMessage, hasSharedMemory, language, onExitSession, persistArchiveSystemTurn, phase, playAudio, speakBrowserTTS, stopMic, scrollToMessageTop])

  useEffect(() => {
    if (!manualReturnRequestId) return
    if (manualReturnRequestId === lastHandledReturnRequestRef.current) return
    lastHandledReturnRequestRef.current = manualReturnRequestId
    startManualReturn()
  }, [manualReturnRequestId, startManualReturn])

  useEffect(() => {
    if (!pendingManualReturnRef.current) return
    if (isLoading) return
    startManualReturn()
  }, [isLoading, startManualReturn])

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const text = (draft.trim() || sttBuffer.trim())
    if (!text || isLoading) return
    audioFetchAbortRef.current?.abort()
    activeNarrationAdvanceRef.current = null
    // Stop mic when sending
    stopMic()
    addMessage('user', text)
    setDraft('')
    setSttBuffer('')
    committedMicRef.current = ''

    if (phase === 'await_return') {
      const conf = scripts[language]
      setPhase('intro')
      setIsFarewellPlaying(true)
      void persistArchiveSystemTurn(conf.returnPrompt, {
        userMessage: text,
        continuousData: buildReturnAnswerData(text)
      }).catch((err) => {
        dlog('system return answer persist failed', err)
      })
      const farewellId = addMessage('bot', conf.farewell)
      void persistArchiveSystemTurn(conf.farewell, { clearSessionMemory: true }).catch((err) => {
        dlog('system farewell persist failed', err)
      })
      playAudio(
        scriptedAudioSrc(language, 'FAREWELL'),
        () => {
          setIsFarewellPlaying(false)
          onExitSession()
        },
        () => {
          speakBrowserTTS(conf.farewell, language, () => {
            setIsFarewellPlaying(false)
            onExitSession()
          }, farewellId ?? undefined, false)
        },
        GENERATED_SPEECH_RATE,
        farewellId ?? undefined,
        false
      )
      return
    }

    if (phase === 'confirm_more' && isReturnIntentText(text, language)) {
      startManualReturn()
      return
    }

    setIsLoading(true)
    let activePendingMessageId: number | null = null
    try {
      const conf = scripts[language]
      const inputMode = selectTurnMode(phase, hasSharedMemory, text, language, hasReachedQuestionPrompt)

      const isMemoryTurn = inputMode === 'memory'
      if (isMemoryTurn) {
        const isFirstMemoryTurn = !hasSharedMemory
        const memoryRequestTimeoutMs = isFirstMemoryTurn ? 30000 : 12000
        const thankYouText = THANK_YOU_TEXTS[language]
        const startQuestionPrompt = () => {
          markQuestionPromptReached()
          addMessage('bot', conf.question1)
          playAudio(scriptedAudioSrc(language, 'QUESTION_1'), () => {
            setPhase('await_question')
            setMicDesired(true)
          }, () => {
            setPhase('await_question')
            setMicDesired(true)
          }, GENERATED_SPEECH_RATE)
        }
        const completeMemoryFallback = (memoryReplyId: number | null, reason: unknown) => {
          dlog('memory turn using scripted fallback', reason)
          const fallback = resolveMemoryReplyMessage(null, language)
          updateMessage(memoryReplyId, fallback.text, { pending: false })
          scrollToMessageTop(memoryReplyId)
          speakBrowserTTS(fallback.text, language, startQuestionPrompt, memoryReplyId ?? undefined)
        }
        setHasSharedMemory(true)
        const thankYouMessageId = addMessage('bot', thankYouText)
        scrollToMessageTop(thankYouMessageId)

        let memoryTimedOut = false
        const memoryRequest = requestChatTurn({
          sessionId: sessionIdRef.current,
          message: text,
          language,
          userName: 'Visitor',
          userLocation: 'Museum',
          mode: 'memory',
          history: buildHistoryPayload(messages)
        })

        await new Promise<void>(resolve => {
          playAudio(scriptedAudioSrc(language, 'THANK_YOU'), resolve, resolve, GENERATED_SPEECH_RATE, thankYouMessageId ?? undefined, false)
        })

        const memoryReplyId = addPendingMessage()
        activePendingMessageId = memoryReplyId
        scrollToMessageTop(memoryReplyId)

        let data: Awaited<ReturnType<typeof requestChatTurn>> | null = null
        let memoryTimeoutId: number | null = null
        try {
          data = await Promise.race<Awaited<ReturnType<typeof requestChatTurn>> | never>([
            memoryRequest,
            new Promise<never>((_, reject) => {
              memoryTimeoutId = window.setTimeout(() => {
                memoryTimedOut = true
                requestAbortRef.current?.abort()
                reject(new Error('memory_confirmation_timeout'))
              }, memoryRequestTimeoutMs)
            })
          ])
        } catch (err) {
          if (memoryTimeoutId != null) window.clearTimeout(memoryTimeoutId)
          completeMemoryFallback(memoryReplyId, err)
          return
        }
        if (memoryTimeoutId != null) window.clearTimeout(memoryTimeoutId)

        const memoryReply = resolveMemoryReplyMessage(data, language)
        if (memoryReply.usedFallback) {
          completeMemoryFallback(memoryReplyId, 'empty_memory_confirmation')
          return
        }
        const replyText = memoryReply.text
        const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
        const audioTurnId: string | null = data?.audioTurnId || data?.audio_turn_id || null

        let turnAudioBlobUrl: string | null = null
        if (audioTurnId) {
          try {
            turnAudioBlobUrl = await resolveAudioTurn(audioTurnId)
          } catch (err) {
            dlog('memory turn audio polling failed; using browser TTS fallback', err)
          }
        }
        const resolved = turnAudioBlobUrl || resolveAudioSrc(audioUrl)
        const cleanupTurnAudio = () => {
          if (turnAudioBlobUrl) URL.revokeObjectURL(turnAudioBlobUrl)
        }
        updateMessage(memoryReplyId, replyText, { pending: false })
        scrollToMessageTop(memoryReplyId)

        if (resolved && !memoryTimedOut) {
          playAudio(
            resolved,
            () => { cleanupTurnAudio(); startQuestionPrompt() },
            () => { cleanupTurnAudio(); speakBrowserTTS(replyText, language, startQuestionPrompt, memoryReplyId ?? undefined) },
            GENERATED_SPEECH_RATE,
            memoryReplyId ?? undefined
          )
        } else {
          cleanupTurnAudio()
          speakBrowserTTS(replyText, language, startQuestionPrompt, memoryReplyId ?? undefined)
        }
        return
      }

      const questionPlaceholderId = activePendingMessageId ?? addPendingMessage()
      activePendingMessageId = questionPlaceholderId
      const payload = {
        sessionId: sessionIdRef.current,
        message: text,
        language,
        userName: 'Visitor',
        userLocation: 'Museum',
        mode: 'question',
        history: buildHistoryPayload(messages)
      }
      const data = await requestChatTurn(payload)
      const replyText = sanitizeAssistantText((data.message || '').trim())
      const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
      const audioTurnId: string | null = data?.audioTurnId || data?.audio_turn_id || null
      dlog('api audioUrl', audioUrl)
      // Question mode: speak the answer, then prompt for more (Question 2)
      const afterAnswerSpoken = () => {
        setHasReachedFinalPrompt(true)
        addMessage('bot', conf.question2)
        playAudio(scriptedAudioSrc(language, 'QUESTION_2'), () => {
          setPhase('confirm_more')
          setMicDesired(true)
        }, () => {
          setPhase('confirm_more')
          setMicDesired(true)
        }, GENERATED_SPEECH_RATE)
      }
      if (replyText) {
        let turnAudioBlobUrl: string | null = null
        if (audioTurnId) {
          try {
            turnAudioBlobUrl = await resolveAudioTurn(audioTurnId)
          } catch (err) {
            dlog('question turn audio polling failed; using browser TTS fallback', err)
          }
        }
        const resolved = turnAudioBlobUrl || resolveAudioSrc(audioUrl)
        dlog('resolved audio', resolved)
        const cleanupTurnAudio = () => {
          if (turnAudioBlobUrl) URL.revokeObjectURL(turnAudioBlobUrl)
        }
        updateMessage(questionPlaceholderId, replyText, { pending: false })
        scrollToMessageTop(questionPlaceholderId)
        if (resolved) {
          playAudio(
            resolved,
            () => { cleanupTurnAudio(); afterAnswerSpoken() },
            () => { cleanupTurnAudio(); speakBrowserTTS(replyText, language, afterAnswerSpoken, questionPlaceholderId ?? undefined) },
            GENERATED_SPEECH_RATE,
            questionPlaceholderId ?? undefined
          )
        } else {
          speakBrowserTTS(replyText, language, afterAnswerSpoken, questionPlaceholderId ?? undefined)
        }
      } else {
        // No answer received; keep the session open and prompt to try again
        updateMessage(
          questionPlaceholderId,
          language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv igen.' : 'I could not fetch an answer right now. Please try again.',
          { pending: false }
        )
        setPhase('await_question')
        setMicDesired(true)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const errorText = language === 'da'
        ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.'
        : 'I could not fetch an answer right now. Please try again.'
      if (activePendingMessageId != null) {
        updateMessage(activePendingMessageId, errorText, { pending: false })
      } else {
        addMessage('bot', errorText)
      }
    } finally {
      setIsLoading(false)
    }
  }, [addMessage, addPendingMessage, draft, isLoading, language, messages, playAudio, stopMic, phase, hasSharedMemory, sttBuffer, speakBrowserTTS, resolveAudioTurn, requestChatTurn, updateMessage, scrollToMessageTop, markQuestionPromptReached, persistArchiveSystemTurn, onExitSession, startManualReturn])

  const skip = useCallback(() => {
    if (!language) return
    if (isFarewellPlaying) return
    if (isAudioPlayingRef.current && activeNarrationAdvanceRef.current) {
      advanceCurrentNarration()
      return
    }
    // Stop any current audio immediately
    try { audioElRef.current?.pause() } catch {}
    setIsAudioPlaying(false)
    const conf = scripts[language]
    // If we're in intro, either jump to memory prompt or complete it
    if (phase === 'intro') {
      const hasMemoryPrompt = messages.some(m => m.role === 'bot' && m.content === conf.memory1)
      if (!hasMemoryPrompt) {
        // Skip welcome: show memory prompt and start its audio
        addMessage('bot', conf.memory1)
        playAudio(scriptedAudioSrc(language, 'MEMORY_1'), () => {
          setPhase('await_memory')
          setMicDesired(true)
        }, () => {
          setPhase('await_memory')
          setMicDesired(true)
        }, GENERATED_SPEECH_RATE)
      } else {
        // Memory prompt already shown; finish it
        setPhase('await_memory')
        setMicDesired(true)
      }
      return
    }
  }, [language, phase, messages, addMessage, playAudio, advanceCurrentNarration, isFarewellPlaying])

  const canSkipAhead = (phase === 'intro' || isAudioPlaying) && !isFarewellPlaying
  const canType = phase === 'await_memory' || phase === 'await_question' || phase === 'confirm_more' || phase === 'await_return'
  const hasDraftContent = draft.length > 0
  const showPlaybackControl = (isAudioPlaying || Boolean(lastAudioSrcRef.current) || hasSpeechReplay) && !isFarewellPlaying
  const showSecondaryRow = canSkipAhead || showPlaybackControl
  const inputPlaceholder = language === 'da'
    ? 'Tal eller skriv her...'
    : 'Speak or type here...'
  const isVoiceActive = micDesired || isMicOn
  const voiceStatusLabel = (
    language === 'da'
      ? (isVoiceActive ? 'Lytter…' : 'Taleinput klar')
      : (isVoiceActive ? 'Listening…' : 'Voice input ready')
  )

  useEffect(() => {
    if (!autoFollowRef.current) return
    const list = chatListRef.current
    if (!list) return
    const frame = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [keyboardEnabled, showSecondaryRow, micError, canType, isVoiceActive, showPlaybackControl])

  const activateKeyboardInput = useCallback(() => {
    if (!canType || isLoading) return
    setKeyboardEnabled(true)
    stopMic()
    window.setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      try {
        el.focus()
        const pos = el.value.length
        el.setSelectionRange?.(pos, pos)
      } catch {}
    }, 0)
  }, [canType, isLoading, stopMic])

  const activateVoiceInput = useCallback(() => {
    if (!canType || isLoading || !isSpeechSupported) return
    if (!window.isSecureContext) {
      setMicError(language === 'da'
        ? 'Mikrofon kræver HTTPS eller localhost. Åbn siden via https, ellers vil browseren blokere adgang.'
        : 'Microphone requires HTTPS or localhost. Open the site over https, otherwise the browser will block access.')
      setMicDesired(false)
      return
    }

    setKeyboardEnabled(false)
    setMicError(null)
    try { inputRef.current?.blur() } catch {}

    void (async () => {
      try {
        await requestMicrophonePermission()
        startMic()
      } catch (err) {
        const message = (err as DOMException | Error | undefined)?.name === 'NotAllowedError'
          ? getSpeechErrorMessage('not-allowed', language)
          : language === 'da'
            ? 'Mikrofonadgang kunne ikke aktiveres. Tjek browserens tilladelser.'
            : 'Microphone access could not be enabled. Check your browser permissions.'
        setMicError(message)
        setMicDesired(false)
      }
    })()
  }, [canType, isLoading, isSpeechSupported, language, startMic])

  const handleFollowLatest = useCallback(() => {
    const list = chatListRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
    autoFollowRef.current = true
    setShowFollow(false)
  }, [])

  const handleTogglePlayback = useCallback(() => {
    if (isAudioPlaying) {
      if (activePlaybackKindRef.current === 'speech') {
        const synth = getSpeechSynthesisApi()
        suppressSpeechOnEndRef.current = true
        try { synth?.cancel() } catch {}
        activePlaybackKindRef.current = null
        setIsAudioPlaying(false)
        return
      }
      const el = audioElRef.current
      if (!el) return
      try { el.pause() } catch {}
      return
    }
    if (hasSpeechReplay && speechReplayRef.current) {
      const speech = speechReplayRef.current
      speakBrowserTTS(speech.text, speech.lang, speech.onEnded, speech.autoScrollMsgId, speech.enableMicAfter ?? true)
      return
    }
    if (!lastAudioSrcRef.current) return
    const el = audioElRef.current
    if (!el) return
    const last = lastAudioSrcRef.current
    const canResume = el.currentTime > 0 && !el.ended
    if (canResume) {
      el.play().catch(() => {})
    } else {
      playAudio(last, undefined, undefined, lastAudioRateRef.current || 1)
    }
  }, [hasSpeechReplay, isAudioPlaying, playAudio, speakBrowserTTS])

  const handleDraftChange = useCallback((value: string, el: HTMLTextAreaElement) => {
    syncDraftFromManualEdit(value)
    stopMic()
    mlog('draft change', { value })
    resizeTextarea(el)
  }, [resizeTextarea, stopMic, syncDraftFromManualEdit])

  return (
    <div className='relative z-10 box-border w-[1100px] max-w-[95vw] overflow-x-hidden px-6 pb-6 pt-3 text-xl origin-top flex flex-col h-[90vh] max-h-[90vh]'>
      <ChatTranscript
        chatListRef={chatListRef}
        isIOS={isIOS}
        language={language}
        messages={messages}
        isLoading={isLoading}
      />

      <ChatComposer
        language={language}
        draft={draft}
        hasDraftContent={hasDraftContent}
        inputPlaceholder={inputPlaceholder}
        keyboardEnabled={keyboardEnabled}
        canType={canType}
        isSpeechSupported={isSpeechSupported}
        isLoading={isLoading}
        showSecondaryRow={showSecondaryRow}
        showPlaybackControl={showPlaybackControl}
        canSkipAhead={canSkipAhead}
        isVoiceActive={isVoiceActive}
        isAudioPlaying={isAudioPlaying}
        hasPlaybackSource={Boolean(lastAudioSrcRef.current) || hasSpeechReplay}
        showFollow={showFollow}
        micError={micError}
        voiceStatusLabel={voiceStatusLabel}
        inputRef={inputRef}
        onSubmit={submit}
        onDraftChange={handleDraftChange}
        onActivateKeyboardInput={activateKeyboardInput}
        onActivateVoiceInput={activateVoiceInput}
        onStopMic={stopMic}
        onStartDeleteHold={startDeleteHold}
        onStopDeleteHold={stopDeleteHold}
        onFollowLatest={handleFollowLatest}
        onSkip={skip}
        onTogglePlayback={handleTogglePlayback}
      />
    </div>
  )
}
