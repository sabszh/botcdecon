import type { CSSProperties, RefObject } from 'react'
import type { ChatMessage, Language } from './types'

type Props = {
  chatListRef: RefObject<HTMLDivElement | null>
  isIOS: boolean
  language: Language
  messages: ChatMessage[]
  isLoading: boolean
}

export default function ChatTranscript ({
  chatListRef,
  isIOS,
  language,
  messages,
  isLoading
}: Props) {
  const hasPendingMessage = messages.some(message => message.pending)
  const transcriptScrollStyle: CSSProperties = {
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y'
  }

  return (
    <div
      ref={chatListRef}
      className={`mt-3 flex-1 min-h-0 overflow-y-auto scroll-touch ${isIOS ? '' : 'no-scrollbar'}`}
      style={transcriptScrollStyle}
    >
      <div className='flex min-h-full flex-col justify-end pb-4'>
        {messages.map(m => (
          <div key={m.id} data-msg-id={m.id} className={`mb-3 last:mb-1 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-[2rem] px-5 py-4 text-2xl leading-relaxed text-black ${m.role === 'user' ? 'surface-bubble-strong' : 'surface-bubble'}`}>
              {m.pending
                ? (
                  <div className='typing-dots' aria-label={language === 'da' ? 'Skriver' : 'Typing'}>
                    <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                    <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                    <span style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}/>
                  </div>
                  )
                : m.content}
            </div>
          </div>
        ))}
        {isLoading && !hasPendingMessage && (
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
    </div>
  )
}
