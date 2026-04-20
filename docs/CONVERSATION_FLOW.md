# Conversation Flow

This document describes the current end-to-end conversation flow implemented in the app.
It reflects the actual code path in the frontend and backend as of now, not just the intended script.

## Main Files

- Frontend conversation controller: `src/components/ChatPanel.tsx`
- Transcript UI: `src/components/chat/ChatTranscript.tsx`
- Composer UI: `src/components/chat/ChatComposer.tsx`
- Scripted copy: `src/components/chat/config.ts`
- Frontend API client: `src/components/chat/backend.ts`
- Backend chat orchestrator: `backend/app/services/chat.py`
- Backend retrieval + prompting: `backend/chatbot.py`

## High-Level Architecture

The conversation is controlled by a single frontend state machine in `ChatPanel.tsx`.
The backend exposes one main endpoint, `POST /api/chat`, and one audio polling endpoint, `GET /api/chat/audio/{turnId}`.

The frontend is responsible for:
- deciding which kind of turn the user is currently in
- rendering transcript bubbles
- controlling microphone and keyboard input
- playing scripted MP3s
- falling back to browser TTS when needed
- deciding when to move to the next scripted prompt

The backend is responsible for:
- generating memory-confirmation replies
- generating question answers
- queuing TTS audio for generated replies
- archive logging and local session-memory storage

## Frontend State Model

`ChatPanel.tsx` uses these phases:

- `intro`
- `await_memory`
- `await_question`
- `confirm_more`

In practice, the normal flow uses:
- `intro`
- `await_memory`
- `await_question`
- `confirm_more`

The frontend also tracks these important runtime flags:

- `isLoading`: there is a pending backend response
- `isAudioPlaying`: audio or browser TTS is currently speaking
- `micDesired`: the app wants the mic on when allowed
- `isMicOn`: recognition is currently active
- `keyboardEnabled`: whether typing mode is enabled
- `hasSharedMemory`: whether the first memory turn has already happened

## Transcript Rendering

Transcript bubbles are rendered by `ChatTranscript.tsx`.

Rules:
- user messages are right-aligned
- bot messages are left-aligned
- bot text uses `whitespace-pre-wrap`, so embedded line breaks are preserved
- while `isLoading` is true, a typing bubble with three dots is shown at the bottom

Important consequence:
- the typing indicator is global, not attached to a specific message id
- it appears whenever the frontend is waiting on the backend

## Input Model

There is only one visible text input field.
Speech and typing both feed that same textarea.

Speech input behavior:
- browser speech recognition is used when available
- interim and final speech chunks are merged into the shared draft field
- recognition is suppressed while audio is playing or while a backend response is loading
- the app restarts recognition automatically when it is still the user's turn

Typing behavior:
- keyboard mode is opt-in via the button below the input
- when keyboard mode is active, the same textarea accepts typed text
- switching back to voice disables keyboard mode and re-enables mic flow if supported

## Startup Flow

### 1. Language selected
The parent screen passes `language` into `ChatPanel`.
This resets session-local refs such as request abort controllers, replay state, and the session id.

### 2. Scripted audio preload begins
`ChatPanel.tsx` preloads these language-specific files:
- `WELCOME`
- `MEMORY_1`
- `QUESTION_1`
- `QUESTION_2`
- `FAREWELL`
- `THANK_YOU`

Only `WELCOME` and `MEMORY_1` block the `introAssetsReady` flag.
The remaining files preload in the background.

### 3. Intro start gating
The intro starts when either:
- preloaded intro assets are ready and the minimum intro delay has passed, or
- the fallback max wait timer fires

On iOS, the app waits for a first user gesture so audio unlock can happen before intro playback begins.

### 4. Welcome message appears
Frontend actions:
- add bot message with `scripts[language].welcome`
- play `/audio/{language}_WELCOME.mp3`

### 5. Memory prompt appears
After welcome audio ends:
- add bot message with `scripts[language].memory1`
- play `/audio/{language}_MEMORY_1.mp3`

When `MEMORY_1` audio ends:
- phase becomes `await_memory`
- `micDesired` becomes `true`
- user can now speak or type

## Turn Submission Overview

Every submit goes through `submit()` in `ChatPanel.tsx`.

Common steps:
1. stop any active mic session
2. add the user's text as a user bubble
3. clear draft and speech buffers
4. set `isLoading = true`
5. decide which mode to use

The frontend then routes the turn into one of two backend modes:
- `memory`
- `question`

## Mode Selection Rules

### Normal first memory stage
If phase is `await_memory`, the next user turn is treated as `memory`.

### Normal question stage
If phase is `await_question`, the next user turn is treated as `question`.

### Confirm-more stage
If phase is `confirm_more`, the frontend uses local question detection before choosing a backend mode.

Rules in `confirm_more`:
- if the input looks like a question, it goes to `question`
- otherwise it is treated as a new `memory`

Question detection is heuristic.
It checks for `?` and common question-start words per language.

## Memory Turn Flow

This is the most complex path because it combines scripted thank-you audio, generated confirmation text, and generated TTS audio.

### 1. Frontend sends memory request
Frontend sends:
- `mode: "memory"`
- current message
- session id
- language
- recent history

### 2. Thank-you audio starts immediately
While the backend request is already running, the frontend plays:
- `/audio/{language}_THANK_YOU.mp3`

During this period:
- `isLoading` stays `true`
- the typing indicator remains visible
- no bot message has been added yet

### 3. Frontend waits for backend confirmation
After the thank-you audio finishes, the frontend waits on the memory request result.

There is a hard timeout of 12 seconds.
If the backend does not respond in time, the frontend falls back to a local sentence:
- English: `Your memory now becomes part of the continuOnus landscape.`
- Danish: `Dit minde bliver nu en del af continuOnus-landskabet.`

### 4. Frontend creates one final combined bot message
The frontend adds one bot bubble only, with this exact structure:

English:
```text
Thank you for sharing.

Your memory ...
```

Danish:
```text
Tak fordi du delte.

Dit minde ...
```

This is intentionally a single combined message, not two separate bubbles.

### 5. Generated confirmation audio plays
If the backend returned generated TTS audio:
- frontend polls `GET /api/chat/audio/{turnId}` until audio is ready
- when ready, it plays that generated audio

If generated audio is unavailable:
- frontend uses browser TTS for the generated confirmation sentence only

Important detail:
- the thank-you line is spoken by the scripted `THANK_YOU.mp3`
- the generated similarity/confirmation sentence is spoken by generated TTS or browser TTS

### 6. Question Prompt 1 begins
After the generated confirmation audio ends:
- add bot message with `scripts[language].question1`
- play `/audio/{language}_QUESTION_1.mp3`

When `QUESTION_1` audio ends:
- phase becomes `await_question`
- `micDesired` becomes `true`

## Backend Memory Mode

This is handled by `ChatService.chat(..., mode='memory')` in `backend/app/services/chat.py`.

### Backend steps
1. call `ChatBot.memory_confirmation(message, language, 2)`
2. retrieve up to 2 relevant documents from the corpus
3. build a dedicated memory-confirmation prompt
4. ask the LLM for a short confirmation reply
5. sanitize the returned text
6. queue TTS audio for that reply
7. persist archive data in the background
8. store local session memory in the background
9. return:
   - `message`
   - `audio_turn_id`
   - debug timing info

### Prompting rules
The memory-confirmation prompt requires:
- 2 to 3 sentences
- clear, plain language
- 1 to 2 references only
- no names
- required prefix style

Prefix rules currently enforced:
- English: starts with `Your memory reminds us of` or `Your memory is similar to`
- Danish: starts with `Dit minde minder os om` or `Dit minde ligner`

### Fallbacks
If retrieval returns nothing, the backend returns a generic memory-confirmation sentence.
If the generated text is empty after sanitization, the backend falls back to a quote-based reply from the first retrieved document.

## Question Turn Flow

### 1. Frontend sends question request
Frontend sends:
- `mode: "question"`
- current message
- session id
- language
- recent history

### 2. Backend generates question answer
Backend path:
- `ChatService.chat(..., mode='question')`
- calls `ChatBot.pipeline(...)`
- retrieves corpus context and optionally prior interaction context
- generates a concise answer
- queues TTS audio
- persists archive data
- schedules local session memory storage

### 3. Frontend shows answer bubble
When the backend response returns:
- sanitize the answer text
- add a bot bubble with the answer text

### 4. Frontend plays generated answer audio
If generated audio is available:
- poll `GET /api/chat/audio/{turnId}`
- play the resolved audio blob

If not:
- use browser TTS for the answer text

### 5. Question Prompt 2 begins
After the answer audio ends:
- add bot message with `scripts[language].question2`
- play `/audio/{language}_QUESTION_2.mp3`

`QUESTION_2` is the post-answer reprompt. It asks the user whether they want to ask something else or share another memory, and reminds them that they can end the session with the Return/Tilbage button.

When `QUESTION_2` audio ends:
- phase becomes `confirm_more`
- `micDesired` becomes `true`

## Confirm-More Flow

This is the post-answer continuation stage.
The app allows the user to:
- ask another question
- share another memory
- end the session manually with the top-right Return/Tilbage button

There is no backend handoff classifier in this stage anymore.

### Path A: real question
If the text looks like a question:
- frontend routes directly into the normal `question` flow

### Path B: new memory
If the text does not look like a question:
- frontend routes directly into the normal `memory` flow

## Farewell / End of Session

There are two end paths.

### 1. Return button before first shared memory
Before the visitor has shared their first memory, the top-right Return/Tilbage button exits immediately through the parent screen transition.

### 2. Return button after first shared memory
After the visitor has shared at least one memory, the top-right Return/Tilbage button triggers the scripted exit path inside `ChatPanel.tsx`:
1. stop any current mic/audio/backend turn work
2. add the farewell text bubble
3. play `/audio/{language}_FAREWELL.mp3`
4. call `onExitSession()`
5. parent transitions back to language selection

## Audio Behavior

There are two playback systems.

### Scripted MP3 playback
Used for:
- welcome
- memory prompt
- thank-you
- question prompt 1
- question prompt 2
- farewell

Handled by `playAudio()`.

Effects:
- stops mic first
- marks `isAudioPlaying = true`
- on end, can re-enable mic if requested
- supports skip/advance behavior

### Browser TTS fallback
Used when generated backend audio cannot be resolved.

Handled by `speakBrowserTTS()`.

Before speaking:
- sanitize markdown markers and formatting
- stop mic
- set playback state

During speech:
- optional auto-scroll can follow current message progress

After speech:
- playback state clears
- next callback in the scripted flow runs

## Backend Audio Queue

Generated replies do not return audio bytes inline.
Instead:
1. backend queues TTS work and returns `audio_turn_id`
2. frontend polls `GET /api/chat/audio/{turnId}`
3. endpoint returns `202` while pending
4. endpoint returns audio bytes once ready
5. frontend creates a blob URL and plays it

The backend stores these audio jobs in in-memory process state.
That means the current deployment model assumes a single long-running backend instance.

## Failure Handling

### Frontend request failure
If a request throws outside `AbortError`:
- add fallback error bubble
- English: `Something went wrong. Please try again.`
- Danish: `Noget gik galt. Prøv igen.`

### Empty question answer
If question mode returns no usable `message`:
- add fallback answer bubble
- keep phase at `await_question`
- re-enable mic so the user can try again

### Memory timeout
If memory mode takes too long on the frontend:
- after 12 seconds, use a local fallback memory-confirmation sentence
- still add the combined bot message
- continue the flow into Question Prompt 1

### Generated audio unavailable
If backend TTS never resolves or fails:
- browser TTS speaks the same sanitized text instead

## Step-by-Step Example: First Visit

1. User selects language.
2. Intro assets preload.
3. Welcome bubble appears.
4. Welcome MP3 plays.
5. Memory prompt bubble appears.
6. Memory prompt MP3 plays.
7. App enters `await_memory` and enables input.
8. User shares a memory.
9. User bubble is added.
10. App starts backend `memory` request and sets typing indicator.
11. App plays scripted thank-you MP3.
12. Backend generates memory confirmation and queues TTS.
13. App adds one combined bot bubble:
    - thank-you line
    - blank line
    - generated memory confirmation
14. App plays generated confirmation audio or browser TTS.
15. App adds Question Prompt 1 bubble.
16. App plays Question Prompt 1 MP3.
17. App enters `await_question` and enables input.
18. User asks a question.
19. User bubble is added.
20. App sends backend `question` request and shows typing indicator.
21. Backend returns answer text and queued audio.
22. App adds answer bubble.
23. App plays generated answer audio or browser TTS.
24. App adds Question Prompt 2 bubble.
25. App plays Question Prompt 2 MP3.
26. App enters `confirm_more`.
27. User either:
    - asks another question
    - shares another memory
    - or uses the Return/Tilbage button to end manually
28. If Return/Tilbage is pressed after the visitor has shared their first memory, the farewell MP3 plays.
29. Session resets back to language selection after the farewell completes.

## Current Implementation Notes

These are important for future maintenance:

- `updateMessage()` still exists in `ChatPanel.tsx`, but the current memory flow now adds one final combined message directly instead of progressively updating an earlier placeholder.
- `isLoading` is the only thing driving the typing indicator right now.
- The backend memory-confirmation audio job store is in memory, so horizontal scaling or serverless deployment would break the current polling model.
- Scripted MP3 text must be regenerated manually if `src/components/chat/config.ts` changes and you want spoken prompts to match the on-screen script.
