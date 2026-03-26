# Carte de Continuonus Runbook (ENG + DA)

## ENGLISH

### 1. Purpose
This runbook explains how to run, deploy, and operate the project with the current setup:
- LLM: Mistral
- TTS: ElevenLabs
- Retrieval: Local corpus from data/all.json (default)

### 2. Prerequisites
- Node.js 18+
- Python 3.10+
- pip
- Optional: Docker + Docker Compose

### 3. Environment Variables (.env)
Create a .env file in the project root with:

VITE_API_BASE=http://127.0.0.1:8000

RETRIEVER_PROVIDER=local
DATA_JSON_PATH=data/all.json

LLM_PROVIDER=mistral
MISTRAL_API_KEY=YOUR_MISTRAL_KEY
MISTRAL_MODEL=mistral-small-latest

TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_KEY
VOICE_ID=4PzN60Ir6O2U6RzaQ5fm
MODEL_ID=eleven_multilingual_v2

Optional (if switching to Pinecone mode later):
PINECONE_API_KEY=
INDEX_NAME_BOT=botcon
INDEX_NAME_CHAT=bdc-interaction-data
PINECONE_CLOUD=AWS
PINECONE_REGION=US_EAST_1

### 4. Local Run (No Docker)
Step 1: Install frontend dependencies
npm install

Step 2: Install backend dependencies
pip install -r backend/requirements.txt

Step 3: Start backend
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000

Step 4: Start frontend in another terminal
npm run dev

Step 5: Open app
http://127.0.0.1:5173

### 5. Local Run (Docker Compose)
Backend only:
docker compose up --build

Backend + frontend dev server:
docker compose --profile dev up --build

### 6. How RAG Works Now
- Retriever mode defaults to local
- The backend reads entries from data/all.json
- Retrieved entries are inserted into prompt context before LLM generation

### 7. Data Persistence for User Interactions
Current behavior:
- In local retriever mode, interactions are held in memory unless persistence is added

Recommended production behavior:
- Persist user interactions to a file or database
- Keep an append-only log for audit and replay
- Back up persistence storage daily

### 8. Prompt Audit Folder (Recommended)
Create a folder for prompt inspection, for example:
backend/prompt_audit/

For each turn, save:
- timestamp
- session_id
- user input
- retrieved snippets
- final prompt sent to LLM
- model response

This gives:
- quality debugging
- compliance traceability
- reproducible behavior checks

### 9. Hetzner Deployment (Single VM)
Step 1: Prepare VM
- Install Docker and Docker Compose
- Configure firewall for 80 and 443

Step 2: Copy project and .env
- Keep RETRIEVER_PROVIDER=local
- Keep DATA_JSON_PATH=data/all.json

Step 3: Start services
docker compose up --build -d

Step 4: Add reverse proxy
- Use Caddy or Nginx
- Enable TLS

Step 5: Backups
- .env
- data/all.json
- interaction persistence storage
- prompt audit logs

### 10. Troubleshooting
Issue: POST /api/chat goes to port 5173 and returns 404
Fix:
- Ensure VITE_API_BASE points to backend
- Restart frontend dev server after changing .env

Issue: AudioContext user gesture warning
Fix:
- Normal on first load before interaction
- Start audio after user gesture

Issue: No TTS output
Fix:
- Check ELEVENLABS_API_KEY
- Check VOICE_ID and MODEL_ID

---

## DANSK

### 1. Formål
Denne runbook forklarer, hvordan projektet køres, deployes og driftes med den nuværende opsætning:
- LLM: Mistral
- TTS: ElevenLabs
- Retrieval: Lokalt datasæt fra data/all.json (standard)

### 2. Forudsætninger
- Node.js 18+
- Python 3.10+
- pip
- Valgfrit: Docker + Docker Compose

### 3. Miljøvariabler (.env)
Opret en .env-fil i projektets rodmappe med:

VITE_API_BASE=http://127.0.0.1:8000

RETRIEVER_PROVIDER=local
DATA_JSON_PATH=data/all.json

LLM_PROVIDER=mistral
MISTRAL_API_KEY=DIN_MISTRAL_NØGLE
MISTRAL_MODEL=mistral-small-latest

TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=DIN_ELEVENLABS_NØGLE
VOICE_ID=4PzN60Ir6O2U6RzaQ5fm
MODEL_ID=eleven_multilingual_v2

Valgfrit (hvis I senere skifter til Pinecone):
PINECONE_API_KEY=
INDEX_NAME_BOT=botcon
INDEX_NAME_CHAT=bdc-interaction-data
PINECONE_CLOUD=AWS
PINECONE_REGION=US_EAST_1

### 4. Lokal kørsel (uden Docker)
Trin 1: Installer frontend-afhængigheder
npm install

Trin 2: Installer backend-afhængigheder
pip install -r backend/requirements.txt

Trin 3: Start backend
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000

Trin 4: Start frontend i et nyt terminalvindue
npm run dev

Trin 5: Åbn app
http://127.0.0.1:5173

### 5. Lokal kørsel (Docker Compose)
Kun backend:
docker compose up --build

Backend + frontend dev-server:
docker compose --profile dev up --build

### 6. Sådan virker RAG nu
- Retriever-tilstand er som standard local
- Backend læser entries fra data/all.json
- De fundne entries indsættes i prompt-kontekst før LLM-svar

### 7. Datagemning af brugerinteraktioner
Nuværende adfærd:
- I local retriever mode ligger interaktioner i hukommelsen, medmindre persistence er tilføjet

Anbefalet produktion:
- Gem interaktioner i fil eller database
- Brug append-only log til audit og replay
- Tag daglig backup af persistence-lager

### 8. Prompt Audit-mappe (anbefalet)
Opret en mappe til prompt-inspektion, fx:
backend/prompt_audit/

Gem pr. tur:
- timestamp
- session_id
- brugerinput
- fundne snippets
- endelig prompt sendt til LLM
- modelsvar

Det giver:
- bedre fejlsøgning af kvalitet
- sporbarhed
- reproducerbar kontrol af adfærd

### 9. Hetzner deployment (enkelt VM)
Trin 1: Klargør VM
- Installer Docker og Docker Compose
- Konfigurer firewall for 80 og 443

Trin 2: Kopiér projekt og .env
- Behold RETRIEVER_PROVIDER=local
- Behold DATA_JSON_PATH=data/all.json

Trin 3: Start services
docker compose up --build -d

Trin 4: Tilføj reverse proxy
- Brug Caddy eller Nginx
- Aktivér TLS

Trin 5: Backup
- .env
- data/all.json
- persistence-lager med interaktioner
- prompt audit-logs

### 10. Fejlfinding
Problem: POST /api/chat går til port 5173 og giver 404
Løsning:
- Kontroller at VITE_API_BASE peger på backend
- Genstart frontend dev-server efter ændring af .env

Problem: AudioContext-advarsel om brugerinteraktion
Løsning:
- Forventeligt på første load før interaktion
- Start lyd efter brugertryk

Problem: Ingen TTS-lyd
Løsning:
- Kontroller ELEVENLABS_API_KEY
- Kontroller VOICE_ID og MODEL_ID
