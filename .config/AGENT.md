# Agent Guide

## Purpose

This folder documents repository-specific guidance for AI coding agents and human maintainers.

These files are not application runtime configuration. They are workflow documentation meant to reduce avoidable mistakes when editing this codebase.

## Repository Summary

- Frontend: Vite + React
- Backend: FastAPI
- Default retriever: local `data/all.json`
- Default LLM: Mistral
- Default TTS: ElevenLabs

## High-Risk Areas

- `src/components/ChatPanel.tsx`
- `src/pages/Home.tsx`
- `backend/app/services/chat.py`
- `backend/chatbot.py`

These files contain the most stateful or behaviorally sensitive logic.

## Working Rules

- Prefer small, targeted changes over broad rewrites.
- Preserve the shared voice/text composer model unless explicitly changing interaction design.
- Do not break the two-step chat-audio flow without updating both backend and frontend.
- Treat iPad Safari behavior as a first-class constraint for input and audio work.
- Treat stable-path public assets as cache-sensitive.

## Required Verification After Functional Changes

- `npm run build`
- backend import/startup sanity
- if chat behavior changed: test `/api/chat`
- if audio behavior changed: test `/api/chat/audio/{turnId}`
- if input behavior changed: test long multiline input and voice/keyboard switching

## Deployment Constraint

Do not document or implement the current backend as if it were safely serverless.

The in-memory audio job flow makes a long-running backend the default assumption.

## Documentation Map

- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/BACKEND.md`
- `docs/DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`
