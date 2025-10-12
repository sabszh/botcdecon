from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional
import re
from uuid import uuid4
import base64

from elevenlabs.client import ElevenLabs

from ..settings import settings

logger = logging.getLogger(__name__)


class TTSService:
  def __init__(self) -> None:
    if not settings.has_tts:
      raise RuntimeError('TTS requested but ElevenLabs credentials are missing')

    self._client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    self._voice_id = settings.voice_id
    self._model_id = settings.model_id
    self._audio_dir = Path(__file__).resolve().parents[2] / 'static' / 'audio'
    self._audio_dir.mkdir(parents=True, exist_ok=True)

  async def synthesize(self, text: str, *, speed: str = 'normal') -> Optional[str]:
    # Generate ephemeral audio as a data URL (do not persist to disk)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, self._synth_sync, text, speed, None)

  async def ensure_scripted(self, text: str, *, language: str, label: str, speed: str = 'slow') -> Optional[str]:
    # Do not persist scripted audio; return as data URL for immediate playback
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, self._synth_sync, text, speed, None)

  def _public_url(self, file_path: Path) -> str:
    rel = file_path.relative_to(self._audio_dir)
    return f'/static/audio/{rel.as_posix()}'

  def _synth_sync(self, text: str, speed: str, target_path: Optional[Path] = None) -> Optional[str]:
    try:
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
      if not isinstance(audio, (bytes, bytearray)):
        audio = b''.join(audio)

      # If no target_path specified, return a data URL (no file written)
      if target_path is None:
        b64 = base64.b64encode(audio).decode('utf-8')
        return f'data:audio/mpeg;base64,{b64}'

      # Persist scripted or targeted audio to disk
      file_path = target_path
      file_path.parent.mkdir(parents=True, exist_ok=True)
      with open(file_path, 'wb') as file:
        file.write(audio)

      logger.info('Generated TTS audio at %s', file_path)
      return self._public_url(file_path)
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Failed to synthesise speech: %s', exc)
      return None


_tts_singleton: Optional[TTSService] = None


def get_tts_service() -> Optional[TTSService]:
  global _tts_singleton
  if not settings.has_tts:
    return None
  if _tts_singleton is None:
    _tts_singleton = TTSService()
  return _tts_singleton
