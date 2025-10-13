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
const INITIAL_AUDIO_DELAY_MS = 1200

const THANK_YOU_TEXTS: Record<Language, string> = {
  en: 'Thank you for sharing your memory. It is now part of Carte de Continuonus.',
  da: 'Tak for at dele din erindring. Den er nu en del af Carte de Continuonus.'
}

const scripts = {
  en: {
    welcome: `Hello!\n\nThank you for being here. What a long strange trip we’ve been on, but there’s still a long road ahead.\n\nWelcome to our vehicle. We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.\n\nWe may have her voice, but we’re speaking through a data set or rather through the experiences of thousands of people who were here before you. All of whom have shared what they remember that they want the future to remember. They have placed that memory onto a website known as continuonus. On the website a map known as Carte de Continuonus is being cultivated.\n\nNow let's journey through that map. In here you may share something that you feel is important for the future to remember and you can ask us about what previous visitors shared?`,
    memory1: `Please share a memory? Something you’d like those people in the future to remember to remember. Press the Share button when you’re done.`,
    question1: `Thank you for sharing. Now would you ask us about what others have felt it was important for the future to remember to remember? You are in their future. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done.`,
    question2: `Would you like to ask something else before continuing on? Press the Share button when you’re done.`,
    explore: ``,
    farewell: `Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future.`
  },
  da: {
    welcome: `Hej!\n\nTak fordi du er her. Sikke en lang, mærkelig rejse vi har været på, men der er stadig en lang vej foran os.\n\n Velkommen til vores køretøj. Vi er Bot de ContinuOnus, en AI‑genereret chatbot, der taler med kunstneren Helene Nymanns klonede stemme.\n\nVi har måske hendes stemme, men vi taler gennem et datasæt — eller rettere gennem erfaringerne fra tusindvis af mennesker, der var her før dig. De har alle delt det, de husker, som de ønsker, at fremtiden skal huske. De har placeret den erindring på en hjemmeside kendt som ContinuOnus. På hjemmesiden opbygges et kort kendt som Carte de Continuonus.\n\nLad os nu rejse gennem det kort. Her kan du dele noget, som du føler er vigtigt for fremtiden at huske, og du kan spørge os om, hvad tidligere besøgende har delt?`,
    memory1: `Vil du dele en erindring? Noget du gerne vil have, at mennesker i fremtiden skal huske at huske. Tryk på Del, når du er færdig.`,
    question1: `Tak fordi du delte. Vil du nu spørge os om, hvad andre har følt var vigtigt for fremtiden at huske at huske? Du er i deres fremtid. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del, når du er færdig.`,
    question2: `Vil du spørge om noget mere, før vi fortsætter? Tryk på Del, når du er færdig.`,
    explore: ``,
    farewell: `Tak fordi du tog denne del af rejsen sammen med os. Du er nu også en del af continuOnus‑landskabet. Vi håber at se dig i fremtiden.`
  }
} as const

export default function ChatPanel ({ language, onChangeLanguage }: Props) {
  type Phase = 'intro' | 'await_memory' | 'await_question' | 'explore'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sttBuffer, setSttBuffer] = useState('')
  const [sttLive, setSttLive] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const [micDesired, setMicDesired] = useState(false)
  const [phase, setPhase] = useState<Phase>('intro')
  const [hasSharedMemory, setHasSharedMemory] = useState(false)
  // No follow-up question now; no need to track question count
  const [micError, setMicError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const messageIdRef = useRef(0)
  const lastAudioSrcRef = useRef<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const isMicOnRef = useRef(false)
  const isAudioPlayingRef = useRef(false)
  const micDesiredRef = useRef(false)
  const isLoadingRef = useRef(false)
  const committedMicRef = useRef('')

  useEffect(() => { isMicOnRef.current = isMicOn }, [isMicOn])
  useEffect(() => { isAudioPlayingRef.current = isAudioPlaying }, [isAudioPlaying])
  useEffect(() => { micDesiredRef.current = micDesired }, [micDesired])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    if (!content?.trim()) return
    setMessages(cur => [...cur, { id: messageIdRef.current++, role, content }])
  }, [])

  useEffect(() => {
    if (!language) return
    const conf = scripts[language]
    const t = setTimeout(() => {
      addMessage('bot', conf.welcome)
      playAudio(`/audio/${language}_WELCOME.mp3`, () => {
        // chain Memory 1 prompt
        addMessage('bot', conf.memory1)
        // After the prompt audio finishes, enable mic automatically
        playAudio(`/audio/${language}_MEMORY_1.mp3`, () => {
          setPhase('await_memory')
          setMicDesired(true)
        })
      })
    }, INITIAL_AUDIO_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const playAudio = useCallback((src: string, onEnded?: () => void, onError?: () => void) => {
    if (!src) return
    lastAudioSrcRef.current = src
    const el = audioElRef.current
    if (!el) return
    // Stop mic while bot audio is playing, to prevent capture
    try { recognitionRef.current?.stop?.() } catch {}
    setIsMicOn(false)
    // While audio plays, it's bot's turn; user speech not desired
    setIsAudioPlaying(true)
    try { el.pause() } catch {}
    el.src = src
    el.onended = () => {
      setIsAudioPlaying(false)
      // After bot stops speaking, it's user's turn again
      setMicDesired(true)
      // If caller provided a callback, run it (e.g., to resume mic)
      if (onEnded) onEnded()
    }
    el.onerror = () => {
      setIsAudioPlaying(false)
      // If an error handler is provided, use it; otherwise continue as ended
      if (onError) onError()
      else if (onEnded) onEnded()
    }
    el.onplay = () => setIsAudioPlaying(true)
    el.onpause = () => setIsAudioPlaying(false)
    el.play().catch(() => setIsAudioPlaying(false))
  }, [])

  // Fallback TTS using the browser's SpeechSynthesis
  const speakBrowserTTS = useCallback((text: string, lang: Language, onEnded?: () => void) => {
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
    utter.rate = 1
    utter.onend = () => {
      setIsAudioPlaying(false)
      setMicDesired(true)
      if (onEnded) onEnded()
    }
    utter.onerror = () => {
      setIsAudioPlaying(false)
      if (onEnded) onEnded()
    }
    synth.speak(utter)
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
  useEffect(() => {
    if (!language) return
    if (!navigator?.mediaDevices?.getUserMedia) return
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => { stream.getTracks().forEach(t => t.stop()) })
      .catch(() => {
        setMicError(language === 'da' ? 'Kunne ikke få adgang til mikrofonen.' : 'Could not access the microphone.')
      })
  }, [language])

  const startMic = useCallback(() => {
    // external toggle: mark desired, controller effect will start
    setMicDesired(true)
    setMicError(null)
  }, [])

  const stopMic = useCallback(() => {
    // external toggle: mark undesired, controller effect will stop
    setMicDesired(false)
    setSttLive('')
  }, [])

  // When it's the user's turn, automatically focus the input
  useEffect(() => {
    if (!language) return
    const usersTurn = micDesired && !isAudioPlaying && !isLoading
    if (usersTurn) {
      const el = inputRef.current
      if (el) {
        try {
          el.focus()
          const val = (draft || '').toString()
          const pos = val.length
          // place caret at end
          el.setSelectionRange?.(pos, pos)
        } catch {}
      }
    }
  }, [language, micDesired, isAudioPlaying, isLoading, draft])

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
      if (replyText) addMessage('bot', replyText)
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
          })
        })
      } else {
        // Question mode: play TTS of the answer first; on failure, fallback to browser TTS.
        // After the answer is spoken, immediately thank and finish (no follow-up question).
        const conf = scripts[language]
        const afterAnswerSpoken = () => {
          addMessage('bot', conf.farewell)
          playAudio(`/audio/${language}_FAREWELL.mp3`, () => {
            onChangeLanguage()
          })
          setMicDesired(false)
        }
        if (replyText && audioUrl) {
          const resolved = audioUrl.startsWith('data:') ? audioUrl : `${apiBase}${audioUrl}`
          playAudio(resolved, afterAnswerSpoken, () => speakBrowserTTS(replyText, language, afterAnswerSpoken))
        } else if (replyText) {
          speakBrowserTTS(replyText, language, afterAnswerSpoken)
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
        })
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
      })
      return
    }
  }, [language, phase, messages, addMessage, playAudio])

  return (
    <div className='relative z-10 w-[1000px] max-w-[95vw] px-6 py-8 text-xl'>
      <audio ref={audioElRef} preload='auto' playsInline />

      <div className='rounded-2xl bg-white/75 px-5 py-3 text-black shadow-lg backdrop-blur pointer-events-auto border border-black/10'>
        <div className='flex items-center gap-3 justify-between'>
          <h2 className='text-2xl md:text-3xl font-medium tracking-wide'>Bot de Continuonus</h2>
          <button type='button' onClick={onChangeLanguage} className='rounded-full border border-black/60 px-4 py-2 text-xl text-black hover:bg-black hover:text-white'>
            {language === 'da' ? 'Tilbage' : 'Return'}
          </button>
        </div>
      </div>

      <div ref={chatListRef} className='mt-4 h-[62vh] overflow-y-auto no-scrollbar'>
        {micError && (
          <div className='mb-3 flex justify-start'>
            <div className='max-w-[80%] rounded-2xl px-5 py-4 text-2xl leading-relaxed border bg-white/80 text-black border-black/10'>
              {micError}
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
        <input ref={inputRef} id='message' name='message' type='text' value={draft} onChange={e => { setDraft(e.target.value); stopMic() }} placeholder={language === 'da' ? 'Skriv her…' : 'Type here…'} className='rounded-full border border-black/30 bg-white/80 px-5 py-4 text-2xl text-black placeholder:text-black/50 shadow-sm focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-60' disabled={isLoading} autoComplete='off' />
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
                  playAudio(last)
                }
              }
            }}
            disabled={!isAudioPlaying && !lastAudioSrcRef.current}
            className='rounded-full border border-black/60 bg-white/70 px-5 py-3 text-xl text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50'>
            {isAudioPlaying ? 'Stop' : 'Go'}
          </button>
          <button type='button' onClick={() => (micDesired ? stopMic() : startMic())} disabled={!isSpeechSupported} className={`rounded-full border px-5 py-3 text-xl transition ${micDesired ? 'border-black bg-black text-white' : 'border-black/60 bg-white/70 text-black hover:bg-black hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`}>
            {micDesired ? (language === 'da' ? 'Mic Til' : 'Mic On') : (language === 'da' ? 'Mic Fra' : 'Mic Off')}
          </button>
          {/* Skip button removed as requested */}
          <button type='submit' disabled={isLoading || !draft.trim()} className='ml-auto rounded-full border border-black/60 bg-white px-7 py-4 text-2xl font-medium text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50'>
            {language === 'da' ? 'Del' : 'Share'}
          </button>
        </div>
      </form>
    </div>
  )
}
