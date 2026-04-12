## Carte de Continuonus

This project has:
- A Vite frontend.
- A FastAPI backend.
- Local retrieval by default (no Pinecone required) using `data/all.json`.

## Documentation

Primary documentation:

- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/BACKEND.md`
- `docs/DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`

Agent-facing repository guidance:

- `.config/AGENT.md`
- `.config/CODEX.md`
- `.config/CLAUDE.md`

## Environment Variables

Frontend:
- `VITE_API_BASE` backend base URL, for example `http://127.0.0.1:8000`.

Backend:
- `LLM_PROVIDER` default `mistral`.
- `MISTRAL_API_KEY` required for Mistral.
- `MISTRAL_MODEL` optional, default `mistral-small-latest`.
- `HUGGINGFACE_API_KEY` optional fallback if you explicitly switch to HuggingFace.
- `LLM_REPO_ID` optional HuggingFace text-generation fallback model id.
- `RETRIEVER_PROVIDER` default `local`.
- `DATA_JSON_PATH` default `data/all.json`.
- `TTS_PROVIDER` default `elevenlabs`.
- `ELEVENLABS_API_KEY` required for ElevenLabs TTS.
- `VOICE_ID` optional ElevenLabs voice id.
- `MODEL_ID` optional ElevenLabs model id.

Optional Pinecone mode:
- `RETRIEVER_PROVIDER=pinecone`
- `PINECONE_API_KEY`
- `INDEX_NAME_BOT`
- `INDEX_NAME_CHAT`
- `PINECONE_CLOUD`
- `PINECONE_REGION`

## Repository Structure

Important paths:

- `src/` frontend application
- `src/components/chat/` chat UI building blocks
- `src/map/` 3D and map rendering
- `backend/app/` FastAPI app, routes, and services
- `backend/chatbot.py` retrieval and prompt pipeline
- `data/all.json` local corpus
- `public/` stable-path media assets
- `docs/` repository documentation
- `.config/` agent workflow documentation

## Local Run (No Docker)

1. Install dependencies:

```bash
npm install
pip install -r backend/requirements.txt
```

2. Create `.env` in the project root, for example:

```env
VITE_API_BASE=http://127.0.0.1:8000

RETRIEVER_PROVIDER=local
DATA_JSON_PATH=data/all.json

LLM_PROVIDER=mistral
MISTRAL_API_KEY=your_key_here
MISTRAL_MODEL=mistral-small-latest

TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_key_here
```

3. Start backend:

```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

4. Start frontend in another terminal:

```bash
npm run dev
```

Notes:

- the frontend expects the backend at `VITE_API_BASE` unless you use same-origin proxying
- the backend defaults to `LLM_PROVIDER=mistral`
- generated audio is asynchronous and fetched through the audio polling endpoint

## Local Run (Docker Compose)

Backend only:

```bash
docker compose up --build
```

Backend + frontend dev server:

```bash
docker compose --profile dev up --build
```

## Chat Audio API

- `POST /api/chat` returns text quickly and may include `audioTurnId` with `audioStatus="pending"`.
- Fetch generated audio via `GET /api/chat/audio/{audioTurnId}`:
- `202` while pending.
- `200` with `audio/mpeg` when ready.

Operational note:

- pending audio jobs are stored in backend process memory, so the current backend is intended for a long-running service rather than serverless execution

## Hetzner Deployment (Single VM)

Recommended baseline:
- One Hetzner VM.
- Docker + Docker Compose.
- Caddy or Nginx as reverse proxy with TLS.

Steps:
1. Copy repository and `.env` to server.
2. Keep `RETRIEVER_PROVIDER=local` and `DATA_JSON_PATH=data/all.json`.
3. Start services with `docker compose up --build -d`.
4. Put Caddy/Nginx in front of backend/frontend.

Backups:
- `.env`
- `data/all.json`
- any persistent volumes you add later (e.g., Postgres/Qdrant).
