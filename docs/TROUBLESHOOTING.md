# Troubleshooting

## Stale Frontend After Deploy

Symptoms:

- old UI still appears after deploy
- model, audio, or image changes do not show up

Check:

- `public/_headers`
- whether the browser is serving cached fixed-path assets

Recommended actions:

- verify cache headers are deployed
- hard refresh once if users already cached stale media
- version public assets if they change frequently

## Chat Text Returns but Audio Does Not

Symptoms:

- `POST /api/chat` works
- no generated narration arrives

Check:

- `ELEVENLABS_API_KEY`
- TTS provider configuration
- `GET /api/chat/audio/{turnId}`
- backend logs for TTS errors

Remember:

- audio jobs are asynchronous
- they can be pending briefly before becoming ready

## Voice Input Feels Broken

Symptoms:

- microphone never starts
- browser reports permission issues
- duplicate words appear

Check:

- microphone permission in the browser
- iOS/Safari restrictions
- current `ChatPanel.tsx` speech recognition lifecycle
- whether the shared textarea still receives speech text directly

## Long Input Text Disappears

Symptoms:

- multiline text seems to vanish as it grows

Expected current behavior:

- the textarea grows naturally
- at max height it becomes internally scrollable

If that regresses, inspect:

- `src/components/ChatPanel.tsx`
- `src/components/chat/ChatComposer.tsx`

Specifically:

- avoid transform-based textarea growth
- keep the textarea in normal layout flow
- allow internal scrolling after max height

## Backend Boots but Chat Uses Fallback Replies

Symptoms:

- API responds
- every reply is a generic fallback

Check:

- `MISTRAL_API_KEY`
- `LLM_PROVIDER`
- backend startup logs
- remote model/provider errors

Also verify:

- `data/all.json` exists
- `DATA_JSON_PATH` resolves correctly in the running environment

## Admin Page Does Not Load

Check:

- `/admin` route behavior
- admin auth environment variables
- backend archive configuration

Remember:

- frontend admin UI is gated by backend route protection
- missing auth configuration can make admin access unavailable by design

## Render or Other Server Deploys Work, Vercel Backend Does Not

This is expected unless the backend is refactored.

Reason:

- the audio polling flow depends on in-memory job state
- serverless request routing does not guarantee access to the same process state
