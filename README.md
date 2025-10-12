## Carte de Continuonus

Environment
- Set `VITE_API_BASE` to the backend base URL (e.g., `http://127.0.0.1:8000`). The frontend reads this via `import.meta.env.VITE_API_BASE` and prefixes all API requests like `fetch(`${VITE_API_BASE}/...`)`.
