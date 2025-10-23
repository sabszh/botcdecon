import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

const apiBase: string = (import.meta.env.VITE_API_BASE as string) || ''
const CHAT_ENDPOINT = `${apiBase}/api/chat`
const INITIAL_AUDIO_DELAY_MS = 8000
const GENERATED_SPEECH_RATE = 0.9 // Tad slower, still natural for all bot audio
const AUDIO_FADE_MS = 300
// Browser TTS (fallback) should be ~5% faster than generated
const BROWSER_TTS_RATE = Math.min(2, GENERATED_SPEECH_RATE * 1.05)

const THANK_YOU_TEXTS: Record<Language, string> = {
  en: 'Thank you for sharing.',
  da: 'Tak for at dele din erindring.'
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
  // No UI or persistence for speech rate; use a fixed constant for generated audio only
  // No follow-up question now; no need to track question count
  const [micError, setMicError] = useState<string | null>(null)
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
  // Repeating delete (backspace) support
  const deleteHoldTimeoutRef = useRef<number | null>(null)
  const deleteHoldIntervalRef = useRef<number | null>(null)

  useEffect(() => { isMicOnRef.current = isMicOn }, [isMicOn])
  useEffect(() => { isAudioPlayingRef.current = isAudioPlaying }, [isAudioPlaying])
  useEffect(() => { micDesiredRef.current = micDesired }, [micDesired])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])

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

  useEffect(() => {
    if (!language) return
    const conf = scripts[language]
    const t = setTimeout(() => {
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
    }, INITIAL_AUDIO_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  useEffect(() => {
    const list = chatListRef.current
    if (!list) return
    // If this is the very first message, show from the top so the
    // beginning of a long message isn't clipped off-screen.
    if (messages.length <= 1) {
      list.scrollTop = 0
    } else {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, isLoading])

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
      const el = audioElRef.current
      const msg = autoScrollMsgIdRef.current
      if (!el || !msg) return
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

  const playAudio = useCallback(async (src: string, onEnded?: () => void, onError?: () => void, rate?: number, autoScrollMsgId?: number, enableMicAfter: boolean = true) => {
    if (!src) return
    lastAudioSrcRef.current = src
    lastAudioRateRef.current = typeof rate === 'number' && isFinite(rate) && rate > 0 ? rate : 1
    const el = audioElRef.current
    if (!el) return
    // Stop mic while bot audio is playing, to prevent capture
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    // While audio plays, it's bot's turn; user speech not desired
    setIsAudioPlaying(true)
    if (audioFadeRafRef.current) cancelAnimationFrame(audioFadeRafRef.current)
    const fade = (from: number, to: number, duration: number) => {
      const startTime = performance.now()
      const start = from
      const delta = to - from
      if (Math.abs(delta) < 0.001 || duration <= 0) {
        el.volume = to
        return
      }
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration)
        el.volume = start + delta * t
        if (t < 1) {
          audioFadeRafRef.current = requestAnimationFrame(step)
        } else {
          audioFadeRafRef.current = null
        }
      }
      audioFadeRafRef.current = requestAnimationFrame(step)
    }

    const wasPlaying = !el.paused && !el.ended && el.currentTime > 0
    if (wasPlaying) {
      try {
        fade(el.volume ?? 1, 0, AUDIO_FADE_MS)
        await new Promise<void>(resolve => setTimeout(resolve, AUDIO_FADE_MS))
      } catch {}
    }
    try { el.pause() } catch {}
    el.src = src
    // Apply playback rate ONLY when explicitly requested (for generated audio)
    try {
      if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
        el.playbackRate = Math.max(0.5, Math.min(2, rate))
        ;(el as any).preservesPitch = true
        ;(el as any).mozPreservesPitch = true
        ;(el as any).webkitPreservesPitch = true
      } else {
        el.playbackRate = 1
      }
    } catch {}
    try { el.volume = 0 } catch {}
    el.onended = () => {
      setIsAudioPlaying(false)
      stopAudioAutoScroll()
      // After bot stops speaking, it's user's turn again
      if (enableMicAfter) setMicDesired(true)
      // If caller provided a callback, run it (e.g., to resume mic)
      if (onEnded) onEnded()
    }
    el.onerror = () => {
      setIsAudioPlaying(false)
      stopAudioAutoScroll()
      // If an error handler is provided, use it; otherwise continue as ended
      if (onError) onError()
      else if (onEnded) onEnded()
    }
    el.onplay = () => {
      setIsAudioPlaying(true)
      if (typeof autoScrollMsgId === 'number') {
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
        if (d > 0) startTimedAudioAutoScroll(autoScrollMsgId, d * 1000)
        else startAudioAutoScroll(autoScrollMsgId)
      }
    }
    el.onpause = () => setIsAudioPlaying(false)
    el.play()
      .then(() => {
        fade(0, 1, AUDIO_FADE_MS)
      })
      .catch(() => setIsAudioPlaying(false))
  }, [startAudioAutoScroll, stopAudioAutoScroll])

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

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const text = (draft.trim() || sttBuffer.trim())
    if (!text || isLoading) return
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
        const historyPayload = messages.map(m => ({ role: m.role, content: m.content }))
      const payload = {
        sessionId: `session_${Date.now()}`,
        message: text,
        language,
        userName: 'Visitor',
        userLocation: 'Museum',
        mode: 'question' as const,
        history: historyPayload
      }
        const res = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('Non-JSON response')
        const data = await res.json()
        const replyText = (data?.message || '').trim()
        const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
        // After answering, ask if they'd like more (Question 2)
        const afterAnswer = () => {
          addMessage('bot', conf.question2)
          playAudio(`/audio/${language}_QUESTION_2.mp3`, () => {
            setPhase('confirm_more')
            setMicDesired(true)
          }, undefined, GENERATED_SPEECH_RATE)
        }
        if (replyText && audioUrl) {
          const resolved = audioUrl.startsWith('data:') ? audioUrl : `${apiBase}${audioUrl}`
          // Slightly slower rate for generated audio
          const msgId = addMessage('bot', replyText)
          playAudio(resolved, afterAnswer, () => speakBrowserTTS(replyText, language, afterAnswer, msgId ?? undefined), GENERATED_SPEECH_RATE, msgId ?? undefined)
        } else if (replyText) {
          const msgId = addMessage('bot', replyText)
          speakBrowserTTS(replyText, language, afterAnswer, msgId ?? undefined)
        } else {
          addMessage('bot', language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.' : 'I could not fetch an answer right now. Please try again.')
          setPhase('await_question')
          setMicDesired(true)
        }
      } catch (err) {
        addMessage('bot', language === 'da' ? 'Noget gik galt. Prøv igen.' : 'Something went wrong. Please try again.')
      } finally {
        setIsLoading(false)
      }
      return
    }
    setIsLoading(true)
    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }))
      const isMemoryTurn = phase === 'await_memory' || !hasSharedMemory
      const payload = {
        sessionId: `session_${Date.now()}`,
        message: text,
        language,
        userName: 'Visitor',
        userLocation: 'Museum',
        mode: isMemoryTurn ? 'memory' : 'question',
        history: historyPayload
      }
      const res = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) throw new Error('Non-JSON response')
      const data = await res.json()
      const replyText = (data?.message || '').trim()
      const audioUrl: string | null = data?.audioUrl || data?.audio_url || null
      // Handle audio sequencing and next prompt depending on phase/turn
      if (isMemoryTurn) {
        const conf = scripts[language]
        setHasSharedMemory(true)
        // Ensure a visible thank-you message even if backend returned empty
        if (!replyText) {
          addMessage('bot', THANK_YOU_TEXTS[language])
        }
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
        if (replyText && audioUrl) {
          const resolved = audioUrl.startsWith('data:') ? audioUrl : `${apiBase}${audioUrl}`
          // Slightly slower rate for generated audio
          const msgId = addMessage('bot', replyText)
          playAudio(resolved, afterAnswerSpoken, () => speakBrowserTTS(replyText, language, afterAnswerSpoken, msgId ?? undefined), GENERATED_SPEECH_RATE, msgId ?? undefined)
        } else if (replyText) {
          const msgId = addMessage('bot', replyText)
          speakBrowserTTS(replyText, language, afterAnswerSpoken, msgId ?? undefined)
        } else {
          // No answer received; keep the session open and prompt to try again
          addMessage('bot', language === 'da' ? 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.' : 'I could not fetch an answer right now. Please try again.')
          setPhase('await_question')
          setMicDesired(true)
        }
      }
    } catch (err) {
      addMessage('bot', language === 'da' ? 'Noget gik galt. Prøv igen.' : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [addMessage, draft, isLoading, language, messages, playAudio, stopMic, phase])

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
            <div className='max-w-[80%] rounded-2xl px-5 py-4 text-2xl leading-relaxed border bg-white/80 text-black border-black/10'>
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
            <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-2xl leading-relaxed border ${m.role === 'user' ? 'bg-white text-black border-black/10' : 'bg-white/80 text-black border-black/10'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className='flex justify-start'>
            <div className='rounded-2xl bg-white/80 px-5 py-4 text-2xl leading-relaxed text-black border border-black/10'>
              <div className='typing-dots'>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
              </div>
            </div>
          </div>
        )}
      </div>

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
            className='w-full rounded-3xl border border-black/30 bg-white pr-14 pl-5 py-4 text-2xl text-black placeholder:text-black/50 shadow-sm focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
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
            className='absolute right-2 rounded-2xl border border-black/40 bg-white px-3 py-1.5 text-base text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
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
                const canResume = !!last && cur.includes(last) && el.currentTime > 0 && !el.ended
                if (canResume) {
                  el.play().catch(() => {})
                } else {
                  playAudio(last, undefined, undefined, lastAudioRateRef.current || 1)
                }
              }
            }}
            disabled={!isAudioPlaying && !lastAudioSrcRef.current}
            className='rounded-full border border-black/60 bg-white/70 px-5 py-3 text-xl text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50'>
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
            className={`rounded-full border px-5 py-3 text-xl transition ${keyboardEnabled ? 'border-black bg-black text-white' : 'border-black/60 bg-white/70 text-black hover:bg-black hover:text-white'}`}
          >
            {language === 'da' ? (keyboardEnabled ? 'Tastatur Til' : 'Tastatur Fra') : (keyboardEnabled ? 'Keyboard On' : 'Keyboard Off')}
          </button>
          <button type='button' onClick={() => (micDesired ? stopMic() : startMic())} disabled={!isSpeechSupported || isAudioPlaying} className={`rounded-full border px-5 py-3 text-xl transition ${micDesired ? 'border-black bg-black text-white' : 'border-black/60 bg-white/70 text-black hover:bg-black hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`}>
            {micDesired ? (language === 'da' ? 'Mic Til' : 'Mic On') : (language === 'da' ? 'Mic Fra' : 'Mic Off')}
          </button>
          {/* Skip button removed as requested */}
          <button type='submit' disabled={isLoading || !draft.trim()} className='ml-auto rounded-full border border-black/60 bg-white px-7 py-4 text-2xl font-medium text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50'>
            {language === 'da' ? 'Del' : 'Share'}
          </button>
        </div>
      </form>

      {/* removed in-app speed tester UI */}
    </div>
  )
}
