# Deployment

## Recommended Deployment Split

Use:

- a static host for the frontend
- a long-running service for the backend

Recommended combinations:

- Vercel frontend + Render backend
- Render Static Site frontend + Render Web Service backend
- VM + reverse proxy for both

## Why the Backend Should Stay Long-Running

The backend currently relies on in-memory audio job state.

That matters because:

- `POST /api/chat` can return before TTS is complete
- the frontend then polls `GET /api/chat/audio/{turnId}`
- the job lives in process memory until it is ready or expires

This is a poor fit for stateless serverless backends.

## Frontend Build

Commands:

```bash
npm install
npm run build
```

The production output directory is:

- `dist`

## Backend Build

The repository already includes a backend Dockerfile at `backend/Dockerfile`.

Build shape:

- Python 3.11 slim image
- install `backend/requirements.txt`
- copy `backend/`
- copy `data/`
- run Uvicorn on port `8000`

## Render

Recommended layout:

- backend as a Render Web Service using `backend/Dockerfile`
- frontend as a Render Static Site serving `dist`

Backend health check:

- `/health`

Frontend environment:

- `VITE_API_BASE=https://your-backend-host`

## Vercel

Frontend-only use is fine.

Recommended settings:

- Framework: Vite
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

If Vercel fronts only the frontend, use either:

- `VITE_API_BASE`
- a rewrite from `/api/*` to the backend host

Do not assume the current backend will behave correctly on Vercel serverless functions without refactoring the audio job flow.

## Single-Host / VM

A simple VM deployment is still valid.

Typical shape:

- backend container or Uvicorn process
- frontend static files
- Caddy or Nginx as reverse proxy

This is the easiest way to preserve the current runtime behavior without host-specific adaptation.

## Environment Variables

Core backend variables:

- `LLM_PROVIDER=mistral`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`
- `TTS_PROVIDER=elevenlabs`
- `ELEVENLABS_API_KEY`
- `VOICE_ID`
- `MODEL_ID`
- `RETRIEVER_PROVIDER=local`
- `DATA_JSON_PATH=data/all.json`
- `API_ALLOW_ORIGINS`

Frontend variable:

- `VITE_API_BASE`

Optional:

- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ENTRIES_SOURCE_URL`
- `SYNC_ENTRIES_ON_STARTUP`

## Cache Behavior

The repository includes `public/_headers` to control browser caching.

Current intent:

- `index.html` should not be cached aggressively
- hashed frontend assets can be cached long-term
- fixed-path public media should revalidate

This matters because media files under stable paths can otherwise stay stale after deploys.

## Deployment Checklist

Before shipping:

- `npm run build` succeeds
- backend boots with production environment values
- `/health` responds
- `POST /api/chat` returns text
- `GET /api/chat/audio/{turnId}` resolves a generated clip
- admin auth works if enabled
- frontend can reach the backend origin
- one hard refresh is not required for every new deploy
