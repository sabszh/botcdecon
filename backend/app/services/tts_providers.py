from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional, Protocol

from elevenlabs.client import ElevenLabs

from ..settings import settings

logger = logging.getLogger(__name__)


class TTSProvider(Protocol):
  def synthesize_bytes(self, *, text: str, language: str, speed: str = 'normal') -> Optional[bytes]:
    ...


class ElevenLabsProvider:
  def __init__(self) -> None:
    if not settings.elevenlabs_api_key:
      raise RuntimeError('ELEVENLABS_API_KEY is missing')
    self._client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    self._voice_id = settings.voice_id
    self._model_id = settings.model_id

  def synthesize_bytes(self, *, text: str, language: str, speed: str = 'normal') -> Optional[bytes]:
    voice_settings = {
      'stability': 0.5,
      'similarity_boost': 0.8,
      'style': 0.5,
      'use_speaker_boost': True
    }
    if speed == 'slow':
      voice_settings['stability'] = 0.7
      voice_settings['style'] = 0.3

    audio = self._client.text_to_speech.convert(
      text=text,
      voice_id=self._voice_id,
      model_id=self._model_id,
      output_format='mp3_44100_128',
      voice_settings=voice_settings
    )
    if isinstance(audio, (bytes, bytearray)):
      return bytes(audio)
    return b''.join(audio)


@lru_cache
def get_tts_provider() -> Optional[TTSProvider]:
  if settings.tts_provider != 'elevenlabs':
    logger.warning('Unsupported TTS provider: %s. Only elevenlabs is supported.', settings.tts_provider)
  if settings.has_elevenlabs:
    logger.info('Using ElevenLabs TTS provider')
    return ElevenLabsProvider()
  return None
