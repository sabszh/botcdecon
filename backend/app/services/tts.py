from __future__ import annotations

import asyncio
import logging
from typing import Optional

from ..settings import settings
from .tts_providers import TTSProvider, get_tts_provider

logger = logging.getLogger(__name__)


class TTSService:
  def __init__(self) -> None:
    if not settings.has_tts:
      raise RuntimeError('TTS requested but no provider is configured')
    self._provider: Optional[TTSProvider] = get_tts_provider()

  async def synthesize_bytes(self, text: str, *, language: str = 'da', speed: str = 'normal') -> Optional[bytes]:
    if not text or not self._provider:
      return None
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
      None,
      lambda: self._provider.synthesize_bytes(text=text, language=language, speed=speed)
    )


_tts_singleton: Optional[TTSService] = None


def get_tts_service() -> Optional[TTSService]:
  global _tts_singleton
  if not settings.has_tts:
    return None
  if _tts_singleton is None:
    _tts_singleton = TTSService()
  return _tts_singleton
