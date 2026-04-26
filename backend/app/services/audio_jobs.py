from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import uuid4

from .tts import TTSService

logger = logging.getLogger(__name__)


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
      logger.warning(
        '[TTS] queue skipped text_len=%d has_tts=%s language=%s',
        len(text or ''),
        bool(self._tts),
        language
      )
      return None
    turn_id = uuid4().hex
    self._jobs[turn_id] = AudioJob(status='pending')
    logger.info('[TTS] queued turn=%s text_len=%d language=%s', turn_id, len(text), language)
    asyncio.create_task(self._run(turn_id, text, language))
    return turn_id

  async def _run(self, turn_id: str, text: str, language: str) -> None:
    job = self._jobs.get(turn_id)
    if not job or not self._tts:
      return
    t_start = time.perf_counter()
    try:
      logger.info('[TTS] synthesis start turn=%s language=%s text_len=%d', turn_id, language, len(text))
      audio = await self._tts.synthesize_bytes(text, language=language)
      job.tts_ms = (time.perf_counter() - t_start) * 1000
      if not audio:
        job.status = 'error'
        job.error = 'tts_empty'
        logger.error('[TTS] synthesis empty turn=%s tts_ms=%.2f', turn_id, job.tts_ms)
        return
      job.audio_bytes = audio
      job.status = 'ready'
      job.content_type = 'audio/mpeg'
      logger.info('[TTS] synthesis ready turn=%s bytes=%d tts_ms=%.2f', turn_id, len(audio), job.tts_ms)
    except Exception as exc:
      logger.exception('[TTS] synthesis failed turn=%s: %s', turn_id, exc)
      job.status = 'error'
      job.error = str(exc)

  def cleanup(self) -> None:
    now = time.time()
    expired = [key for key, job in self._jobs.items() if (now - job.created_at) > self._ttl_sec]
    for key in expired:
      self._jobs.pop(key, None)
