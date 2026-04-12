# Claude Guide

## Goal

Provide repository-specific operating context for Claude or similar agents working on this codebase.

## System Assumptions

- The frontend and backend are tightly coupled around chat and generated audio.
- The backend is expected to be long-running.
- Local retrieval from `data/all.json` is the default operating mode.
- Mistral and ElevenLabs are the default providers unless explicitly changed.

## Files That Matter Most

- `src/pages/Home.tsx`
- `src/components/ChatPanel.tsx`
- `src/components/chat/ChatComposer.tsx`
- `backend/app/services/chat.py`
- `backend/chatbot.py`
- `backend/app/settings.py`

## Editing Guidance

- Keep documentation aligned with code, not with assumptions from old deploy plans.
- When touching chat interaction behavior, account for both typing and voice input.
- When touching TTS, account for the async audio polling endpoint.
- When touching deployment docs, call out that Vercel is frontend-friendly but backend-unfriendly in the current architecture.

## Good Verification Targets

- frontend build succeeds
- backend can start with configured environment variables
- chat text returns before audio when TTS is enabled
- long input still renders correctly on touch devices

## Documentation Priority

If documentation must be updated, prefer:

1. root `README.md` for orientation
2. `docs/` files for architecture and operational detail
3. `.config/` files for agent workflow notes
