# Frontend

## Purpose

The frontend delivers two experiences:

- the public installation experience
- the admin transcript viewer

The app is route-light by design. Path inspection in `src/main.tsx` determines whether to render `Home` or `AdminPage`.

## Main Entry Points

- `src/main.tsx`
- `src/pages/Home.tsx`
- `src/pages/Admin.tsx`
- `src/components/ChatPanel.tsx`

## Public Experience Flow

`src/pages/Home.tsx` is the shell for the installation flow.

Responsibilities:

- language selection
- splash-to-chat transition
- iOS audio unlock handling
- background music coordination
- inactivity reset
- map mounting strategy

Important UI states:

- splash introduction
- active chat
- returning state

## Chat Panel

`src/components/ChatPanel.tsx` is the most complex frontend file.

Responsibilities:

- intro narration sequencing
- chat transcript state
- textarea draft state
- speech recognition lifecycle
- generated audio polling and playback
- browser speech fallback
- delete-word control
- scroll follow behavior
- mode transitions between memory, question, and follow-up states

Because this file is central and stateful, it is the first place to inspect when behavior changes in:

- voice input
- playback
- intro timing
- message sequencing

## Chat Subcomponents

The lower-level chat UI is split under `src/components/chat/`.

Important files:

- `ChatComposer.tsx` for the shared voice/text input area
- `ChatTranscript.tsx` for transcript rendering
- `backend.ts` for chat API requests
- `config.ts` for script constants and speech timings
- `helpers.ts` for history/session helpers
- `types.ts` for chat types

Current input model:

- speech and typing share the same textarea
- the keyboard is opt-in
- voice state is shown subtly below the field

## 3D and Visual Layer

Map and 3D visuals live under `src/map/`.

Important files:

- `Canvas.tsx`
- `PlaneMesh.tsx`
- `ObjectMesh.tsx`
- `SplashHippoCanvas.tsx`

Current design intent:

- keep the installation visually ambient
- use the hippocampus model as the primary 3D focal point
- maintain restrained camera movement during the chat phase

Performance-relevant details:

- the optimized model asset should be used instead of the large source model
- map and scene behavior should stay reasonable on iPad-class hardware

## Audio

Frontend audio behavior spans:

- background music in `src/lib/music.ts`
- generated narration playback in `ChatPanel.tsx`
- audio preloading and caching in `src/lib/audioCache.ts`

Important detail:

- chat turns may return text before audio is ready
- the frontend must poll the audio route and handle pending states cleanly

## API Integration

Frontend API URL resolution is handled in `src/lib/api.ts`.

Expected usage:

- same-origin `/api/*` when frontend and backend are behind a rewrite or reverse proxy
- `VITE_API_BASE` when running separate origins in development or split hosting

## Frontend Commands

Install:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Frontend Maintenance Notes

When changing the public experience, check:

- typing and voice still use the same input field
- long textarea content remains visible and scrolls correctly
- iPad Safari still handles keyboard activation and touch scrolling
- intro playback does not start twice after language changes
- background music does not block narration or input
