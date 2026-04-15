from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ...chatbot import ChatBot  # type: ignore
from ..settings import settings
from .archive_db import archive_is_available, get_archive_store
from .tts import get_tts_service, TTSService

logger = logging.getLogger(__name__)


def _sanitize_model_text(text: str) -> str:
  if not text:
    return ''
  value = text.replace('\r\n', '\n')
  value = re.sub(r'(?m)^\s*[-*]\s+', '', value)
  value = re.sub(r'(?m)^#{1,6}\s*', '', value)
  value = re.sub(r'\*\*(.*?)\*\*', r'\1', value)
  value = re.sub(r'__(.*?)__', r'\1', value)
  value = re.sub(r'\*(.*?)\*', r'\1', value)
  value = re.sub(r'_(.*?)_', r'\1', value)
  value = re.sub(r'`([^`]*)`', r'\1', value)
  value = value.replace('*', '')
  value = re.sub(r'\n{3,}', '\n\n', value)
  return value.strip()


@dataclass
class ChatResult:
  message: str
  session_id: str
  session_history: List[Dict[str, Any]] = field(default_factory=list)
  handoff_action: Optional[str] = None
  error: Optional[str] = None
  debug: Optional[Dict[str, Any]] = None
  audio_url: Optional[str] = None
  audio_turn_id: Optional[str] = None
  audio_status: str = 'none'


@dataclass
class AudioJob:
  status: str = 'pending'
  audio_bytes: Optional[bytes] = None
  content_type: str = 'audio/mpeg'
  error: Optional[str] = None
  created_at: float = field(default_factory=time.time)
  tts_ms: float = 0.0


class ChatService:
  def __init__(self) -> None:
    self._bot: Optional[ChatBot] = None
    self._init_error: Optional[str] = None
    self._tts: Optional[TTSService] = None
    self._archive = get_archive_store()
    self._audio_jobs: Dict[str, AudioJob] = {}
    self._audio_job_ttl_sec = 600

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

  def _schedule_background(self, coro: asyncio.Future | asyncio.Task | Any, *, label: str) -> None:
    async def runner() -> None:
      try:
        await coro
      except Exception as exc:  # pragma: no cover - defensive
        logger.exception('Background task failed (%s): %s', label, exc)

    asyncio.create_task(runner())

  async def _upsert_vectorstore_background(
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
        self._bot.upsert_vectorstore,
        user_input,
        ai_output,
        user_name,
        user_location or 'Unknown',
        session_id,
        continuous_data
      )
    except Exception as exc:  # pragma: no cover - defensive
      logger.exception('Vectorstore upsert failed (%s): %s', label, exc)

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
    continuous_data: Optional[Dict[str, Any]],
    include_history: bool = False
  ) -> ChatResult:
    t_start = time.perf_counter()
    language = (language or settings.default_language).lower()
    logger.info(
      "[CHAT] mode=%s session=%s lang=%s user=%s msg_len=%d history_len=%d",
      mode, session_id, language, user_name, len(message or ""), len(history or [])
    )
    self._cleanup_audio_jobs()

    if self._bot:
      try:
        if mode == 'memory':
          logger.info('[CHAT] MEMORY mode: generating confirmation reply')
          response = await asyncio.to_thread(
            self._bot.memory_confirmation,
            message,
            language,
            2
          )
          ai_output = _sanitize_model_text((response.get('ai_output') or '').strip()) or self._handle_memory_mode(message, language)
          timings = response.get('timings', {}) or {}
          audio_turn_id = await self._queue_audio(ai_output, language)
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
            self._upsert_vectorstore_background(
              user_input=message,
              ai_output=ai_output,
              user_name=user_name,
              user_location=user_location,
              session_id=session_id,
              continuous_data=continuous_data,
              label='memory_vector_upsert'
            ),
            label='memory_vector_upsert'
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

        if mode == 'handoff':
          logger.info('[CHAT] HANDOFF mode: invoking agent decision')
          handoff_action = await asyncio.to_thread(
            self._bot.classify_handoff,
            message,
            language
          )
          await self._persist_archive_turn(
            session_id=session_id,
            language=language,
            user_name=user_name,
            user_location=user_location,
            mode=mode,
            user_message=message,
            bot_message=handoff_action,
            error=None,
            continuous_data=continuous_data
          )
          total_ms = (time.perf_counter() - t_start) * 1000
          return ChatResult(
            message='',
            session_id=session_id,
            session_history=[],
            handoff_action=handoff_action,
            audio_status='none',
            debug={'total_ms': round(total_ms, 2), 'mode': 'handoff'}
          )

        if mode == 'followup':
          logger.info('[CHAT] FOLLOWUP mode: classifying next step')
          handoff_action = await asyncio.to_thread(
            self._bot.classify_followup,
            message,
            language
          )
          await self._persist_archive_turn(
            session_id=session_id,
            language=language,
            user_name=user_name,
            user_location=user_location,
            mode=mode,
            user_message=message,
            bot_message=handoff_action,
            error=None,
            continuous_data=continuous_data
          )
          total_ms = (time.perf_counter() - t_start) * 1000
          return ChatResult(
            message='',
            session_id=session_id,
            session_history=[],
            handoff_action=handoff_action,
            audio_status='none',
            debug={'total_ms': round(total_ms, 2), 'mode': 'followup'}
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
          15
        )
        ai_output = _sanitize_model_text(response.get('ai_output', ''))
        timings = response.get('timings', {}) or {}

        # Persist this Q/A off-path.
        asyncio.create_task(asyncio.to_thread(
          self._bot.upsert_vectorstore,
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

        audio_turn_id = await self._queue_audio(ai_output, language)
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
        fallback = _sanitize_model_text(self._fallback_reply(message, language))
        await self._persist_archive_turn(
          session_id=session_id,
          language=language,
          user_name=user_name,
          user_location=user_location,
          mode=mode,
          user_message=message,
          bot_message=fallback,
          error=f'chat_pipeline_error: {exc}',
          continuous_data=continuous_data
        )
        audio_turn_id = await self._queue_audio(fallback, language)
        total_ms = (time.perf_counter() - t_start) * 1000
        return ChatResult(
          message=fallback,
          session_id=session_id,
          session_history=[],
          handoff_action='continue' if mode == 'handoff' else None,
          error=f'chat_pipeline_error: {exc}',
          audio_turn_id=audio_turn_id,
          audio_status='pending' if audio_turn_id else 'none',
          debug={'total_ms': round(total_ms, 2), 'mode': 'fallback_error'}
        )

    fallback = _sanitize_model_text(self._fallback_reply(message, language))
    await self._persist_archive_turn(
      session_id=session_id,
      language=language,
      user_name=user_name,
      user_location=user_location,
      mode=mode,
      user_message=message,
      bot_message=fallback,
      error=self._init_error,
      continuous_data=continuous_data
    )
    audio_turn_id = await self._queue_audio(fallback, language)
    total_ms = (time.perf_counter() - t_start) * 1000
    return ChatResult(
      message=fallback,
      session_id=session_id,
      session_history=[],
      handoff_action='continue' if mode == 'handoff' else None,
      error=self._init_error,
      audio_turn_id=audio_turn_id,
      audio_status='pending' if audio_turn_id else 'none',
      debug={'total_ms': round(total_ms, 2), 'mode': 'fallback_no_bot'}
    )

  def get_audio_job(self, turn_id: str) -> Optional[AudioJob]:
    self._cleanup_audio_jobs()
    return self._audio_jobs.get(turn_id)

  async def _queue_audio(self, text: str, language: str) -> Optional[str]:
    if not text or not self._tts:
      return None
    turn_id = uuid4().hex
    self._audio_jobs[turn_id] = AudioJob(status='pending')
    asyncio.create_task(self._run_audio_job(turn_id, text, language))
    return turn_id

  async def _run_audio_job(self, turn_id: str, text: str, language: str) -> None:
    job = self._audio_jobs.get(turn_id)
    if not job:
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
    except Exception as exc:  # pragma: no cover - defensive
      job.status = 'error'
      job.error = str(exc)

  def _cleanup_audio_jobs(self) -> None:
    now = time.time()
    expired = [k for k, v in self._audio_jobs.items() if (now - v.created_at) > self._audio_job_ttl_sec]
    for key in expired:
      self._audio_jobs.pop(key, None)

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

  @staticmethod
  def _fallback_reply(user_input: str, language: str) -> str:
    if language == 'da':
      return 'Jeg kunne ikke hente et svar lige nu. Prøv venligst igen.'
    return 'I could not fetch an answer right now. Please try again.'

  @staticmethod
  def _handle_memory_mode(user_input: str, language: str) -> str:
    if (language or '').lower() == 'da':
      return "Tak fordi du delte."
    return "Thank you for sharing."


@lru_cache
def get_chat_service() -> ChatService:
  return ChatService()
