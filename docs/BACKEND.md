# Backend

## Purpose

The backend provides:

- the chat API
- generated audio delivery
- admin archive endpoints
- health checks
- startup initialization

The backend entry point is `backend/app/__init__.py`.

## Application Structure

Core files:

- `backend/app/__init__.py`
- `backend/app/settings.py`
- `backend/app/routes/chat.py`
- `backend/app/routes/admin.py`
- `backend/app/routes/health.py`
- `backend/app/services/chat.py`
- `backend/chatbot.py`

## Configuration

Configuration is centralized in `backend/app/settings.py`.

Important environment variables:

- `LLM_PROVIDER`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`
- `HUGGINGFACE_API_KEY`
- `DATA_JSON_PATH`
- `ENTRIES_SOURCE_URL`
- `SYNC_ENTRIES_ON_STARTUP`
- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ELEVENLABS_API_KEY`
- `VOICE_ID`
- `MODEL_ID`
- `API_ALLOW_ORIGINS`

Defaults are intentionally geared toward local retrieval with Mistral and ElevenLabs.

## Startup Behavior

On application startup, the backend:

- initializes archive storage
- optionally syncs entries from the remote source
- clears the cached chat service if the dataset changed

This means the chatbot service can pick up refreshed source data without a full process restart when sync succeeds during startup.

## Routes

### Health

- `GET /health`

Use this for service monitoring and deployment health checks.

### Chat

- `POST /api/chat`
- `GET /api/chat/audio/{turn_id}`

Chat requests accept:

- session id
- message
- language
- user metadata
- mode
- history
- optional continuous data

### Admin

- `GET /api/admin/chat-sessions`
- `GET /api/admin/chat-sessions/{session_id}`

These endpoints are intended for transcript inspection and depend on admin auth configuration.

## Chat Service

`backend/app/services/chat.py` is the orchestration layer.

Responsibilities:

- initialize `ChatBot`
- initialize the TTS provider
- run question/memory/handoff flows
- persist archive turns
- queue background TTS jobs
- expose in-memory audio job lookup

Modes:

- `memory` returns immediately and persists off-path
- `question` runs the full chatbot pipeline
- `handoff` classifies whether the conversation should continue or return

## Audio Job Model

Generated audio jobs are stored in memory in `ChatService`.

Behavior:

- each turn gets a temporary audio job id
- TTS generation runs in the background
- the frontend polls until the audio job is ready or fails
- completed jobs expire after a TTL

Implications:

- simple and fast on a single process
- not durable
- not safe to assume across serverless instances

## ChatBot

`backend/chatbot.py` contains retrieval, prompt construction, and LLM interaction.

Local retrieval behavior:

- load and deduplicate entries from `data/all.json`
- tokenize entries
- score candidate documents against the user query
- build sourced prompts from the best matching entries

Session memory is stored in process memory and local corpus retrieval always reads from `DATA_JSON_PATH`.

## TTS

TTS is abstracted through backend services and currently defaults to ElevenLabs.

Flow:

- text response is generated first
- TTS is queued second
- audio is retrieved through the audio polling endpoint

This keeps perceived response time lower, but it means the frontend must handle a pending audio phase correctly.

## Archive and Admin

Archive support is optional.

When enabled, the backend can persist:

- session id
- language
- user metadata
- mode
- user message
- bot message
- error state
- continuous data

The admin frontend reads from the protected admin routes, not directly from storage.

## Local Backend Run

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Run:

```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

## Maintenance Notes

When changing backend behavior, verify:

- `/health`
- `POST /api/chat`
- `GET /api/chat/audio/{turnId}`
- admin endpoints if archive mode is enabled
- startup sync behavior if `SYNC_ENTRIES_ON_STARTUP=true`
