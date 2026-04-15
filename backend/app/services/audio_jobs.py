from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import uuid4

from .tts import TTSService


@dataclass
class AudioJob:
  status: str = 'pending'
  audio_bytes: Optional[bytes] = None
  content_type: str = 'audio/mpeg'
  error: Optional[str] = None
  created_at: float = field(default_factory=time.time)
  tts_ms: float = 0.0


class AudioJobStore:
  def __init__(self, tts: Optional[TTSService], *, ttl_sec: int = 600) -> None:
    self._tts = tts
    self._jobs: Dict[str, AudioJob] = {}
    self._ttl_sec = ttl_sec

  def get(self, turn_id: str) -> Optional[AudioJob]:
    self.cleanup()
    return self._jobs.get(turn_id)

  async def queue(self, text: str, language: str) -> Optional[str]:
    if not text or not self._tts:
      return None
    turn_id = uuid4().hex
    self._jobs[turn_id] = AudioJob(status='pending')
    asyncio.create_task(self._run(turn_id, text, language))
    return turn_id

  async def _run(self, turn_id: str, text: str, language: str) -> None:
    job = self._jobs.get(turn_id)
    if not job or not self._tts:
      return
    t_start = time.perf_counter()
    try:
      audio = await self._tts.synthesize_bytes(text, language=language)
      job.tts_ms = (time.perf_counter() - t_start) * 1000
      if not audio:
        job.status = 'error'
        job.error = 'tts_empty'
        return
      job.audio_bytes = audio
      job.status = 'ready'
      job.content_type = 'audio/mpeg'
    except Exception as exc:
      import logging
      logging.getLogger(__name__).error('TTS synthesis failed for turn %s: %s', turn_id, exc)
      job.status = 'error'
      job.error = str(exc)

  def cleanup(self) -> None:
    now = time.time()
    expired = [key for key, job in self._jobs.items() if (now - job.created_at) > self._ttl_sec]
    for key in expired:
      self._jobs.pop(key, None)
