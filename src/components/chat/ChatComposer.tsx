import type { FormEventHandler, RefObject } from 'react'
import type { Language } from './types'

type Props = {
  language: Language
  draft: string
  hasDraftContent: boolean
  inputPlaceholder: string
  keyboardEnabled: boolean
  canType: boolean
  isLoading: boolean
  showVoiceCompose: boolean
  showSecondaryRow: boolean
  showPlaybackControl: boolean
  showVoiceControl: boolean
  canSkipAhead: boolean
  isVoiceActive: boolean
  isAudioPlaying: boolean
  hasPlaybackSource: boolean
  micError: string | null
  voiceCommittedText: string
  voiceInterimText: string
  voiceStatusLabel: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  inputWrapRef: RefObject<HTMLDivElement | null>
  onSubmit: FormEventHandler<HTMLFormElement>
  onDraftChange: (value: string, el: HTMLTextAreaElement) => void
  onActivateKeyboardInput: () => void
  onActivateVoiceInput: () => void
  onStopMic: () => void
  onStartDeleteHold: () => void
  onStopDeleteHold: () => void
  onSkip: () => void
  onTogglePlayback: () => void
}

export default function ChatComposer ({
  language,
  draft,
  hasDraftContent,
  inputPlaceholder,
  keyboardEnabled,
  canType,
  isLoading,
  showVoiceCompose,
  showSecondaryRow,
  showPlaybackControl,
  showVoiceControl,
  canSkipAhead,
  isVoiceActive,
  isAudioPlaying,
  hasPlaybackSource,
  micError,
  voiceCommittedText,
  voiceInterimText,
  voiceStatusLabel,
  inputRef,
  inputWrapRef,
  onSubmit,
  onDraftChange,
  onActivateKeyboardInput,
  onActivateVoiceInput,
  onStopMic,
  onStartDeleteHold,
  onStopDeleteHold,
  onSkip,
  onTogglePlayback
}: Props) {
  return (
    <form onSubmit={onSubmit} className='mt-2 flex flex-col gap-2'>
      <label htmlFor='message' className='sr-only'>Message</label>
      {showVoiceCompose ? (
        <div className='surface-card rounded-[2rem] px-4 py-3'>
          <div className='flex items-end gap-3'>
            <button
              type='button'
              onClick={() => (isVoiceActive ? onStopMic() : onActivateVoiceInput())}
              className='flex min-w-0 flex-1 items-start gap-3 rounded-[1.5rem] bg-black/5 px-4 py-3 transition hover:bg-black/7'
            >
              <div className='flex min-w-0 flex-1 flex-col items-start gap-1 text-left'>
                <span className='flex items-center gap-2 text-sm text-black/45'>
                  <span className={`voice-status-dot ${isVoiceActive ? 'is-live' : ''}`}/>
                  {voiceStatusLabel}
                </span>
                {(voiceCommittedText || voiceInterimText) ? (
                  <span className='min-w-0 whitespace-pre-wrap break-words text-[1.7rem] leading-[1.18] text-black'>
                    {voiceCommittedText}
                    {voiceInterimText && (
                      <span className='text-black/45 italic'>
                        {voiceCommittedText ? ' ' : ''}
                        {voiceInterimText}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className='min-w-0 whitespace-pre-wrap break-words text-[1.7rem] leading-[1.18] text-black/55'>
                    {language === 'da' ? 'Tryk Tal' : 'Press Speak'}
                  </span>
                )}
              </div>
            </button>
            <button
              type='button'
              onClick={() => (isVoiceActive ? onStopMic() : onActivateVoiceInput())}
              className={`shrink-0 rounded-full px-4 py-2 text-base transition ${isVoiceActive ? 'surface-primary-action-live' : 'surface-utility text-black/70 hover:text-black'}`}
            >
              {language === 'da' ? (isVoiceActive ? 'Stop' : 'Tal') : (isVoiceActive ? 'Stop' : 'Speak')}
            </button>
            <button
              type='submit'
              disabled={isLoading || !draft.trim()}
              className='surface-primary-action shrink-0 rounded-full px-7 py-4 text-2xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
            >
              Share
            </button>
          </div>
          <div className='mt-2 px-2'>
            <button
              type='button'
              onClick={onActivateKeyboardInput}
              className='text-sm text-black/45 underline-offset-4 transition hover:text-black hover:underline'
            >
              {language === 'da' ? 'Skriv i stedet' : 'Type instead'}
            </button>
          </div>
          {micError && (
            <div className='mt-2 px-2 text-sm text-black/55'>
              {micError}
            </div>
          )}
        </div>
      ) : (
        <div className='surface-card rounded-[2rem] px-4 py-3'>
          <div className='flex items-end gap-3'>
            <div ref={inputWrapRef} className='relative flex min-w-0 flex-1 items-center' style={{ height: undefined as any }}>
              <textarea
                ref={inputRef}
                id='message'
                name='message'
                rows={1}
                value={draft}
                onChange={e => onDraftChange(e.target.value, e.currentTarget)}
                onPointerDown={(e) => {
                  if (keyboardEnabled || !canType || isLoading) return
                  e.preventDefault()
                  onActivateKeyboardInput()
                }}
                onClick={() => {
                  if (!keyboardEnabled && canType && !isLoading) onActivateKeyboardInput()
                }}
                placeholder={inputPlaceholder}
                className='w-full resize-none bg-transparent pr-12 pl-1 py-[0.95rem] text-2xl leading-[1.1] text-black placeholder:text-black/45 focus:outline-none focus:shadow-none focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-60'
                style={{ overflow: 'hidden', maxHeight: '40vh', transform: undefined as any }}
                disabled={isLoading}
                autoComplete='off'
                readOnly={!keyboardEnabled}
                inputMode={keyboardEnabled ? undefined : 'none'}
              />
              <button
                type='button'
                onMouseDown={onStartDeleteHold}
                onMouseUp={onStopDeleteHold}
                onMouseLeave={onStopDeleteHold}
                onTouchStart={(e) => { e.preventDefault(); onStartDeleteHold() }}
                onTouchEnd={onStopDeleteHold}
                onTouchCancel={onStopDeleteHold}
                disabled={!hasDraftContent}
                className='surface-delete-action absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-0'
                aria-label={language === 'da' ? 'Slet ord' : 'Delete word'}
              >
                ⌫
              </button>
            </div>
            <button
              type='submit'
              disabled={isLoading || !draft.trim()}
              className='surface-primary-action shrink-0 rounded-full px-7 py-4 text-2xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
            >
              Share
            </button>
          </div>
        </div>
      )}

      {showSecondaryRow && (
        <div className='flex flex-wrap items-center gap-2 px-1'>
          {canSkipAhead && (
            <button
              type='button'
              onClick={onSkip}
              disabled={isLoading}
              className='surface-utility rounded-full px-4 py-2 text-sm text-black/70 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
            >
              {language === 'da' ? 'Næste' : 'Next'}
            </button>
          )}
          {showPlaybackControl && (
            <button
              type='button'
              onClick={onTogglePlayback}
              disabled={!isAudioPlaying && !hasPlaybackSource}
              className='surface-utility rounded-full px-4 py-2 text-sm text-black/70 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
            >
              {isAudioPlaying
                ? (language === 'da' ? 'Stop lyd' : 'Stop audio')
                : (language === 'da' ? 'Afspil lyd' : 'Play audio')}
            </button>
          )}
          {showVoiceControl && (
            <button
              type='button'
              onClick={() => {
                if (isVoiceActive) onStopMic()
                else onActivateVoiceInput()
              }}
              className={`rounded-full px-4 py-2 text-sm transition ${keyboardEnabled ? 'bg-black text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)]' : 'surface-utility text-black/70 hover:text-black'}`}
            >
              {language === 'da' ? (isVoiceActive ? 'Stop tale' : 'Brug tale') : (isVoiceActive ? 'Stop voice' : 'Use voice')}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
