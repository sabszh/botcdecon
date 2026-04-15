from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

ParsedModelT = TypeVar("ParsedModelT", bound=BaseModel)


def enforce_concise(text: str, max_sentences: int = 5, max_words: int = 120) -> str:
  if not text:
    return ''
  text = re.sub(r"\([^\)]*\)", "", text)
  sentences = re.split(r"(?<=[.!?])\s+", text.strip())
  sentences = [s.strip() for s in sentences if s.strip()]
  result = ' '.join(sentences[:max_sentences])
  words = result.split()
  if len(words) > max_words:
    result = ' '.join(words[:max_words]) + '…'
  return result


def format_points(points: Any) -> str:
  if not isinstance(points, list) or not points:
    return "none"
  parts: List[str] = []
  for point in points[:4]:
    if not isinstance(point, dict):
      continue
    emotion = str(point.get("emotion") or "").strip() or "unknown"
    distance = point.get("distance")
    x = point.get("x")
    y = point.get("y")
    details = [f"emotion={emotion}"]
    if distance is not None:
      details.append(f"distance={distance}")
    if x is not None and y is not None:
      details.append(f"coords=({x},{y})")
    parts.append(", ".join(details))
  return " | ".join(parts) if parts else "none"


def shorten(value: str, max_chars: int = 160) -> str:
  value = (value or "").replace("\n", " ").strip()
  return value[:max_chars] + ('…' if len(value) > max_chars else '')


def format_context(documents: List[Dict[str, Any]], *, chat: bool = False) -> str:
  documents = list(documents)[:15]
  parts = []
  for idx, doc in enumerate(documents, start=1):
    md = doc["metadata"]
    if not chat:
      content = shorten(doc.get("text", ""), 220)
      name = shorten(md.get("name", ""), 60) or "not provided"
      location = shorten(md.get("location", ""), 60) or "not provided"
      date = shorten(md.get("date", ""), 40) or "not provided"
      points = format_points(md.get("points"))
      parts.append(
        f'Contributor #{idx}: name={name} | location={location} | memory="{content}" | date={date} | points={points}'
      )
    else:
      q = shorten(md.get("user_question", "Unknown Question"), 120)
      a = shorten(md.get("ai_output", "Unknown Response"), 120)
      parts.append(f'A contributor asked: "{q}" and received: "{a}"')
  return "\n".join(parts)


def extract_first_json_object(text: str) -> Optional[str]:
  if not text:
    return None
  start = text.find("{")
  if start < 0:
    return None

  depth = 0
  in_string = False
  escaped = False
  for idx in range(start, len(text)):
    ch = text[idx]
    if in_string:
      if escaped:
        escaped = False
      elif ch == "\\":
        escaped = True
      elif ch == '"':
        in_string = False
      continue

    if ch == '"':
      in_string = True
      continue
    if ch == "{":
      depth += 1
    elif ch == "}":
      depth -= 1
      if depth == 0:
        return text[start:idx + 1]
  return None


def parse_llm_json(raw_text: str, model_type: Type[ParsedModelT]) -> Optional[ParsedModelT]:
  payload = extract_first_json_object(raw_text or "")
  if not payload:
    return None
  try:
    data = json.loads(payload)
    return model_type.model_validate(data)
  except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
    return None


def normalize_handoff_reply(user_input: str) -> str:
  normalized = (user_input or "").strip().lower()
  normalized = re.sub(r"\s+", " ", normalized)
  normalized = re.sub(r"^[\"'“”‘’\s]+|[\"'“”‘’\s]+$", "", normalized)
  return re.sub(r"[.!]+$", "", normalized)


def sanitize_model_text(text: str) -> str:
  if not text:
    return ''
  value = text.replace('\r\n', '\n').replace('\r', '\n')
  value = re.sub(r'(?m)^\s*[-*]\s+', '', value)
  value = re.sub(r'(?m)^#{1,6}\s*', '', value)
  value = re.sub(r'\*\*(.*?)\*\*', r'\1', value)
  value = re.sub(r'__(.*?)__', r'\1', value)
  value = re.sub(r'\*(.*?)\*', r'\1', value)
  value = re.sub(r'_(.*?)_', r'\1', value)
  value = re.sub(r'`([^`]*)`', r'\1', value)
  value = value.replace('*', '')
  value = re.sub(r'[ \t]+\n', '\n', value)
  value = re.sub(r'\n[ \t]+', '\n', value)
  value = re.sub(r'\n{2,}', '\n', value)
  return value.strip()
