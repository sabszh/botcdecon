import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { preloadAudio, getCached, clearCache } from '../lib/audioCache'

type Language = 'en' | 'da'

type ChatMessage = {
  id: number
  role: 'user' | 'bot'
  content: string
}

type Props = {
  language: Language
  onChangeLanguage: () => void
}

const rawApiBase =
  (import.meta.env.VITE_API_BASE as string) ||
  (import.meta.env.VITE_API_BASE_URL as string) ||
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000'
    : '')
const apiBase: string = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase
const CHAT_ENDPOINT = `${apiBase}/api/chat`
const CHAT_AUDIO_ENDPOINT = `${CHAT_ENDPOINT}/audio`
const INTRO_START_MAX_WAIT_MS = 1500
const INTRO_MIN_DELAY_MS = 300
const GENERATED_SPEECH_RATE = 0.9 // Tad slower, still natural for all bot audio
// Browser TTS (fallback) should be ~5% faster than generated
const BROWSER_TTS_RATE = Math.min(2, GENERATED_SPEECH_RATE * 1.05)

// Debug toggle: set localStorage.audioDebug = '1' to enable logs
const AUDIO_DEBUG = (() => { try { return localStorage.getItem('audioDebug') === '1' } catch { return false } })()
const dlog = (...args: any[]) => { if (AUDIO_DEBUG) console.log('[AUDIO]', ...args) }

// Resolve audio URL from backend:
// - Keep data:, blob:, and absolute http(s) URLs as-is
// - Otherwise, treat as relative to apiBase
function resolveAudioSrc (u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.toString()
  if (/^(data:|blob:|https?:\/\/)/i.test(s)) { dlog('resolve passthrough', s); return s }
  if (!apiBase) { dlog('resolve no apiBase', s); return s }
  const left = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  const right = s.startsWith('/') ? s : `/${s}`
  const out = `${left}${right}`
  dlog('resolve joined', { input: s, out })
  return out
}

const THANK_YOU_TEXTS: Record<Language, string> = {
  en: 'Thank you for sharing.',
  da: 'Tak for at dele din erindring.'
}

type BackendChatResponse = {
  message?: string
  audioUrl?: string | null
  audio_url?: string | null
  audioTurnId?: string | null
  audio_turn_id?: string | null
}

function buildSessionId () {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function buildHistoryPayload (history: ChatMessage[]) {
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

const scripts = {
  en: {
    welcome: `Hello!\n\nThank you for being here. What a long strange trip we’ve been on, but there’s still a long road ahead.\n\nWelcome to our vehicle. We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.\n\nWe may have her voice, but we’re speaking through a data set or rather through the experiences of thousands of people who were here before you. All of whom have shared what they remember that they want the future to remember. They have placed that memory onto a website known as continuonus. On the website a map is being cultivated.\n\nNow let's journey through that map. In here you may share something that you feel is important for the future to remember and you can ask us about what previous visitors shared?`,
    memory1: `Please share a memory? Something you’d like other's in the future to remember to remember. Press the Share button when you’re done.`,
    question1: `Now would you ask us about what others have felt it was important for the future to remember to remember? You are in their future. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done.`,
    question2: `Would you like to ask something else before continuing on? If you want to ask more, you can do that now; otherwise say “no”. Press the Share button when you’re done.`,
    explore: ``,
    farewell: `Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future.`
  },
  da: {
    welcome: `Hej!\n\nTak fordi du er her. Sikke en lang, mærkelig rejse vi har været på, men der er stadig en lang vej foran os.\n\n Velkommen til vores køretøj. Vi er Bot de ContinuOnus, en AI‑genereret chatbot, der taler med kunstneren Helene Nymanns klonede stemme.\n\nVi har måske hendes stemme, men vi taler gennem et datasæt — eller rettere gennem erfaringerne fra tusindvis af mennesker, der var her før dig. De har alle delt det, de husker, som de ønsker, at fremtiden skal huske. De har placeret den erindring på en hjemmeside kendt som ContinuOnus. På hjemmesiden opbygges et kort.\n\nLad os nu rejse gennem det kort. Her kan du dele noget, som du føler er vigtigt for fremtiden at huske, og du kan spørge os om, hvad tidligere besøgende har delt?`,
    memory1: `Vil du dele en erindring? Noget du gerne vil have, at andre i fremtiden skal huske at huske. Tryk på Del, når du er færdig.`,
    question1: `Vil du nu spørge os om, hvad andre har følt var vigtigt for fremtiden at huske at huske? Du er i deres fremtid. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del, når du er færdig.`,
    question2: `Vil du spørge om noget mere, før vi fortsætter? Hvis du vil spørge mere, kan du gøre det nu; ellers sig “nej”. Tryk på Del, når du er færdig.`,
    explore: ``,
    farewell: `Tak fordi du tog denne del af rejsen sammen med os. Du er nu også en del af continuOnus‑landskabet. Vi håber at se dig i fremtiden.`
  }
} as const

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
  const inputBaseHeightRef = useRef<number>(0)
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null) // Keep audio element reference
  const messageIdRef = useRef(0) // Message ID reference
  const lastAudioSrcRef = useRef<string | null>(null) // Last audio source reference
  const lastAudioRateRef = useRef<number>(1) // Last audio rate reference
  const recognitionRef = useRef<any>(null) // Speech recognition reference
  const isMicOnRef = useRef(false) // Microphone state reference
  const isAudioPlayingRef = useRef(false) // Audio playing state reference
  const micDesiredRef = useRef(false) // Desired microphone state reference
  const isLoadingRef = useRef(false) // Loading state reference
  const committedMicRef = useRef('') // Committed microphone reference
  const sessionIdRef = useRef(buildSessionId())
  const requestAbortRef = useRef<AbortController | null>(null)
  const audioFetchAbortRef = useRef<AbortController | null>(null)
  // Auto-follow / scroll management
  const autoFollowRef = useRef(true)
  const [showFollow, setShowFollow] = useState(false)
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
  }, [language])
  useEffect(() => () => {
    requestAbortRef.current?.abort()
    audioFetchAbortRef.current?.abort()
  }, [])

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    if (!content?.trim()) return null as number | null
    const id = messageIdRef.current++
    setMessages(cur => [...cur, { id, role, content }])
    return id
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


  // Very lightweight negation detection per language
  const isNegativeResponse = useCallback((text: string, lang: Language) => {
    const t = (text || '').toLowerCase().trim()
    if (!t) return false
    if (lang === 'da') {
      const negatives = [
        'nej', 'nej tak', 'ikke', 'ingen', 'nej,', 'nej.', 'nej ', 'stop', 'slut', 'det er det', 'det var det',
        'intet mere', 'ikke mere', 'nej tak,', 'nej tak.'
      ]
      return negatives.some(k => t.includes(k))
    } else {
      const negatives = [
        'no', 'nope', 'nah', "don't", 'do not', 'not now', 'nothing', "that's all", 'stop', 'no,', 'no.',
        'no thanks', 'no thank you', "that's it", 'nothing else', 'i am done', 'im done', "i'm done"
      ]
      return negatives.some(k => t.includes(k))
    }
  }, [])

  // Lightweight affirmative detection per language
  const isAffirmativeResponse = useCallback((text: string, lang: Language) => {
    const t = (text || '').toLowerCase().trim()
    if (!t) return false
    if (lang === 'da') {
      const affirm = [
        'ja', 'ja tak', 'jo', 'jep', 'jeps', 'klart', 'sikkert', 'okay', 'ok', 'lad os', 'gerne'
      ]
      return affirm.some(k => t.startsWith(k) || t === k)
    } else {
      const affirm = [
        'yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', 'alright', 'please', 'go ahead'
      ]
      return affirm.some(k => t.startsWith(k) || t === k)
    }
  }, [])

  // --- FIXED: Define playAudio before startIntro ---
  const playAudio = useCallback(async (
    src: string,
    onEnded?: () => void,
    onError?: () => void,
    rate?: number,
    autoScrollMsgId?: number,
    enableMicAfter: boolean = true
  ) => {
    if (!src) return
    // Swap to cached blob URL if preloaded (removes network/decode lag)
    const cached = getCached(src)
    const chosenSrc = cached || src
    lastAudioSrcRef.current = src
    lastAudioRateRef.current = rate && rate > 0 ? rate : 1
    const el = audioElRef.current
    if (!el) return

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
    el.onended = () => {
      setIsAudioPlaying(false)
      if (enableMicAfter) setMicDesired(true)
      if (onEnded) onEnded()
    }
    el.onerror = () => {
      setIsAudioPlaying(false)
      if (onError) onError()
    }
    el.play().catch(err => console.warn('[Audio play rejected]', err))
  }, [])
  // --- END FIX ---

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

  // moved: scroll position tracking effect is placed after startAudioAutoScroll definition

  // Autosize the text input as content grows
  const resizeTextarea = useCallback((el?: HTMLTextAreaElement | null) => {
    const node = el || inputRef.current
    if (!node) return
    // Measure content height
    node.style.height = 'auto'
    const max = Math.round(window.innerHeight * 0.4)
    const h = Math.min(node.scrollHeight, max)
    if (!inputBaseHeightRef.current) {
      // Use the first measured single-line height as base
      inputBaseHeightRef.current = h
    }
    const base = inputBaseHeightRef.current
    const extra = Math.max(0, h - base)
    // Set actual textarea height
    node.style.height = h + 'px'
    // Move it up so it visually expands upward
    node.style.transform = `translateY(-${extra}px)`
    // Fix outer wrapper height so siblings don't shift
    const wrap = inputWrapRef.current
    if (wrap) {
      wrap.style.height = base + 'px'
      wrap.style.setProperty('--taOffset', extra + 'px')
    }
  }, [])

  useEffect(() => { resizeTextarea() }, [draft, resizeTextarea])

  // Track which message should be auto-scrolled with the playing audio
  const autoScrollMsgIdRef = useRef<number | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const audioFadeRafRef = useRef<number | null>(null)

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

  const stopAudioAutoScroll = useCallback(() => {
    autoScrollMsgIdRef.current = null
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
  }, [])

  const computeScrollBounds = useCallback((msgId: number) => {
    const list = chatListRef.current
    if (!list) return null as { start: number; end: number } | null
    const bubble = list.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null
    if (!bubble) return null
    const messageTop = bubble.offsetTop
    const messageBottom = messageTop + bubble.scrollHeight
    const start = Math.max(0, messageTop - 8)
    const end = Math.max(0, messageBottom - list.clientHeight * 0.9)
    return { start, end }
  }, [])

  const startTimedAudioAutoScroll = useCallback((msgId: number, durationMs: number) => {
    const list = chatListRef.current
    if (!list || !durationMs || durationMs <= 0) return
    const bounds = computeScrollBounds(msgId)
    if (!bounds) return
    const { start, end } = bounds
    autoScrollMsgIdRef.current = msgId
    list.scrollTop = start
    const startTime = performance.now()
    const step = (now: number) => {
      if (autoScrollMsgIdRef.current !== msgId) return
      if (!autoFollowRef.current) { scrollRafRef.current = null; return }
      const t = Math.min(1, (now - startTime) / durationMs)
      list.scrollTop = start + (end - start) * t
      if (t < 1) {
        scrollRafRef.current = requestAnimationFrame(step)
      } else {
        scrollRafRef.current = null
      }
    }
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(step)
  }, [computeScrollBounds])

  const startAudioAutoScroll = useCallback((msgId: number) => {
    autoScrollMsgIdRef.current = msgId
    const tick = () => {
      if (!autoFollowRef.current) { scrollRafRef.current = null; return }
      const el = audioElRef.current
      const msg = autoScrollMsgIdRef.current
      if (!el || !msg) { scrollRafRef.current = null; return }
      const dur = el.duration || 0
      const t = el.currentTime || 0
      if (dur > 0) {
        scrollMessageProgress(msg, Math.max(0, Math.min(1, t / dur)))
      }
      scrollRafRef.current = requestAnimationFrame(tick)
    }
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(tick)
  }, [scrollMessageProgress])

  // Track user scroll position and toggle auto-follow accordingly
  useEffect(() => {
    const list = chatListRef.current
    if (!list) return
    const onScroll = () => {
      const atBottom = (list.scrollHeight - (list.scrollTop + list.clientHeight)) <= NEAR_BOTTOM_PX
      autoFollowRef.current = atBottom
      setShowFollow(!atBottom)
      // If user left bottom, stop any running auto-follow loop
      if (!atBottom && scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
      // If user returned to bottom while audio is playing, resume follow
      if (atBottom && isAudioPlayingRef.current && autoScrollMsgIdRef.current != null && !scrollRafRef.current) {
        startAudioAutoScroll(autoScrollMsgIdRef.current)
      }
    }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [startAudioAutoScroll])

  // Fallback TTS using the browser's SpeechSynthesis
  const speakBrowserTTS = useCallback((text: string, lang: Language, onEnded?: () => void, autoScrollMsgId?: number) => {
    if (!text) { if (onEnded) onEnded(); return }
    const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined
    if (!synth) { if (onEnded) onEnded(); return }
    try { synth.cancel() } catch {}
    // Stop mic while speaking
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    setIsAudioPlaying(true)
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang === 'da' ? 'da-DK' : 'en-US'
    // Slightly faster (5%) for browser TTS fallback only
    utter.rate = BROWSER_TTS_RATE
    if (typeof autoScrollMsgId === 'number') {
      const total = Math.max(1, text.length)
      utter.onboundary = (ev: any) => {
        const idx = typeof ev?.charIndex === 'number' ? ev.charIndex : 0
        const ratio = Math.max(0, Math.min(1, idx / total))
        scrollMessageProgress(autoScrollMsgId, ratio)
      }
    }
    utter.onend = () => {
      setIsAudioPlaying(false)
      stopAudioAutoScroll()
      setMicDesired(true)
      if (onEnded) onEnded()
    }
    utter.onerror = () => {
      setIsAudioPlaying(false)
      stopAudioAutoScroll()
      if (onEnded) onEnded()
    }
    synth.speak(utter)
  }, [scrollMessageProgress, stopAudioAutoScroll])

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
        return
      }
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const chunk = res[0].transcript
        if (res.isFinal) finalText += chunk
        else interimText += chunk
      }
      // Append final recognized text into input
      if (finalText) {
        const sep = committedMicRef.current && !committedMicRef.current.endsWith(' ') ? ' ' : ''
        committedMicRef.current = `${committedMicRef.current}${sep}${finalText}`.trim()
        setDraft(committedMicRef.current)
        setSttBuffer(committedMicRef.current)
      }
      // Show interim in input while listening
      if (interimText) {
        const sep2 = committedMicRef.current && interimText ? ' ' : ''
        setDraft(`${committedMicRef.current}${sep2}${interimText}`.trim())
      } else if (!finalText) {
        // No interim and no final: keep committed text
        setDraft(committedMicRef.current)
      }
      setSttLive(interimText)
    }
    rec.onerror = (ev: any) => {
      setIsMicOn(false)
      const err = (ev?.error || '').toString()
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicError(language === 'da' ? 'Mikrofonadgang er blokeret. Tillad adgang i browserens indstillinger.' : 'Microphone access is blocked. Allow it in your browser settings.')
        setMicDesired(false)
      } else if (err === 'no-speech') {
        // benign; will auto-restart via onend
      } else if (err) {
        setMicError(err)
      }
    }
    rec.onend = () => {
      setSttLive('')
      // Keep listening while desired and it's the user's turn
      const shouldListen = micDesiredRef.current && !isAudioPlayingRef.current && !isLoadingRef.current
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
        committedMicRef.current = (draft || '').trim()
        recognitionRef.current.start()
        setIsMicOn(true)
      }
    } catch {}
  }, [draft, isSpeechSupported])

  const stopMic = useCallback(() => {
    // external toggle: mark undesired, controller effect will stop
    setMicDesired(false)
    setSttLive('')
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
        committedMicRef.current = (draft || '').trim()
        recognitionRef.current.start()
        setIsMicOn(true)
      } catch {}
    } else if (!shouldListen && isMicOn) {
      try { recognitionRef.current.stop() } catch {}
      setIsMicOn(false)
    }
  }, [language, micDesired, isAudioPlaying, isLoading, isSpeechSupported, isMicOn, draft])

  const requestChatTurn = useCallback(async (payload: Record<string, unknown>) => {
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller

    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('Non-JSON response')
    return await res.json() as BackendChatResponse
  }, [])

  const resolveAudioTurn = useCallback(async (turnId: string): Promise<string | null> => {
    if (!turnId) return null
    audioFetchAbortRef.current?.abort()
    const controller = new AbortController()
    audioFetchAbortRef.current = controller
    const deadline = Date.now() + 8000

    while (Date.now() < deadline) {
      const res = await fetch(`${CHAT_AUDIO_ENDPOINT}/${encodeURIComponent(turnId)}`, {
        method: 'GET',
        headers: { Accept: 'audio/mpeg' },
        signal: controller.signal
      })
      if (res.status === 202) {
        await new Promise(resolve => window.setTimeout(resolve, 250))
        continue
      }
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    }
    return null
  }, [])

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const text = (draft.trim() || sttBuffer.trim())
    if (!text || isLoading) return
    audioFetchAbortRef.current?.abort()
    // Stop mic when sending
    stopMic()
    addMessage('user', text)
    setDraft('')
    setSttBuffer('')
    setSttLive('')
    committedMicRef.current = ''
    // Special handling: if we're confirming more questions, branch here
    if (phase === 'confirm_more') {
      const conf = scripts[language]
      // If negative, say farewell and exit
      if (isNegativeResponse(text, language)) {
        addMessage('bot', conf.farewell)
        playAudio(`/audio/${language}_FAREWELL.mp3`, () => {
          onChangeLanguage()
        }, undefined, GENERATED_SPEECH_RATE)
        return
      }
      // If explicitly affirmative (e.g., "yes"/"ja"), nudge them to ask the next question
      if (isAffirmativeResponse(text, language)) {
        const prompt = language === 'da'
          ? 'Hvad vil du gerne spørge om?'
          : 'What would you like to ask?'
        addMessage('bot', prompt)
        setPhase('await_question')
        setMicDesired(true)
        return
      }
      // Otherwise treat this as the next question
      setIsLoading(true)
      try {
        const payload = {
          sessionId: sessionIdRef.current,
          message: text,
          language,
          userName: 'Visitor',
          userLocation: 'Museum',
          mode: 'question' as const,
          history: buildHistoryPayload(messages)
        }
        const data = await requestChatTurn(payload)
        const replyText = (data.message || '').trim()
        const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
        const audioTurnId: string | null = data?.audioTurnId || data?.audio_turn_id || null
        dlog('api audioUrl (confirm_more)', audioUrl)
        // After answering, ask if they'd like more (Question 2)
        const afterAnswer = () => {
          addMessage('bot', conf.question2)
          playAudio(`/audio/${language}_QUESTION_2.mp3`, () => {
            setPhase('confirm_more')
            setMicDesired(true)
          }, undefined, GENERATED_SPEECH_RATE)
        }
        if (replyText) {
          const msgId = addMessage('bot', replyText)
          let turnAudioBlobUrl: string | null = null
          if (audioTurnId) {
            turnAudioBlobUrl = await resolveAudioTurn(audioTurnId).catch(() => null)
          }
          const resolved = turnAudioBlobUrl || resolveAudioSrc(audioUrl)
          dlog('resolved audio (confirm_more)', resolved)
          const cleanupTurnAudio = () => {
            if (turnAudioBlobUrl) URL.revokeObjectURL(turnAudioBlobUrl)
          }
          if (resolved) {
            playAudio(
              resolved,
              () => { cleanupTurnAudio(); afterAnswer() },
              () => { cleanupTurnAudio(); speakBrowserTTS(replyText, language, afterAnswer, msgId ?? undefined) },
              GENERATED_SPEECH_RATE,
              msgId ?? undefined
            )
          } else {
            speakBrowserTTS(replyText, language, afterAnswer, msgId ?? undefined)
          }
        } else {
          addMessage('bot', language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.' : 'I could not fetch an answer right now. Please try again.')
          setPhase('await_question')
          setMicDesired(true)
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        addMessage('bot', language === 'da' ? 'Noget gik galt. Prøv igen.' : 'Something went wrong. Please try again.')
      } finally {
        setIsLoading(false)
      }
      return
    }
    setIsLoading(true)
    try {
      const isMemoryTurn = phase === 'await_memory' || !hasSharedMemory
      const payload = {
        sessionId: sessionIdRef.current,
        message: text,
        language,
        userName: 'Visitor',
        userLocation: 'Museum',
        mode: isMemoryTurn ? 'memory' : 'question',
        history: buildHistoryPayload(messages)
      }
      const data = await requestChatTurn(payload)
      const replyText = (data.message || '').trim()
      const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
      const audioTurnId: string | null = data?.audioTurnId || data?.audio_turn_id || null
      dlog('api audioUrl', audioUrl)
      // Handle audio sequencing and next prompt depending on phase/turn
      if (isMemoryTurn) {
        const conf = scripts[language]
        setHasSharedMemory(true)
        addMessage('bot', replyText || THANK_YOU_TEXTS[language])
        // Always use the pre-generated static THANK_YOU audio, regardless of backend response
        playAudio(`/audio/${language}_THANK_YOU.mp3`, () => {
          addMessage('bot', conf.question1)
          playAudio(`/audio/${language}_QUESTION_1.mp3`, () => {
            setPhase('await_question')
            setMicDesired(true)
          }, undefined, GENERATED_SPEECH_RATE)
        }, undefined, GENERATED_SPEECH_RATE)
      } else {
        // Question mode: speak the answer, then prompt for more (Question 2)
        const conf = scripts[language]
        const afterAnswerSpoken = () => {
          addMessage('bot', conf.question2)
          playAudio(`/audio/${language}_QUESTION_2.mp3`, () => {
            setPhase('confirm_more')
            setMicDesired(true)
          }, undefined, GENERATED_SPEECH_RATE)
        }
        if (replyText) {
          const msgId = addMessage('bot', replyText)
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
              () => { cleanupTurnAudio(); speakBrowserTTS(replyText, language, afterAnswerSpoken, msgId ?? undefined) },
              GENERATED_SPEECH_RATE,
              msgId ?? undefined
            )
          } else {
            speakBrowserTTS(replyText, language, afterAnswerSpoken, msgId ?? undefined)
          }
        } else {
          // No answer received; keep the session open and prompt to try again
          addMessage('bot', language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.' : 'I could not fetch an answer right now. Please try again.')
          setPhase('await_question')
          setMicDesired(true)
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      addMessage('bot', language === 'da' ? 'Noget gik galt. Prøv igen.' : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [addMessage, draft, isLoading, language, messages, playAudio, stopMic, phase, hasSharedMemory, sttBuffer, onChangeLanguage, isNegativeResponse, isAffirmativeResponse, speakBrowserTTS, resolveAudioTurn, requestChatTurn])

  const skip = useCallback(() => {
    if (!language) return
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
  }, [language, phase, messages, addMessage, playAudio])

  return (
    <div className='relative z-10 w-[1100px] max-w-[95vw] px-6 py-6 text-xl origin-top flex flex-col h-[90vh] max-h-[90vh]'>
      <audio ref={audioElRef} preload='auto' playsInline />

      {/* Header moved to Home and fixed to top of viewport */}

      <div
        ref={chatListRef}
        className={`mt-3 flex-1 min-h-0 overflow-y-auto flex flex-col justify-end scroll-touch ${isIOS ? '' : 'no-scrollbar'}`}
        style={{ WebkitOverflowScrolling: 'touch' as any, overscrollBehavior: 'contain', touchAction: 'pan-y' as any }}
      >
        {micError && (
          <div className='mb-3 flex justify-start'>
            <div className='surface-bubble max-w-[80%] rounded-[2rem] px-5 py-4 text-2xl leading-relaxed text-black'>
              {micError}
            </div>
          </div>
        )}
        {/* Debug overlay (disabled)
        <div style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 14,
          pointerEvents: 'none'
        }}>
          <div>Mic: {isMicOn ? 'ON' : 'OFF'}</div>
          <div>Mic Desired: {micDesired ? 'YES' : 'NO'}</div>
          <div>Audio Playing: {isAudioPlaying ? 'YES' : 'NO'}</div>
          <div>Speech Supported: {isSpeechSupported ? 'YES' : 'NO'}</div>
          <div>Mic Error: {micError || 'none'}</div>
        </div>
        */}
        {messages.map(m => (
          <div key={m.id} data-msg-id={m.id} className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-[2rem] px-5 py-4 text-2xl leading-relaxed text-black ${m.role === 'user' ? 'surface-bubble-strong' : 'surface-bubble'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className='flex justify-start'>
            <div className='surface-bubble rounded-[2rem] px-5 py-4 text-2xl leading-relaxed text-black'>
              <div className='typing-dots'>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Follow button when user has scrolled up */}
      {showFollow && (
        <div className='pointer-events-none relative -mt-3 mb-1 flex justify-end'>
          <button
            type='button'
            className='surface-pill pointer-events-auto rounded-full px-4 py-1.5 text-base text-black transition hover:bg-white hover:text-black'
            onClick={() => {
              const list = chatListRef.current
              if (!list) return
              list.scrollTop = list.scrollHeight
              autoFollowRef.current = true
              setShowFollow(false)
              if (isAudioPlayingRef.current && autoScrollMsgIdRef.current != null && !scrollRafRef.current) {
                startAudioAutoScroll(autoScrollMsgIdRef.current)
              }
            }}
          >
            {language === 'da' ? 'Følg bund' : 'Jump to latest'}
          </button>
        </div>
      )}

      <form onSubmit={submit} className='mt-4 flex flex-col gap-3'>
        <label htmlFor='message' className='sr-only'>Message</label>
        <div ref={inputWrapRef} className='relative' style={{ height: undefined as any }}>
          <textarea
            ref={inputRef}
            id='message'
            name='message'
            rows={1}
            value={draft}
            onChange={e => { setDraft(e.target.value); stopMic(); resizeTextarea(e.currentTarget) }}
            placeholder={language === 'da' ? '' : ''}
            className='surface-card w-full rounded-[2rem] pr-14 pl-5 py-4 text-2xl text-black placeholder:text-black/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            style={{ overflow: 'hidden', maxHeight: '40vh', transform: undefined as any }}
            disabled={isLoading}
            autoComplete='off'
            readOnly={!keyboardEnabled}
            inputMode={keyboardEnabled ? undefined : 'none'}
          />
          <button
            type='button'
            onMouseDown={startDeleteHold}
            onMouseUp={stopDeleteHold}
            onMouseLeave={stopDeleteHold}
            onTouchStart={(e) => { e.preventDefault(); startDeleteHold() }}
            onTouchEnd={stopDeleteHold}
            onTouchCancel={stopDeleteHold}
            disabled={!draft}
            className='surface-pill absolute right-2 rounded-full px-3 py-1.5 text-base text-black transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
            style={{ bottom: `calc(var(--taOffset, 0px) + 8px)` }}
            aria-label={language === 'da' ? 'Slet ord' : 'Delete word'}
          >
            ⌫
          </button>
        </div>
        <div className='flex items-center gap-3'>
          <button
            type='button'
            onClick={() => {
              const el = audioElRef.current
              if (!el) return
              if (isAudioPlaying) {
                try { el.pause() } catch {}
              } else if (lastAudioSrcRef.current) {
                const last = lastAudioSrcRef.current
                const cur = el.src || ''
                // With preloaded blob URLs, el.src won't match the logical path; resume if we have a currentTime
                const canResume = el.currentTime > 0 && !el.ended
                if (canResume) {
                  el.play().catch(() => {})
                } else {
                  playAudio(last, undefined, undefined, lastAudioRateRef.current || 1)
                }
              }
            }}
            disabled={!isAudioPlaying && !lastAudioSrcRef.current}
            className='surface-pill rounded-full px-5 py-3 text-xl text-black transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50'>
            {isAudioPlaying ? 'Stop' : 'Go'}
          </button>
          <button
            type='button'
            onClick={() => {
              if (keyboardEnabled) {
                // Turn keyboard off and resume mic
                setKeyboardEnabled(false)
                try { inputRef.current?.blur() } catch {}
                startMic()
              } else {
                // Turn keyboard on and stop mic
                setKeyboardEnabled(true)
                stopMic()
                // Focus to open keyboard (user gesture)
                setTimeout(() => { try { inputRef.current?.focus() } catch {} }, 0)
              }
            }}
            className={`rounded-full px-5 py-3 text-xl transition ${keyboardEnabled ? 'bg-black text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)]' : 'surface-pill text-black hover:bg-white hover:text-black'}`}
          >
            {language === 'da' ? (keyboardEnabled ? 'Tastatur Til' : 'Tastatur Fra') : (keyboardEnabled ? 'Keyboard On' : 'Keyboard Off')}
          </button>
          <button type='button' onClick={() => (micDesired ? stopMic() : startMic())} disabled={!isSpeechSupported || isAudioPlaying} className={`rounded-full px-5 py-3 text-xl transition ${micDesired ? 'bg-black text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)]' : 'surface-pill text-black hover:bg-white hover:text-black'} disabled:cursor-not-allowed disabled:opacity-50`}>
            {micDesired ? (language === 'da' ? 'Mic Til' : 'Mic On') : (language === 'da' ? 'Mic Fra' : 'Mic Off')}
          </button>
          {/* Skip button removed as requested */}
          <button type='submit' disabled={isLoading || !draft.trim()} className='surface-pill ml-auto rounded-full px-7 py-4 text-2xl font-medium text-black transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50'>
            {language === 'da' ? 'Del' : 'Share'}
          </button>
        </div>
      </form>

      {/* removed in-app speed tester UI */}
    </div>
  )
}
