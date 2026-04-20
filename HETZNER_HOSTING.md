# Hetzner Hosting

This repo is set up to run on a single Hetzner VM with:

- Docker
- Docker Compose
- one Postgres container
- one production app container
- Caddy or Nginx in front for TLS

The production app container serves both:

- the built frontend from `dist/`
- the FastAPI backend on `/api/*`

## What To Deploy

Use these files from the repo root:

- `docker-compose.yml`
- `backend/Dockerfile`
- `.env.example`

Optional local/dev file:

- `docker-compose.dev.yml`

## Server Requirements

Recommended baseline:

- Ubuntu 24.04 or Debian 12
- 2 vCPU
- 4 GB RAM minimum
- 20+ GB disk

Open ports:

- `22` for SSH
- `80` for HTTP
- `443` for HTTPS

Do not expose `8000` publicly if you are using a reverse proxy.

## First-Time Server Setup

Install Docker and Compose plugin:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in after adding your user to the `docker` group.

## Repo Setup

```bash
git clone <your-github-repo-url>
cd continuonus-app
cp .env.example .env
```

Edit `.env` and set at least:

```env
ENVIRONMENT=production
DEBUG=false

ARCHIVE_DB_ENABLED=true
POSTGRES_DB=continuonus
POSTGRES_USER=continuonus
POSTGRES_PASSWORD=replace-with-a-strong-password
DATABASE_URL=postgresql+psycopg://continuonus:replace-with-a-strong-password@db:5432/continuonus

ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password

LLM_PROVIDER=mistral
MISTRAL_API_KEY=replace-with-your-key
MISTRAL_MODEL=mistral-small-latest

TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=
VOICE_ID=4PzN60Ir6O2U6RzaQ5fm
MODEL_ID=eleven_multilingual_v2

DATA_JSON_PATH=data/all.json
API_ALLOW_ORIGINS=https://your-domain.example
APP_PORT_BIND=127.0.0.1:8000
```

Notes:

- `APP_PORT_BIND=127.0.0.1:8000` keeps the app private to the VM so only Caddy/Nginx can reach it.
- If you are not ready to use ElevenLabs yet, leave `ELEVENLABS_API_KEY` empty. The app still runs and falls back to browser speech where applicable.
- Keep `ARCHIVE_DB_ENABLED=true` if you want installation sessions stored in Postgres.

## Start The Stack

```bash
docker compose up --build -d
```

Check status:

```bash
docker compose ps
docker compose logs app --tail=200
docker compose logs db --tail=200
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Updating After Git Pull

```bash
git pull
docker compose up --build -d
```

If only application code changed, this is enough.

## Reverse Proxy

Recommended: Caddy.

Minimal `Caddyfile`:

```caddy
your-domain.example {
  encode gzip zstd
  reverse_proxy 127.0.0.1:8000
}
```

That works because the app container serves both the frontend and backend from the same origin.

## Persistence And Backups

Persisted state:

- Postgres volume: `postgres_data`
- `.env`
- `data/all.json`

Back up Postgres:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > continuonus-backup.sql
```

Restore example:

```bash
cat continuonus-backup.sql | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

## Validation Checklist

Before calling the deployment done, verify:

1. `docker compose ps` shows both `app` and `db` healthy/running.
2. `curl http://127.0.0.1:8000/health` returns success.
3. The landing page loads through your public domain.
4. `POST /api/chat` succeeds from the browser.
5. A memory submission appears in the admin archive if archive DB is enabled.
6. Return/Tilbage resets the session correctly.
7. Inactivity reset also returns the session cleanly.

## Known Voice Limitation

The current ElevenLabs voice configuration may require a higher subscription tier for regenerating prebuilt MP3s.

That does not block hosting the app itself.
