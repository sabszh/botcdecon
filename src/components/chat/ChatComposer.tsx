import type { FormEventHandler, RefObject } from 'react'
import type { Language } from './types'

type Props = {
  language: Language
  draft: string
  hasDraftContent: boolean
  inputPlaceholder: string
  keyboardEnabled: boolean
  canType: boolean
  isSpeechSupported: boolean
  isLoading: boolean
  showSecondaryRow: boolean
  showPlaybackControl: boolean
  canSkipAhead: boolean
  isVoiceActive: boolean
  isAudioPlaying: boolean
  hasPlaybackSource: boolean
  showFollow: boolean
  micError: string | null
  voiceStatusLabel: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit: FormEventHandler<HTMLFormElement>
  onDraftChange: (value: string, el: HTMLTextAreaElement) => void
  onActivateKeyboardInput: () => void
  onActivateVoiceInput: () => void
  onStopMic: () => void
  onStartDeleteHold: () => void
  onStopDeleteHold: () => void
  onFollowLatest: () => void
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
  isSpeechSupported,
  isLoading,
  showSecondaryRow,
  showPlaybackControl,
  canSkipAhead,
  isVoiceActive,
  isAudioPlaying,
  hasPlaybackSource,
  showFollow,
  micError,
  voiceStatusLabel,
  inputRef,
  onSubmit,
  onDraftChange,
  onActivateKeyboardInput,
  onActivateVoiceInput,
  onStopMic,
  onStartDeleteHold,
  onStopDeleteHold,
  onFollowLatest,
  onSkip,
  onTogglePlayback
}: Props) {
  return (
    <form onSubmit={onSubmit} className='relative z-10 -mt-[30px] flex flex-col gap-2'>
      <label htmlFor='message' className='sr-only'>Message</label>
      <div className='surface-card relative rounded-[2rem] px-4 py-3'>
        <div className='relative flex items-end gap-3'>
          <div className='relative flex min-w-0 flex-1 items-end gap-2'>
            <textarea
              ref={inputRef}
              id='message'
              name='message'
              rows={1}
              value={draft}
              onChange={e => onDraftChange(e.target.value, e.currentTarget)}
              placeholder={inputPlaceholder}
              className='w-full resize-none bg-transparent pr-2 pl-1 py-[0.95rem] text-2xl leading-[1.1] text-black placeholder:text-black/45 focus:outline-none focus:shadow-none focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-60'
              style={{ overflowY: 'hidden', maxHeight: '40vh' }}
              disabled={isLoading}
              autoComplete='off'
              readOnly={!keyboardEnabled}
              inputMode={keyboardEnabled ? undefined : 'none'}
            />
            <button
              type='button'
              onPointerDown={(e) => {
                e.preventDefault()
                onStartDeleteHold()
              }}
              onPointerUp={onStopDeleteHold}
              onPointerCancel={onStopDeleteHold}
              onPointerLeave={onStopDeleteHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!hasDraftContent}
              className='surface-delete-action shrink-0 select-none rounded-full h-14 w-14 grid place-items-center text-[1.5rem] leading-none font-medium transition duration-150 hover:scale-[1.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100'
              style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
              aria-label={language === 'da' ? 'Slet ord' : 'Delete word'}
            >
              ⌫
            </button>
          </div>
          <div className='relative flex shrink-0 items-end justify-center self-stretch'>
            {showFollow && (
              <button
                type='button'
                className='surface-pill absolute bottom-full left-1/2 z-20 mb-5 inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full text-2xl leading-none text-black transition hover:bg-white hover:text-black'
                onClick={onFollowLatest}
                aria-label={language === 'da' ? 'Følg bund' : 'Jump to latest'}
                title={language === 'da' ? 'Følg bund' : 'Jump to latest'}
              >
                ↓
              </button>
            )}
            <button
              type='submit'
              disabled={isLoading || !draft.trim()}
              className='surface-primary-action shrink-0 rounded-full px-7 py-4 text-2xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
            >
              {language === 'da' ? 'Del' : 'Share'}
            </button>
          </div>
        </div>
        {canType && (
          <div className='mt-2 flex flex-wrap items-center gap-3 px-1'>
            {isSpeechSupported && !keyboardEnabled && (
              <span className='flex items-center gap-2 text-sm text-black/45'>
                <span className={`voice-status-dot ${isVoiceActive ? 'is-live' : ''}`}/>
                {voiceStatusLabel}
              </span>
            )}
            {(!keyboardEnabled || isSpeechSupported) && (
              <button
                type='button'
                onClick={() => {
                  if (keyboardEnabled) onActivateVoiceInput()
                  else onActivateKeyboardInput()
                }}
                disabled={!canType || isLoading}
                className='text-sm text-black/52 underline-offset-4 transition hover:text-black hover:underline disabled:cursor-not-allowed disabled:opacity-45'
              >
                {keyboardEnabled
                  ? (language === 'da' ? 'Brug tale i stedet' : 'Use voice instead')
                  : (language === 'da' ? 'Aktivér tastatur' : 'Enable keyboard')}
              </button>
            )}
          </div>
        )}
        {micError && (
          <div className='mt-2 px-2 text-sm text-black/55'>
            {micError}
          </div>
        )}
      </div>

      {showSecondaryRow && (
        <div className='flex flex-wrap items-center gap-2 px-1'>
          {canSkipAhead && (
            <button
              type='button'
              onClick={onSkip}
              disabled={isLoading}
              className='surface-utility rounded-full px-4 py-2 text-xl leading-none text-black/70 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
              aria-label={isAudioPlaying
                ? (language === 'da' ? 'Spring over' : 'Skip')
                : (language === 'da' ? 'Næste' : 'Next')}
              title={isAudioPlaying
                ? (language === 'da' ? 'Spring over' : 'Skip')
                : (language === 'da' ? 'Næste' : 'Next')}
            >
              →
            </button>
          )}
          {showPlaybackControl && (
            <button
              type='button'
              onClick={onTogglePlayback}
              disabled={!isAudioPlaying && !hasPlaybackSource}
              className='surface-utility rounded-full px-4 py-2 text-xl leading-none text-black/70 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
              aria-label={isAudioPlaying
                ? (language === 'da' ? 'Stop lyd' : 'Stop audio')
                : (language === 'da' ? 'Afspil lyd' : 'Play audio')}
              title={isAudioPlaying
                ? (language === 'da' ? 'Stop lyd' : 'Stop audio')
                : (language === 'da' ? 'Afspil lyd' : 'Play audio')}
            >
              {isAudioPlaying
                ? '■'
                : '▶'}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
