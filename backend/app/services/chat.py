from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional

from ...chatbot import ChatBot  # type: ignore
from ..settings import settings
from .tts import get_tts_service, TTSService

logger = logging.getLogger(__name__)


@dataclass
class ChatResult:
  message: str
  session_id: str
  session_history: List[Dict[str, Any]] = field(default_factory=list)
  error: Optional[str] = None
  debug: Optional[Dict[str, Any]] = None
  audio_url: Optional[str] = None


class ChatService:
  def __init__(self) -> None:
    self._bot: Optional[ChatBot] = None
    self._init_error: Optional[str] = None
    self._tts: Optional[TTSService] = None

    if settings.has_llm_backends:
      try:
        self._bot = ChatBot(
          repo_id=settings.llm_repo_id,
          language=settings.default_language
        )
        logger.info('ChatBot initialised with repo %s', settings.llm_repo_id)
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Failed to initialise ChatBot: %s', exc)
        self._init_error = str(exc)
    else:
      self._init_error = 'Missing LLM configuration (check HuggingFace & Pinecone credentials)'
      logger.warning(self._init_error)

    try:
      self._tts = get_tts_service()
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Failed to initialise TTS service: %s', exc)
      self._tts = None

  async def chat(
    self,
    *,
    session_id: str,
    message: str,
    language: str,
    user_name: str,
    user_location: Optional[str],
    mode: str,
    history: List[Dict[str, Any]],
    continuous_data: Optional[Dict[str, Any]]
  ) -> ChatResult:
    language = (language or settings.default_language).lower()
    logger.info(
      "[CHAT] mode=%s session=%s lang=%s user=%s msg_len=%d history_len=%d",
      mode, session_id, language, user_name, len(message or ""), len(history or [])
    )
    if self._bot:
      try:
        if mode == 'memory':
          logger.info("[CHAT] MEMORY mode: will upsert saved memory")
          ai_output = self._handle_memory_mode(message, language)
          self._bot.upsert_vectorstore(
            user_input=message,
            ai_output=ai_output,
            user_name=user_name,
            user_location=user_location or 'Unknown',
            session_id=session_id,
            continuous_data=continuous_data
          )
          session_history = self._bot.retrieve_session(session_id)
          # Do not synthesize TTS for memory thank-you; frontend plays static audio from public/audio/*_THANK_YOU.mp3
          audio_url = None
          logger.info("[CHAT] MEMORY reply len=%d audio=%s (static thank-you used on frontend)", len(ai_output), bool(audio_url))
          return ChatResult(
            message=ai_output,
            session_id=session_id,
            session_history=session_history,
            audio_url=audio_url
          )

        logger.info("[CHAT] QUESTION mode: invoking pipeline")
        response = self._bot.pipeline(
          user_input=message,
          user_name=user_name,
          session_id=session_id,
          user_location=user_location or 'Unknown',
          chat_history=self._serialise_history(history),
          continuous_data=continuous_data,
          language=language
        )
        audio_url = await self._synth_audio(response.get('ai_output', ''))
        logger.info(
          "[CHAT] QUESTION reply len=%d audio=%s source_docs=%d",
          len(response.get('ai_output', '') or ''),
          bool(audio_url),
          len(response.get('source_data', []) or [])
        )
        return ChatResult(
          message=response.get('ai_output', ''),
          session_id=session_id,
          session_history=response.get('session_history', []),
          audio_url=audio_url
        )
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Chat pipeline failed: %s', exc)
        fallback = self._fallback_reply(message, language)
        audio_url = await self._synth_audio(fallback)
        return ChatResult(
          message=fallback,
          session_id=session_id,
          session_history=[],
          error=f'chat_pipeline_error: {exc}',
          audio_url=audio_url
        )

    # Fallback when no bot available
    fallback = self._fallback_reply(message, language)
    audio_url = await self._synth_audio(fallback)
    return ChatResult(
      message=fallback,
      session_id=session_id,
      session_history=[],
      error=self._init_error,
      audio_url=audio_url
    )

  @staticmethod
  def _serialise_history(history: List[Dict[str, Any]]) -> str:
    if not history:
      return ''
    # Keep only the most recent exchanges to avoid prompt bloat/noise
    trimmed = history[-4:]
    noise_fragments = [
      'Udforsk Carte de Continuonus',
      'Explore Carte de Continuonus',
      'Change language',
      'Skift sprog'
    ]
    parts: List[str] = []
    for item in trimmed:
      role = item.get('role', 'user')
      content = (item.get('content', '') or '').strip()
      if not content:
        continue
      # Filter out repetitive banners/prompts that add no semantic value
      if any(frag in content for frag in noise_fragments):
        continue
      # Cap each line length to keep prompts compact
      maxlen = 200
      if len(content) > maxlen:
        content = content[:maxlen] + '…'
      parts.append(f"{role}: {content}")
    return '\n'.join(parts)

  @staticmethod
  def _fallback_reply(user_input: str, language: str) -> str:
    trimmed = user_input.strip()
    if language == 'da':
      prefix = 'Tak for din besked'
      return f'{prefix}. Backend-svar er endnu ikke forbundet, men dette bliver snart aktivt.\n\nDu skrev: "{trimmed}"'
    prefix = 'Thank you for your message'
    return f'{prefix}. The full backend is not connected yet, but it will be available soon.\n\nYou wrote: "{trimmed}"'

  @staticmethod
  def _handle_memory_mode(user_input: str, language: str) -> str:
    # Return a fixed, hardcoded message (no dynamic quoting of the user's text)
    if (language or '').lower() == 'da':
      return "Tak for at dele din erindring. Den er nu en del af Carte de Continuonus."
    return "Thank you for sharing your memory. It is now part of Carte de Continuonus."

  async def _synth_audio(self, text: str) -> Optional[str]:
    if not text or not self._tts:
      return None
    return await self._tts.synthesize(text)


@lru_cache
def get_chat_service() -> ChatService:
  return ChatService()
