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

## Secure Local Development

If you need browser microphone access from a non-localhost device, run the frontend over HTTPS.

Recommended local setup:

1. Generate certs with `mkcert`.
2. Save them as `.certs/dev-cert.pem` and `.certs/dev-key.pem` in the repo root.
3. Start the frontend with `npm run dev`.

The Vite config will:

- serve the dev server over HTTPS when the cert files are present
- proxy `/api` calls to `http://127.0.0.1:8000`
- keep the browser on a secure origin so `getUserMedia()` can prompt for microphone access

Example cert command on Windows:

```powershell
mkcert -key-file .certs/dev-key.pem -cert-file .certs/dev-cert.pem localhost 127.0.0.1 192.168.0.6
```

If another device opens the site, it must trust the same local CA or the page will still be considered untrusted by the browser.

## Backend Build

The repository includes a production Dockerfile at `backend/Dockerfile`.

Build shape:

- multi-stage build
- Node 20 stage builds the Vite frontend into `dist/`
- Python 3.11 slim stage installs `backend/requirements.txt`
- copies `backend/`, `data/`, and built `dist/`
- runs Uvicorn on port `8000`

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

The repo is now set up for a simple Hetzner-style VM deployment with Docker Compose.

Typical shape:

- `docker-compose.yml` starts Postgres and one production app container
- the app container serves both the frontend `dist/` build and the FastAPI backend
- Caddy or Nginx sits in front and terminates TLS

This preserves the current runtime behavior with the least operational complexity.

## Environment Variables

Core backend variables:

- `LLM_PROVIDER=mistral`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`
- `TTS_PROVIDER=elevenlabs`
- `ELEVENLABS_API_KEY`
- `VOICE_ID`
- `MODEL_ID`
- `DATA_JSON_PATH=data/all.json`
- `API_ALLOW_ORIGINS`

Frontend variable:

- `VITE_API_BASE` only if you are hosting frontend and backend on different origins

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

## Compose Files

- `docker-compose.yml`: production
- `docker-compose.dev.yml`: local development with bind mounts, backend reload, and Vite dev server

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
- Postgres persists across container restarts
