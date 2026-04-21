from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from ..settings import settings


def _slug(value: str) -> str:
  cleaned = re.sub(r'[^a-zA-Z0-9_-]+', '-', (value or '').strip())
  cleaned = cleaned.strip('-').lower()
  return cleaned or 'trace'


def write_prompt_trace(payload: Dict[str, Any]) -> Path | None:
  if not settings.prompt_trace_enabled:
    return None

  trace_dir = settings.prompt_trace_path
  trace_dir.mkdir(parents=True, exist_ok=True)

  now = datetime.now(timezone.utc)
  ts = now.strftime('%Y%m%dT%H%M%S%fZ')
  session_id = _slug(str(payload.get('session_id') or 'session'))
  trace_kind = _slug(str(payload.get('trace_kind') or 'prompt'))
  filename = f'{ts}_{session_id}_{trace_kind}.json'
  target = trace_dir / filename

  body = {
    'timestamp': now.isoformat(),
    **payload,
  }
  target.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding='utf-8')
  return target
