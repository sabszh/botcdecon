import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { preloadAudio, getCached, clearCache } from '../lib/audioCache'
import { requestChatTurn as requestChatTurnRequest, resolveAudioTurn as resolveAudioTurnRequest } from './chat/backend'
import { BROWSER_TTS_RATE, GENERATED_SPEECH_RATE, INTRO_MIN_DELAY_MS, INTRO_START_MAX_WAIT_MS, scripts, THANK_YOU_TEXTS } from './chat/config'
import { resolveApiUrl } from '../lib/api'
import ChatComposer from './chat/ChatComposer'
import ChatTranscript from './chat/ChatTranscript'
import { buildHistoryPayload, buildSessionId } from './chat/helpers'
import type { ChatMessage, Language } from './chat/types'

type Props = {
  language: Language
  onChangeLanguage: () => void
}

// Debug toggle: set localStorage.audioDebug = '1' to enable logs
const AUDIO_DEBUG = (() => { try { return localStorage.getItem('audioDebug') === '1' } catch { return false } })()
const dlog = (...args: any[]) => { if (AUDIO_DEBUG) console.log('[AUDIO]', ...args) }
const MIC_DEBUG = (() => { try { return localStorage.getItem('micDebug') === '1' } catch { return false } })()
const mlog = (...args: any[]) => { if (MIC_DEBUG) console.log('[MIC]', ...args) }

// Resolve audio URL from backend:
// - Keep data:, blob:, and absolute http(s) URLs as-is
// - Otherwise, treat as relative to apiBase
function resolveAudioSrc (u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.toString()
  const out = resolveApiUrl(s)
  dlog('resolve joined', { input: s, out })
  return out
}

function getSpeechErrorMessage (err: string, language: Language): string | null {
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

function normalizeSpeechText (value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeAssistantText (value: string): string {
  if (!value) return ''
  return value
    .replace(/\r\n/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isLikelyQuestionInput (value: string, language: Language): boolean {
  const normalized = normalizeSpeechText(value).toLowerCase()
  if (!normalized) return false
  if (normalized.includes('?')) return true

  const questionStarts = language === 'da'
    ? ['hvad', 'hvordan', 'hvorfor', 'hvornår', 'hvor', 'hvem', 'hvilken', 'hvilke', 'kan', 'kunne', 'vil', 'ville', 'er', 'har', 'fortæl']
    : ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'is', 'are', 'do', 'does', 'did', 'has', 'have', 'tell me']

  return questionStarts.some(prefix => normalized.startsWith(prefix + ' ') || normalized === prefix)
}

function getConfirmMoreReprompt (language: Language): string {
  return language === 'da'
    ? 'Del en ny erindring eller stil et nyt spørgsmål nu. Tryk på Del, når du er færdig. Hvis du vil afslutte sessionen, så tryk på tilbage.'
    : 'Please share another memory or ask another question now. Press the Share button when you’re done. If you want to end this session, press return.'
}

function getPendingLabel (language: Language, kind: 'memory' | 'question' | 'followup'): string {
  if (language === 'da') {
    if (kind === 'memory') return 'Forbinder dit minde med tidligere minder…'
    if (kind === 'followup') return 'Finder den rigtige næste retning…'
    return 'Leder efter et svar i tidligere minder…'
  }
  if (kind === 'memory') return 'Connecting your memory to earlier memories…'
  if (kind === 'followup') return 'Figuring out the next step…'
  return 'Looking through earlier memories for an answer…'
}

export default function ChatPanel ({ language, onChangeLanguage }: Props) {
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
  type Phase = 'intro' | 'await_memory' | 'await_question' | 'confirm_more' | 'explore'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sttBuffer, setSttBuffer] = useState('')
  const [sttLive, setSttLive] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  // Control whether the on-screen keyboard is allowed to appear (default Off everywhere)
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(false)
  const [micDesired, setMicDesired] = useState(false)
  const [phase, setPhase] = useState<Phase>('intro')
  const [hasSharedMemory, setHasSharedMemory] = useState(false)
  const [introAssetsReady, setIntroAssetsReady] = useState(false)
  // No UI or persistence for speech rate; use a fixed constant for generated audio only
  // No follow-up question now; no need to track question count
  const [micError, setMicError] = useState<string | null>(null)
  // Track whether we've started the intro flow (prevents double-start on iOS unlock)
  const introStartedRef = useRef(false)
  const introTimerRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const inputWrapRef = useRef<HTMLDivElement | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null) // Keep audio element reference
  const messageIdRef = useRef(0) // Message ID reference
  const lastAudioSrcRef = useRef<string | null>(null) // Last audio source reference
  const lastAudioRateRef = useRef<number>(1) // Last audio rate reference
  const activeNarrationAdvanceRef = useRef<(() => void) | null>(null)
  const activePlaybackKindRef = useRef<'media' | 'speech' | null>(null)
  const suppressSpeechOnEndRef = useRef(false)
  const speechReplayRef = useRef<{ text: string, lang: Language, onEnded?: () => void, autoScrollMsgId?: number } | null>(null)
  const recognitionRef = useRef<any>(null) // Speech recognition reference
  const isMicOnRef = useRef(false) // Microphone state reference
  const isAudioPlayingRef = useRef(false) // Audio playing state reference
  const micDesiredRef = useRef(false) // Desired microphone state reference
  const isLoadingRef = useRef(false) // Loading state reference
  const committedMicRef = useRef('') // Committed microphone reference
  const speechSessionBaseRef = useRef('')
  const speechSessionFinalRef = useRef('')
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

  useEffect(() => { isMicOnRef.current = isMicOn }, [isMicOn])
  useEffect(() => { isAudioPlayingRef.current = isAudioPlaying }, [isAudioPlaying])
  useEffect(() => { micDesiredRef.current = micDesired }, [micDesired])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => {
    sessionIdRef.current = buildSessionId()
    requestAbortRef.current?.abort()
    audioFetchAbortRef.current?.abort()
    activeNarrationAdvanceRef.current = null
    activePlaybackKindRef.current = null
    speechReplayRef.current = null
    speechSessionBaseRef.current = ''
    speechSessionFinalRef.current = ''
    setHasSpeechReplay(false)
  }, [language])
  useEffect(() => () => {
    requestAbortRef.current?.abort()
    audioFetchAbortRef.current?.abort()
  }, [])

  const addMessage = useCallback((role: ChatMessage['role'], content: string, extras: Partial<ChatMessage> = {}) => {
    if (!content?.trim() && !extras.pending) return null as number | null
    const id = messageIdRef.current++
    setMessages(cur => [...cur, { id, role, content, ...extras }])
    return id
  }, [])

  const addPendingMessage = useCallback((label: string) => {
    return addMessage('bot', '', { pending: true, pendingLabel: label })
  }, [addMessage])

  const updateMessage = useCallback((id: number | null, content: string, extras: Partial<ChatMessage> = {}) => {
    if (id == null) return
    setMessages(cur => cur.map(message => (
      message.id === id ? { ...message, content, ...extras } : message
    )))
  }, [])

  const deleteOneWord = useCallback(() => {
    const current = (draft || '').toString()
    if (!current) return
    // Remove trailing spaces first, then remove last word
    const trimmedEnd = current.replace(/\s+$/g, '')
    const withoutLast = trimmedEnd.replace(/\S+\s*$/g, '')
    const next = withoutLast
    setDraft(next)
    setSttBuffer(next)
    setSttLive('')
    committedMicRef.current = next
  }, [draft])

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
      `/audio/${language}_WELCOME.mp3`,
      `/audio/${language}_MEMORY_1.mp3`,
      `/audio/${language}_QUESTION_1.mp3`,
      `/audio/${language}_QUESTION_2.mp3`,
      `/audio/${language}_FAREWELL.mp3`,
      `/audio/${language}_THANK_YOU.mp3`,
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
      if (onError) onError()
      return
    }
    // Swap to cached blob URL if preloaded (removes network/decode lag)
    const cached = getCached(src)
    const chosenSrc = cached || src
    lastAudioSrcRef.current = src
    lastAudioRateRef.current = rate && rate > 0 ? rate : 1
    activePlaybackKindRef.current = 'media'
    activeNarrationAdvanceRef.current = onEnded || null
    speechReplayRef.current = null
    setHasSpeechReplay(false)
    const el = audioElRef.current
    if (!el) {
      activePlaybackKindRef.current = null
      setIsAudioPlaying(false)
      if (onError) onError()
      return
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
    el.onplay = () => fade(0, 1, 400)
    el.onpause = () => {
      setIsAudioPlaying(false)
    }
    el.onended = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      const after = activeNarrationAdvanceRef.current
      activeNarrationAdvanceRef.current = null
      if (enableMicAfter) setMicDesired(true)
      if (after) after()
    }
    el.onerror = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      activeNarrationAdvanceRef.current = null
      if (onError) onError()
    }
    el.play().catch(err => {
      console.warn('[Audio play rejected]', err)
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      activeNarrationAdvanceRef.current = null
      if (onError) onError()
    })
  }, [])

  // Start the scripted intro, with iOS unlock-aware gating
  const startIntro = useCallback(() => {
    if (!language) return
    if (introStartedRef.current) return
    introStartedRef.current = true
    const conf = scripts[language]
    addMessage('bot', conf.welcome)
    playAudio(`/audio/${language}_WELCOME.mp3`, () => {
      // chain Memory 1 prompt
      const idM1 = addMessage('bot', conf.memory1)
      // After the prompt audio finishes, enable mic automatically
      playAudio(`/audio/${language}_MEMORY_1.mp3`, () => {
        setPhase('await_memory')
        setMicDesired(true)
      }, undefined, GENERATED_SPEECH_RATE, idM1 ?? undefined, true)
    }, undefined, GENERATED_SPEECH_RATE, undefined, false)
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

    let audioAllowed = false
    try { audioAllowed = localStorage.getItem('audioAllowed') === '1' } catch {}

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

    // iOS and not yet allowed: wait for first user gesture to both unlock and start
    const onFirstGesture = () => {
      dlog('intro: first gesture received; starting intro')
      // Give the unlock handler a tick to run first.
      window.setTimeout(() => startIntro(), INTRO_MIN_DELAY_MS)
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

    const wrap = inputWrapRef.current
    if (wrap) {
      wrap.style.removeProperty('height')
      wrap.style.removeProperty('--taOffset')
    }
  }, [])

  useEffect(() => { resizeTextarea() }, [draft, resizeTextarea])

  const scrollMessageProgress = useCallback((msgId: number, ratio: number) => {
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

  // iOS/iPadOS: unlock the <audio> element on first user gesture
  useEffect(() => {
    const unlock = () => {
      const el = audioElRef.current
      if (!el) return cleanup()
      try {
        // Load and briefly play a tiny existing mp3 muted to satisfy iOS gesture policy
        // Use a small, bundled file to keep latency low
        const unlockSrc = '/audio/en_THANK_YOU.mp3'
        const prevSrc = el.src
        el.muted = true
        // Only swap in the unlock clip if there is no current src
        if (!prevSrc) {
          el.src = unlockSrc
          try { el.load?.() } catch {}
        }
        const p = el.play()
        if (p && typeof p.then === 'function') {
          p.then(() => {
            try { el.pause() } catch {}
            try { el.currentTime = 0 } catch {}
            el.muted = false
            // Restore previous src if we changed it just for unlock
            if (!prevSrc) {
              try { el.removeAttribute('src') } catch {}
              try { el.load?.() } catch {}
            }
            // Persist that audio was successfully unlocked
            try { localStorage.setItem('audioAllowed', '1') } catch {}
          }).catch(() => {
            // ignore
          })
        } else {
          try { el.pause() } catch {}
          try { el.currentTime = 0 } catch {}
          el.muted = false
          if (!prevSrc) {
            try { el.removeAttribute('src') } catch {}
            try { el.load?.() } catch {}
          }
          try { localStorage.setItem('audioAllowed', '1') } catch {}
        }
      } catch {}
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchend', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('touchend', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return cleanup
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
  const speakBrowserTTS = useCallback((text: string, lang: Language, onEnded?: () => void, autoScrollMsgId?: number) => {
    const safeText = sanitizeAssistantText(text)
    if (!safeText) { if (onEnded) onEnded(); return }
    const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined
    if (!synth) { if (onEnded) onEnded(); return }
    try { synth.cancel() } catch {}
    // Stop mic while speaking
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    setIsAudioPlaying(true)
    activePlaybackKindRef.current = 'speech'
    activeNarrationAdvanceRef.current = onEnded || null
    speechReplayRef.current = { text: safeText, lang, onEnded, autoScrollMsgId }
    setHasSpeechReplay(true)
    const utter = new SpeechSynthesisUtterance(safeText)
    utter.lang = lang === 'da' ? 'da-DK' : 'en-US'
    // Slightly faster (5%) for browser TTS fallback only
    utter.rate = BROWSER_TTS_RATE
    if (typeof autoScrollMsgId === 'number') {
      const total = Math.max(1, safeText.length)
      utter.onboundary = (ev: any) => {
        const idx = typeof ev?.charIndex === 'number' ? ev.charIndex : 0
        const ratio = Math.max(0, Math.min(1, idx / total))
        scrollMessageProgress(autoScrollMsgId, ratio)
      }
    }
    utter.onend = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      if (suppressSpeechOnEndRef.current) {
        suppressSpeechOnEndRef.current = false
        return
      }
      const after = activeNarrationAdvanceRef.current
      activeNarrationAdvanceRef.current = null
      setMicDesired(true)
      if (after) after()
    }
    utter.onerror = () => {
      setIsAudioPlaying(false)
      activePlaybackKindRef.current = null
      if (suppressSpeechOnEndRef.current) {
        suppressSpeechOnEndRef.current = false
        return
      }
      activeNarrationAdvanceRef.current = null
      if (onEnded) onEnded()
    }
    synth.speak(utter)
  }, [scrollMessageProgress])

  const advanceCurrentNarration = useCallback(() => {
    const after = activeNarrationAdvanceRef.current
    activeNarrationAdvanceRef.current = null
    if (activePlaybackKindRef.current === 'speech') {
      const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined
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
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setIsSpeechSupported(false)
      recognitionRef.current = null
      return
    }
    setIsSpeechSupported(true)
    const rec = new SR()
    rec.lang = language === 'da' ? 'da-DK' : 'en-US'
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    rec.continuous = !isIOS
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (event: any) => {
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
      const finalParts: string[] = []
      let latestInterim = ''
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i]
        const chunk = normalizeSpeechText(res[0].transcript || '')
        if (!chunk) continue
        if (res.isFinal) finalParts.push(chunk)
        else latestInterim = chunk
      }
      const sessionFinal = normalizeSpeechText(finalParts.join(' '))
      speechSessionFinalRef.current = sessionFinal
      const committed = normalizeSpeechText([speechSessionBaseRef.current, sessionFinal].filter(Boolean).join(' '))
      const interim = normalizeSpeechText(latestInterim)
      const visibleDraft = normalizeSpeechText([committed, interim].filter(Boolean).join(' '))

      mlog('result', {
        resultIndex: event.resultIndex,
        sessionBase: speechSessionBaseRef.current,
        sessionFinal,
        interim,
        committed,
        visibleDraft,
        results: Array.from(event.results || []).map((res: any, idx: number) => ({
          idx,
          final: !!res?.isFinal,
          transcript: normalizeSpeechText(res?.[0]?.transcript || '')
        }))
      })

      committedMicRef.current = committed
      setSttBuffer(committed)
      setSttLive(interim)
      setDraft(visibleDraft || committed || speechSessionBaseRef.current)
    }
    rec.onerror = (ev: any) => {
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
      setSttLive('')
      // Keep listening while desired and it's the user's turn
      const shouldListen = micDesiredRef.current && !isAudioPlayingRef.current && !isLoadingRef.current
      const nextBase = normalizeSpeechText([speechSessionBaseRef.current, speechSessionFinalRef.current].filter(Boolean).join(' '))
      speechSessionBaseRef.current = nextBase
      committedMicRef.current = nextBase
      setSttBuffer(nextBase)
      speechSessionFinalRef.current = ''
      mlog('end', {
        shouldListen,
        nextBase,
        micDesired: micDesiredRef.current,
        audioPlaying: isAudioPlayingRef.current,
        loading: isLoadingRef.current
      })
      if (shouldListen) {
        setTimeout(() => { try { rec.start() } catch {} }, 150)
      } else {
        setIsMicOn(false)
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
        const base = normalizeSpeechText(sttBuffer || draft || '')
        committedMicRef.current = base
        speechSessionBaseRef.current = base
        speechSessionFinalRef.current = ''
        setSttBuffer(base)
        setSttLive('')
        mlog('startMic immediate', { base, draft, sttBuffer })
        recognitionRef.current.start()
        setIsMicOn(true)
      }
    } catch {}
  }, [draft, isSpeechSupported, sttBuffer])

  const stopMic = useCallback(() => {
    // external toggle: mark undesired, controller effect will stop
    setMicDesired(false)
    setSttLive('')
    mlog('stopMic manual')
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
        const base = normalizeSpeechText(sttBuffer || draft || '')
        committedMicRef.current = base
        speechSessionBaseRef.current = base
        speechSessionFinalRef.current = ''
        setSttBuffer(base)
        mlog('startMic effect', { base, draft, sttBuffer, shouldListen })
        recognitionRef.current.start()
        setIsMicOn(true)
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
    setSttLive('')
    committedMicRef.current = ''
    setIsLoading(true)
    let activePendingMessageId: number | null = null
    try {
      const conf = scripts[language]
      let inputMode: 'memory' | 'question' = (phase === 'await_memory' || !hasSharedMemory) ? 'memory' : 'question'

      if (phase === 'confirm_more') {
        activePendingMessageId = addPendingMessage(getPendingLabel(language, 'followup'))
        try {
          const followupData = await requestChatTurn({
            sessionId: sessionIdRef.current,
            message: text,
            language,
            userName: 'Visitor',
            userLocation: 'Museum',
            mode: 'followup' as const,
            history: buildHistoryPayload(messages)
          })
          const followupAction = followupData.handoffAction || followupData.handoff_action || 'continue'

          if (followupAction === 'return') {
            updateMessage(activePendingMessageId, conf.farewell, { pending: false, pendingLabel: undefined })
            playAudio(`/audio/${language}_FAREWELL.mp3`, () => {
              onChangeLanguage()
            }, () => {
              speakBrowserTTS(conf.farewell, language, onChangeLanguage, activePendingMessageId ?? undefined)
            }, GENERATED_SPEECH_RATE, activePendingMessageId ?? undefined)
            return
          }

          if (followupAction === 'continue') {
            const reprompt = getConfirmMoreReprompt(language)
            updateMessage(activePendingMessageId, reprompt, { pending: false, pendingLabel: undefined })
            speakBrowserTTS(reprompt, language, () => {
              setPhase('confirm_more')
              setMicDesired(true)
            }, activePendingMessageId ?? undefined)
            return
          }

          inputMode = followupAction === 'question' ? 'question' : 'memory'
          updateMessage(activePendingMessageId, '', { pending: true, pendingLabel: getPendingLabel(language, inputMode) })
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err
          console.error('Follow-up classification failed', err)
          inputMode = isLikelyQuestionInput(text, language) ? 'question' : 'memory'
          if (activePendingMessageId != null) {
            updateMessage(activePendingMessageId, '', { pending: true, pendingLabel: getPendingLabel(language, inputMode) })
          }
        }
      }

      const isMemoryTurn = inputMode === 'memory'
      if (isMemoryTurn) {
        const thankYouText = THANK_YOU_TEXTS[language]
        const fallbackMemoryReply = language === 'da'
          ? 'Dit minde bliver nu en del af continuOnus-landskabet.'
          : 'Your memory now becomes part of the continuOnus landscape.'
        setHasSharedMemory(true)
        const memoryStartedAt = Date.now()
        const memoryDeadlineMs = 12000
        const memoryPlaceholderId = activePendingMessageId ?? addPendingMessage(getPendingLabel(language, 'memory'))
        activePendingMessageId = memoryPlaceholderId

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
          playAudio(`/audio/${language}_THANK_YOU.mp3`, resolve, resolve, GENERATED_SPEECH_RATE)
        })

        let replyText = ''
        let audioUrl: string | null = null
        let audioTurnId: string | null = null

        try {
          const remainingMs = Math.max(0, memoryDeadlineMs - (Date.now() - memoryStartedAt))
          const data = await Promise.race([
            memoryRequest,
            new Promise<null>(resolve => window.setTimeout(() => resolve(null), remainingMs))
          ])
          if (data) {
            replyText = sanitizeAssistantText((data.message || '').trim())
            audioUrl = data?.audioUrl || data?.audio_url || null
            audioTurnId = data?.audioTurnId || data?.audio_turn_id || null
          } else {
            console.warn('Memory confirmation request timed out; using fallback reply')
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err
          console.error('Memory persistence request failed', err)
        }

        const finalReplyText = replyText || fallbackMemoryReply
        const combinedReply = `${thankYouText}

${finalReplyText}`
        updateMessage(memoryPlaceholderId, combinedReply, { pending: false, pendingLabel: undefined })

        const startQuestionPrompt = () => {
          addMessage('bot', conf.question1)
          playAudio(`/audio/${language}_QUESTION_1.mp3`, () => {
            setPhase('await_question')
            setMicDesired(true)
          }, undefined, GENERATED_SPEECH_RATE)
        }

        let turnAudioBlobUrl: string | null = null
        if (replyText && audioTurnId) {
          turnAudioBlobUrl = await resolveAudioTurn(audioTurnId).catch(() => null)
        }
        const resolved = replyText ? (turnAudioBlobUrl || resolveAudioSrc(audioUrl)) : null
        const cleanupTurnAudio = () => {
          if (turnAudioBlobUrl) URL.revokeObjectURL(turnAudioBlobUrl)
        }

        if (resolved) {
          playAudio(
            resolved,
            () => { cleanupTurnAudio(); startQuestionPrompt() },
            () => { cleanupTurnAudio(); speakBrowserTTS(finalReplyText, language, startQuestionPrompt, memoryPlaceholderId ?? undefined) },
            GENERATED_SPEECH_RATE,
            memoryPlaceholderId ?? undefined
          )
        } else {
          speakBrowserTTS(finalReplyText, language, startQuestionPrompt, memoryPlaceholderId ?? undefined)
        }
        return
      }

      const questionPlaceholderId = activePendingMessageId ?? addPendingMessage(getPendingLabel(language, 'question'))
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
        addMessage('bot', conf.question2)
        playAudio(`/audio/${language}_QUESTION_2.mp3`, () => {
          setPhase('confirm_more')
          setMicDesired(true)
        }, undefined, GENERATED_SPEECH_RATE)
      }
      if (replyText) {
        updateMessage(questionPlaceholderId, replyText, { pending: false, pendingLabel: undefined })
        let turnAudioBlobUrl: string | null = null
        if (audioTurnId) {
          turnAudioBlobUrl = await resolveAudioTurn(audioTurnId).catch(() => null)
        }
        const resolved = turnAudioBlobUrl || resolveAudioSrc(audioUrl)
        dlog('resolved audio', resolved)
        const cleanupTurnAudio = () => {
          if (turnAudioBlobUrl) URL.revokeObjectURL(turnAudioBlobUrl)
        }
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
          language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.' : 'I could not fetch an answer right now. Please try again.',
          { pending: false, pendingLabel: undefined }
        )
        setPhase('await_question')
        setMicDesired(true)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const errorText = language === 'da' ? 'Noget gik galt. Prøv igen.' : 'Something went wrong. Please try again.'
      if (activePendingMessageId != null) {
        updateMessage(activePendingMessageId, errorText, { pending: false, pendingLabel: undefined })
      } else {
        addMessage('bot', errorText)
      }
    } finally {
      setIsLoading(false)
    }
  }, [addMessage, addPendingMessage, draft, isLoading, language, messages, playAudio, stopMic, phase, hasSharedMemory, sttBuffer, onChangeLanguage, speakBrowserTTS, resolveAudioTurn, requestChatTurn, updateMessage])

  const skip = useCallback(() => {
    if (!language) return
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
        playAudio(`/audio/${language}_MEMORY_1.mp3`, () => {
          setPhase('await_memory')
          setMicDesired(true)
        }, undefined, GENERATED_SPEECH_RATE)
      } else {
        // Memory prompt already shown; finish it
        setPhase('await_memory')
        setMicDesired(true)
      }
      return
    }
    // If awaiting memory, skip to question prompt
    if (phase === 'await_memory') {
      addMessage('bot', conf.question1)
      setPhase('await_question')
      setMicDesired(true)
      return
    }
    // If awaiting question, finish to explore
    if (phase === 'await_question') {
      addMessage('bot', conf.explore)
      setPhase('explore')
      setMicDesired(false)
      return
    }
    // If exploring, show farewell and go back to language select after audio
    if (phase === 'explore') {
      addMessage('bot', conf.farewell)
      playAudio(`/audio/${language}_FAREWELL.mp3`, () => {
        onChangeLanguage()
      }, undefined, GENERATED_SPEECH_RATE)
      return
    }
  }, [language, phase, messages, addMessage, playAudio, advanceCurrentNarration])

  const canSkipAhead = phase === 'intro' || phase === 'await_memory' || phase === 'await_question' || phase === 'explore'
  const canType = phase === 'await_memory' || phase === 'await_question' || phase === 'confirm_more'
  const hasDraftContent = draft.length > 0
  const showPlaybackControl = isAudioPlaying || Boolean(lastAudioSrcRef.current) || hasSpeechReplay
  const showSecondaryRow = canSkipAhead || showPlaybackControl
  const inputPlaceholder = language === 'da'
    ? 'Skriv her'
    : 'Type here'
  const isVoiceActive = micDesired || isMicOn
  const voiceStatusLabel = (
    language === 'da'
      ? (isVoiceActive ? 'Lytter…' : 'Taleinput klar')
      : (isVoiceActive ? 'Listening…' : 'Voice input ready')
  )

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
    setKeyboardEnabled(false)
    try { inputRef.current?.blur() } catch {}
    startMic()
  }, [canType, isLoading, isSpeechSupported, startMic])

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
        const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined
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
      speakBrowserTTS(speech.text, speech.lang, speech.onEnded, speech.autoScrollMsgId)
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
    setDraft(value)
    setSttBuffer(normalizeSpeechText(value))
    setSttLive('')
    stopMic()
    mlog('draft change', { value })
    resizeTextarea(el)
  }, [resizeTextarea, stopMic])

  return (
    <div className='relative z-10 w-[1100px] max-w-[95vw] px-6 py-6 text-xl origin-top flex flex-col h-[90vh] max-h-[90vh]'>
      <audio ref={audioElRef} preload='auto' playsInline />

      <ChatTranscript
        chatListRef={chatListRef}
        isIOS={isIOS}
        language={language}
        messages={messages}
        isLoading={isLoading}
        showFollow={showFollow}
        onFollowLatest={handleFollowLatest}
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
        hasPlaybackSource={Boolean(lastAudioSrcRef.current)}
        micError={micError}
        voiceStatusLabel={voiceStatusLabel}
        inputRef={inputRef}
        inputWrapRef={inputWrapRef}
        onSubmit={submit}
        onDraftChange={handleDraftChange}
        onActivateKeyboardInput={activateKeyboardInput}
        onActivateVoiceInput={activateVoiceInput}
        onStopMic={stopMic}
        onStartDeleteHold={startDeleteHold}
        onStopDeleteHold={stopDeleteHold}
        onSkip={skip}
        onTogglePlayback={handleTogglePlayback}
      />
    </div>
  )
}
