from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional

from ...chatbot import ChatBot  # type: ignore
from ..settings import settings
from .archive_db import archive_is_available, get_archive_store
from .audio_jobs import AudioJob, AudioJobStore
from .chat_formatting import sanitize_model_text
from .tts import get_tts_service, TTSService

logger = logging.getLogger(__name__)


def _strip_memory_acknowledgement(text: str, language: str) -> str:
  cleaned = (text or '').strip()
  if not cleaned:
    return cleaned

  prefixes = {
    'en': [
      'Thank you for sharing.',
      'Thank you for sharing',
    ],
    'da': [
      'Tak fordi du delte.',
      'Tak fordi du delte',
    ],
  }

  for prefix in prefixes.get((language or '').lower(), []):
    if cleaned.lower().startswith(prefix.lower()):
      cleaned = cleaned[len(prefix):].lstrip(' .,:;!-–—')
      break

  return cleaned.strip()


def _excerpt(value: str, max_words: int = 8) -> str:
  words = [w for w in (value or '').strip().split() if w]
  if not words:
    return ''
  if len(words) <= max_words:
    return ' '.join(words)
  return ' '.join(words[:max_words]) + '...'


def _build_memory_confirmation_fallback(
  language: str,
  user_memory: str,
  retrieved_memory: Optional[str] = None,
) -> str:
  lang = (language or '').lower()
  user_excerpt = _excerpt(user_memory, max_words=8)
  retrieved_excerpt = _excerpt(retrieved_memory or '', max_words=10)

  if lang == 'da':
    if retrieved_excerpt:
      return (
        f'Dit minde om "{user_excerpt}" minder mig om en anden, der skrev "{retrieved_excerpt}". '
        'De deler en personlig omsorg, som andre også kan genkende. Nu er dit minde en del af continuOnus-landskabet.'
      )
    return (
      f'Dit minde om "{user_excerpt}" minder mig om andres håb om omsorg og nærhed. '
      'Det føles personligt og genkendeligt. Nu er dit minde en del af continuOnus-landskabet.'
    )

  if retrieved_excerpt:
    return (
      f'Your memory about "{user_excerpt}" reminds me of another person who wrote "{retrieved_excerpt}". '
      'They share a personal form of care that others can recognize. Your memory is now part of the continuOnus landscape.'
    )
  return (
    f'Your memory about "{user_excerpt}" reminds me of others who hope for care and closeness. '
    'It feels personal and recognizable. Your memory is now part of the continuOnus landscape.'
  )


@dataclass
class ChatResult:
  message: str
  session_id: str
  session_history: List[Dict[str, Any]] = field(default_factory=list)
  error: Optional[str] = None
  debug: Optional[Dict[str, Any]] = None
  audio_url: Optional[str] = None
  audio_turn_id: Optional[str] = None
  audio_status: str = 'none'

class ChatService:
  def __init__(self) -> None:
    self._bot: Optional[ChatBot] = None
    self._init_error: Optional[str] = None
    self._tts: Optional[TTSService] = None
    try:
      self._archive = get_archive_store()
    except RuntimeError as exc:
      logger.warning('Archive store unavailable (%s); persistence disabled', exc)
      self._archive = None
    self._audio_jobs = AudioJobStore(None)

    if settings.has_llm_backends:
      try:
        self._bot = ChatBot(
          repo_id=settings.llm_repo_id,
          language=settings.default_language
        )
        logger.info('ChatBot initialised with repo %s (provider=%s)', settings.llm_repo_id, settings.llm_provider)
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Failed to initialise ChatBot: %s', exc)
        self._init_error = str(exc)
    else:
      self._init_error = 'Missing LLM configuration (check Mistral/HuggingFace credentials)'
      logger.warning(self._init_error)

    try:
      self._tts = get_tts_service()
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Failed to initialise TTS service: %s', exc)
      self._tts = None
    self._audio_jobs = AudioJobStore(self._tts)

  def _schedule_background(self, coro: asyncio.Future | asyncio.Task | Any, *, label: str) -> None:
    async def runner() -> None:
      try:
        await coro
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Background task failed (%s): %s', label, exc)

    asyncio.create_task(runner())

  async def _store_session_memory_background(
    self,
    *,
    user_input: str,
    ai_output: str,
    user_name: str,
    user_location: Optional[str],
    session_id: str,
    continuous_data: Optional[Dict[str, Any]],
    label: str,
  ) -> None:
    if not self._bot:
      return
    try:
      await asyncio.to_thread(
        self._bot.store_session_memory,
        user_input,
        ai_output,
        user_name,
        user_location or 'Unknown',
        session_id,
        continuous_data
      )
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Local session memory storage failed (%s): %s', label, exc)

  async def chat(
    self,
    *,
    session_id: str,
    message: str,
    language: str,
    user_name: str,
    user_location: Optional[str],
    mode: str,
    bot_message: Optional[str],
    clear_session_memory: bool,
    history: List[Dict[str, Any]],
    continuous_data: Optional[Dict[str, Any]],
    include_history: bool = False
  ) -> ChatResult:
    t_start = time.perf_counter()
    language = (language or settings.default_language).lower()
    logger.info(
      "[CHAT] mode=%s session=%s lang=%s user=%s msg_len=%d history_len=%d",
      mode, session_id, language, user_name, len(message or ""), len(history or [])
    )
    self._audio_jobs.cleanup()

    if mode == 'system':
      system_message = (bot_message or '').strip()
      if not system_message:
        raise RuntimeError('empty_system_message')
      await self._persist_archive_turn(
        session_id=session_id,
        language=language,
        user_name=user_name,
        user_location=user_location,
        mode='system',
        user_message=message,
        bot_message=system_message,
        error=None,
        continuous_data=continuous_data
      )
      if clear_session_memory and self._bot:
        try:
          await asyncio.to_thread(self._bot.clear_session_memory, session_id)
        except Exception as exc:  # pragma: no cover - defensive
          logger.exception('Session memory clear failed (%s): %s', session_id, exc)
      total_ms = (time.perf_counter() - t_start) * 1000
      return ChatResult(
        message=system_message,
        session_id=session_id,
        session_history=[],
        audio_status='none',
        debug={'total_ms': round(total_ms, 2), 'mode': 'system'}
      )

    if self._bot:
      try:
        if mode == 'memory':
          logger.info('[CHAT] MEMORY mode: generating confirmation reply')
          response: Dict[str, Any] = {}
          try:
            response = await asyncio.to_thread(
              self._bot.memory_confirmation,
              message,
              language,
              20
            )
          except Exception as exc:
            logger.exception('Memory confirmation generation failed; using fallback: %s', exc)

          ai_output = sanitize_model_text((response.get('ai_output') or '').strip())
          ai_output = _strip_memory_acknowledgement(ai_output, language)
          if not ai_output:
            retrieved_memory: Optional[str] = None
            source_docs = response.get('source_data') if isinstance(response, dict) else None
            if isinstance(source_docs, list) and source_docs:
              first_text = (source_docs[0].get('text') or '').strip() if isinstance(source_docs[0], dict) else ''
              retrieved_memory = first_text or None

            if not retrieved_memory:
              try:
                docs = await asyncio.to_thread(self._bot.retrieve_docs, message, self._bot.source_index_name, None, 1)
                if docs and isinstance(docs[0], dict):
                  retrieved_memory = (docs[0].get('text') or '').strip() or None
              except Exception as exc:
                logger.info('Fallback retrieval for memory confirmation failed: %s', exc)

            ai_output = _build_memory_confirmation_fallback(language, message, retrieved_memory)
          timings = response.get('timings', {}) or {}
          audio_turn_id = await self._audio_jobs.queue(ai_output, language)
          self._schedule_background(
            self._persist_archive_turn(
              session_id=session_id,
              language=language,
              user_name=user_name,
              user_location=user_location,
              mode=mode,
              user_message=message,
              bot_message=ai_output,
              error=None,
              continuous_data=continuous_data
            ),
            label='memory_archive_persist'
          )
          self._schedule_background(
            self._store_session_memory_background(
              user_input=message,
              ai_output=ai_output,
              user_name=user_name,
              user_location=user_location,
              session_id=session_id,
              continuous_data=continuous_data,
              label='memory_session_memory'
            ),
            label='memory_session_memory'
          )
          total_ms = (time.perf_counter() - t_start) * 1000
          return ChatResult(
            message=ai_output,
            session_id=session_id,
            session_history=[],
            audio_turn_id=audio_turn_id,
            audio_status='pending' if audio_turn_id else 'none',
            debug={**timings, 'total_ms': round(total_ms, 2), 'mode': 'memory'}
          )

        logger.info('[CHAT] QUESTION mode: invoking pipeline via thread executor')
        response = await asyncio.to_thread(
          self._bot.pipeline,
          message,
          user_name,
          session_id,
          user_location or 'Unknown',
          self._serialise_history(history),
          continuous_data,
          language,
          False,  # persist off critical path
          include_history,
          20
        )
        ai_output = sanitize_model_text(response.get('ai_output', ''))
        if not ai_output:
          raise RuntimeError('empty_question_response')
        timings = response.get('timings', {}) or {}

        # Keep session memory off the critical path.
        asyncio.create_task(asyncio.to_thread(
          self._bot.store_session_memory,
          message,
          ai_output,
          user_name,
          user_location or 'Unknown',
          session_id,
          continuous_data
        ))
        await self._persist_archive_turn(
          session_id=session_id,
          language=language,
          user_name=user_name,
          user_location=user_location,
          mode=mode,
          user_message=message,
          bot_message=ai_output,
          error=None,
          continuous_data=continuous_data
        )

        audio_turn_id = await self._audio_jobs.queue(ai_output, language)
        audio_status = 'pending' if audio_turn_id else 'none'

        total_ms = (time.perf_counter() - t_start) * 1000
        debug = {
          **timings,
          'total_ms': round(total_ms, 2),
          'tts_queued': bool(audio_turn_id),
          'mode': 'question'
        }

        logger.info(
          '[CHAT] QUESTION reply len=%d source_docs=%d audio_turn=%s total_ms=%.2f',
          len(ai_output or ''),
          len(response.get('source_data', []) or []),
          bool(audio_turn_id),
          total_ms
        )
        return ChatResult(
          message=ai_output,
          session_id=session_id,
          session_history=response.get('session_history', []),
          audio_turn_id=audio_turn_id,
          audio_status=audio_status,
          debug=debug
        )
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Chat pipeline failed: %s', exc)
        error_text = f'chat_pipeline_error: {exc}'
        await self._persist_archive_turn(
          session_id=session_id,
          language=language,
          user_name=user_name,
          user_location=user_location,
          mode=mode,
          user_message=message,
          bot_message='',
          error=error_text,
          continuous_data=continuous_data
        )
        total_ms = (time.perf_counter() - t_start) * 1000
        return ChatResult(
          message='',
          session_id=session_id,
          session_history=[],
          error=error_text,
          audio_turn_id=None,
          audio_status='none',
          debug={'total_ms': round(total_ms, 2), 'mode': 'error'}
        )

    error_text = self._init_error or 'chatbot_unavailable'
    await self._persist_archive_turn(
      session_id=session_id,
      language=language,
      user_name=user_name,
      user_location=user_location,
      mode=mode,
      user_message=message,
      bot_message='',
      error=error_text,
      continuous_data=continuous_data
    )
    total_ms = (time.perf_counter() - t_start) * 1000
    return ChatResult(
      message='',
      session_id=session_id,
      session_history=[],
      error=error_text,
      audio_turn_id=None,
      audio_status='none',
      debug={'total_ms': round(total_ms, 2), 'mode': 'error_no_bot'}
    )

  def get_audio_job(self, turn_id: str) -> Optional[AudioJob]:
    return self._audio_jobs.get(turn_id)

  async def _persist_archive_turn(
    self,
    *,
    session_id: str,
    language: str,
    user_name: str,
    user_location: Optional[str],
    mode: str,
    user_message: str,
    bot_message: str,
    error: Optional[str],
    continuous_data: Optional[Dict[str, Any]]
  ) -> None:
    if not archive_is_available():
      return
    try:
      await asyncio.to_thread(
        self._archive.persist_turn,
        session_id=session_id,
        language=language,
        user_name=user_name,
        user_location=user_location,
        mode=mode,
        user_message=user_message,
        bot_message=bot_message,
        error=error,
        continuous_data=continuous_data
      )
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Archive persistence failed: %s', exc)

  @staticmethod
  def _serialise_history(history: List[Dict[str, Any]]) -> str:
    if not history:
      return ''
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
      if any(frag in content for frag in noise_fragments):
        continue
      if len(content) > 200:
        content = content[:200] + '…'
      parts.append(f"{role}: {content}")
    return '\n'.join(parts)

@lru_cache
def get_chat_service() -> ChatService:
  return ChatService()
