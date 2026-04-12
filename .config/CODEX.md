# Codex Guide

## Goal

Help Codex make safe, useful changes in this repository with minimal rediscovery.

## First Files to Read

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/BACKEND.md`

Then inspect the files directly involved in the request.

## Frontend Notes

- The public app is effectively orchestrated by `src/pages/Home.tsx` and `src/components/ChatPanel.tsx`.
- `src/components/chat/` contains the lower-level chat UI and helpers.
- `src/map/` contains the 3D and map presentation layer.
- The shared textarea model is intentional. Do not reintroduce separate voice and typing fields by accident.

## Backend Notes

- `backend/app/services/chat.py` is the orchestration layer.
- `backend/chatbot.py` owns retrieval and prompt construction.
- The backend may serve the built frontend from `dist/` when present.
- Startup can trigger entry sync and chat service cache invalidation.

## Safe Change Strategy

- For UI fixes, prefer local component changes before touching `Home.tsx`.
- For chat-flow bugs, inspect both frontend sequencing and backend mode handling.
- For deployment work, document backend hosting constraints explicitly.
- For asset or cache changes, review `public/_headers`.

## What to Verify

- `npm run build`
- no accidental route breakage between `/` and `/admin`
- same-origin API behavior still works when `VITE_API_BASE` is unset
- voice and text still use the same composer

## Anti-Patterns

- assuming serverless-safe backend behavior
- broad renames in `ChatPanel.tsx` without behavior verification
- changing audio flow in only one layer
- adding documentation that duplicates and contradicts existing repo docs
