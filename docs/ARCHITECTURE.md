# Architecture

## Overview

Carte de Continuonus is a two-part application:

- A Vite + React frontend for the public experience and admin UI.
- A FastAPI backend for chat orchestration, TTS, archive access, and optional dataset sync.

The default runtime model is:

- Frontend served by Vite in development.
- Backend served by Uvicorn in development.
- Local retrieval from `data/all.json`.
- Mistral as the default LLM provider.
- ElevenLabs as the default TTS provider.

## System Shape

```text
Browser
  -> React app
    -> /api/chat
    -> /api/chat/audio/{turnId}
    -> /api/admin/*

FastAPI backend
  -> ChatService
    -> ChatBot
      -> local corpus retrieval from data/all.json
      -> optional Pinecone retrieval
      -> LLM provider
    -> TTS service
    -> archive store
```

## Frontend Runtime

The frontend entry point is `src/main.tsx`.

Key behavior:

- Initializes background music once at app startup.
- Chooses the UI by pathname:
  - `/admin` renders the admin page.
  - everything else renders the public home flow.

The public experience lives primarily in:

- `src/pages/Home.tsx`
- `src/components/ChatPanel.tsx`
- `src/map/Canvas.tsx`
- `src/map/SplashHippoCanvas.tsx`

High-level phases:

- `splash`
- `chat`
- `returning`

The map and splash canvases are visual state, while the chat panel manages:

- intro playback
- memory capture
- question turns
- voice input
- generated audio polling and playback
- browser speech fallback

## Backend Runtime

The FastAPI app entry point is `backend/app/__init__.py`.

Startup behavior:

- create the FastAPI app
- configure CORS from environment settings
- mount API routers
- initialize the archive database
- optionally sync dataset entries from `ENTRIES_SOURCE_URL`
- clear the cached chat service if entries were refreshed
- serve `dist/` if a frontend build exists

## Chat Request Flow

The primary chat route is `POST /api/chat`.

Modes:

- `memory`
- `question`

`memory` mode:

- returns quickly with a thank-you message
- persists archive data and local session memory off the critical path

`question` mode:

- runs the retrieval + prompt + LLM pipeline
- persists archive data
- queues TTS generation
- returns text immediately and an `audioTurnId` if audio is being generated

Generated audio is fetched separately from:

- `GET /api/chat/audio/{turn_id}`

Important constraint:

- pending audio jobs are stored in memory inside `ChatService`
- this works well on a single long-running backend instance
- it is not a good fit for stateless serverless backends

## Retrieval Model

The default retriever is `local`.

In local mode:

- `backend/chatbot.py` loads `data/all.json`
- corpus entries are tokenized and deduplicated
- retrieval uses lightweight token scoring
- chat interaction documents also stay in process memory unless Pinecone is enabled

Optional Pinecone mode exists, but the repository is currently optimized to run without it.

## Data and Persistence

Primary data sources:

- `data/all.json` for the public corpus
- optional archive database for saved conversation turns

Persistence layers:

- archive persistence is optional and driven by `DATABASE_URL`
- chat retrieval context is process-local

Operational implication:

- archive data can be durable
- local chat retrieval context is not durable across process restarts

## Deployment Shape

This repository supports several deployment shapes, but the most practical split is:

- static frontend on Vercel or Render Static Site
- long-running backend on Render, Railway, Fly.io, or a VM

Reason:

- the audio polling flow depends on in-memory job state
- the backend startup path includes initialization and optional sync work

See `docs/DEPLOYMENT.md` for the deployment guidance.
