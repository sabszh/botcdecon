from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen

from ..settings import settings


@dataclass
class EntriesSyncResult:
  attempted: bool
  success: bool
  source_url: Optional[str]
  data_path: Path
  entries_count: int = 0
  error: Optional[str] = None


def sync_entries_dataset() -> EntriesSyncResult:
  data_path = _resolve_data_path()

  if not settings.sync_entries_on_startup or not settings.entries_source_url:
    return EntriesSyncResult(
      attempted=False,
      success=False,
      source_url=settings.entries_source_url,
      data_path=data_path
    )

  try:
    payload = _fetch_remote_entries(settings.entries_source_url, settings.entries_sync_timeout_sec)
    entries = _normalize_entries(payload)
    if not entries:
      raise ValueError('remote_entries_empty')
    _write_entries(data_path, entries)
    return EntriesSyncResult(
      attempted=True,
      success=True,
      source_url=settings.entries_source_url,
      data_path=data_path,
      entries_count=len(entries)
    )
  except Exception as exc:
    return EntriesSyncResult(
      attempted=True,
      success=False,
      source_url=settings.entries_source_url,
      data_path=data_path,
      error=str(exc)
    )


def _fetch_remote_entries(url: str, timeout_sec: float) -> Any:
  req = Request(
    url,
    headers={
      'User-Agent': 'Bot de Continuonus startup sync',
      'Accept': 'application/json'
    }
  )
  with urlopen(req, timeout=timeout_sec) as response:
    return json.loads(response.read())


def _normalize_entries(payload: Any) -> List[Dict[str, Any]]:
  if not isinstance(payload, list):
    raise ValueError('remote_entries_not_list')

  normalized: List[Dict[str, Any]] = []
  for index, item in enumerate(payload):
    if not isinstance(item, dict):
      continue

    slug = str(item.get('slug') or item.get('title') or '').strip()
    text = str(item.get('text') or '').strip()
    if not slug or not text:
      continue

    normalized.append({
      'slug': slug,
      'title': str(item.get('title') or slug),
      'name': str(item.get('name') or ''),
      'location': str(item.get('location') or ''),
      'text': text,
      'date': str(item.get('date') or ''),
      'points': item.get('points') if isinstance(item.get('points'), list) else [],
      'index': item.get('index', index)
    })

  return normalized


def _write_entries(data_path: Path, entries: List[Dict[str, Any]]) -> None:
  data_path.parent.mkdir(parents=True, exist_ok=True)
  tmp_path = data_path.with_suffix(data_path.suffix + '.tmp')
  tmp_path.write_text(
    json.dumps(entries, ensure_ascii=False, indent=2),
    encoding='utf-8'
  )
  tmp_path.replace(data_path)


def _resolve_data_path() -> Path:
  # Match the same repo-root resolution used by backend/chatbot.py.
  root = Path(__file__).resolve().parents[3]
  data_path = Path(settings.data_json_path)
  if not data_path.is_absolute():
    data_path = root / data_path
  return data_path
