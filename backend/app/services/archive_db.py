from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional, Tuple

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, create_engine, exists, func, or_, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from ..settings import settings

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
  return datetime.now(timezone.utc)


def _preview(value: Optional[str], max_chars: int = 220) -> str:
  text = (value or '').strip()
  if len(text) <= max_chars:
    return text
  return text[:max_chars - 1] + '…'


class Base(DeclarativeBase):
  pass


class ChatSessionRecord(Base):
  __tablename__ = 'chat_sessions'

  session_id: Mapped[str] = mapped_column(String(128), primary_key=True)
  started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)
  last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False, index=True)
  language: Mapped[str] = mapped_column(String(8), default='da', nullable=False, index=True)
  user_name: Mapped[str] = mapped_column(String(120), default='Visitor', nullable=False)
  user_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
  turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
  last_user_message: Mapped[str] = mapped_column(Text, default='', nullable=False)
  last_bot_message: Mapped[str] = mapped_column(Text, default='', nullable=False)

  turns: Mapped[List['ChatTurnRecord']] = relationship(
    back_populates='session',
    cascade='all, delete-orphan',
    order_by='ChatTurnRecord.created_at'
  )


class ChatTurnRecord(Base):
  __tablename__ = 'chat_turns'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  session_id: Mapped[str] = mapped_column(ForeignKey('chat_sessions.session_id', ondelete='CASCADE'), index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False, index=True)
  mode: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
  language: Mapped[str] = mapped_column(String(8), default='da', nullable=False)
  user_message: Mapped[str] = mapped_column(Text, nullable=False)
  bot_message: Mapped[str] = mapped_column(Text, nullable=False)
  error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
  continuous_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

  session: Mapped[ChatSessionRecord] = relationship(back_populates='turns')


@dataclass
class SessionSummary:
  session_id: str
  started_at: str
  last_activity_at: str
  language: str
  user_name: str
  user_location: Optional[str]
  turn_count: int
  last_user_message: str
  last_bot_message: str


@dataclass
class SessionTurn:
  id: int
  created_at: str
  mode: str
  language: str
  user_message: str
  bot_message: str
  error: Optional[str]
  continuous_data: Optional[Dict[str, Any]]


class ArchiveStore:
  def __init__(self) -> None:
    self._engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
    self._session_factory = sessionmaker(bind=self._engine, autoflush=False, autocommit=False, expire_on_commit=False)

  def init_db(self) -> None:
    Base.metadata.create_all(self._engine)

  @contextmanager
  def session_scope(self) -> Generator[Session, None, None]:
    session = self._session_factory()
    try:
      yield session
      session.commit()
    except Exception:
      session.rollback()
      raise
    finally:
      session.close()

  def persist_turn(
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
    now = _utc_now()
    with self.session_scope() as session:
      record = session.get(ChatSessionRecord, session_id)
      if not record:
        record = ChatSessionRecord(
          session_id=session_id,
          started_at=now,
          last_activity_at=now,
          language=language,
          user_name=user_name or 'Visitor',
          user_location=user_location,
          turn_count=0,
          last_user_message='',
          last_bot_message=''
        )
        session.add(record)

      record.last_activity_at = now
      record.language = language
      record.user_name = user_name or 'Visitor'
      record.user_location = user_location
      record.turn_count += 1
      record.last_user_message = _preview(user_message)
      record.last_bot_message = _preview(bot_message)

      session.add(ChatTurnRecord(
        session_id=session_id,
        created_at=now,
        mode=mode,
        language=language,
        user_message=user_message,
        bot_message=bot_message,
        error=error,
        continuous_data=continuous_data
      ))

  def list_sessions(
    self,
    *,
    limit: int,
    offset: int,
    q: Optional[str],
    language: Optional[str]
  ) -> Tuple[List[SessionSummary], int]:
    with self.session_scope() as session:
      stmt = select(ChatSessionRecord)
      count_stmt = select(func.count()).select_from(ChatSessionRecord)

      if language:
        stmt = stmt.where(ChatSessionRecord.language == language)
        count_stmt = count_stmt.where(ChatSessionRecord.language == language)

      if q:
        like = f'%{q.strip()}%'
        turn_match = exists(
          select(ChatTurnRecord.id).where(
            ChatTurnRecord.session_id == ChatSessionRecord.session_id,
            or_(
              ChatTurnRecord.user_message.ilike(like),
              ChatTurnRecord.bot_message.ilike(like)
            )
          )
        )
        search_filter = or_(
          ChatSessionRecord.session_id.ilike(like),
          ChatSessionRecord.user_name.ilike(like),
          ChatSessionRecord.user_location.ilike(like),
          ChatSessionRecord.last_user_message.ilike(like),
          ChatSessionRecord.last_bot_message.ilike(like),
          turn_match
        )
        stmt = stmt.where(search_filter)
        count_stmt = count_stmt.where(search_filter)

      total = session.scalar(count_stmt) or 0
      rows = session.scalars(
        stmt.order_by(ChatSessionRecord.last_activity_at.desc()).offset(offset).limit(limit)
      ).all()

      items = [
        SessionSummary(
          session_id=row.session_id,
          started_at=row.started_at.isoformat(),
          last_activity_at=row.last_activity_at.isoformat(),
          language=row.language,
          user_name=row.user_name,
          user_location=row.user_location,
          turn_count=row.turn_count,
          last_user_message=row.last_user_message,
          last_bot_message=row.last_bot_message
        )
        for row in rows
      ]
      return items, int(total)

  def get_session_detail(self, session_id: str) -> Optional[Tuple[SessionSummary, List[SessionTurn]]]:
    with self.session_scope() as session:
      record = session.get(ChatSessionRecord, session_id)
      if not record:
        return None

      turns = session.scalars(
        select(ChatTurnRecord)
        .where(ChatTurnRecord.session_id == session_id)
        .order_by(ChatTurnRecord.created_at.asc(), ChatTurnRecord.id.asc())
      ).all()

      summary = SessionSummary(
        session_id=record.session_id,
        started_at=record.started_at.isoformat(),
        last_activity_at=record.last_activity_at.isoformat(),
        language=record.language,
        user_name=record.user_name,
        user_location=record.user_location,
        turn_count=record.turn_count,
        last_user_message=record.last_user_message,
        last_bot_message=record.last_bot_message
      )
      transcript = [
        SessionTurn(
          id=turn.id,
          created_at=turn.created_at.isoformat(),
          mode=turn.mode,
          language=turn.language,
          user_message=turn.user_message,
          bot_message=turn.bot_message,
          error=turn.error,
          continuous_data=turn.continuous_data
        )
        for turn in turns
      ]
      return summary, transcript


_archive_store: Optional[ArchiveStore] = None
_archive_available: bool = False
_archive_init_error: Optional[str] = None


def get_archive_store() -> ArchiveStore:
  global _archive_store
  if _archive_store is None:
    _archive_store = ArchiveStore()
  return _archive_store


def archive_is_available() -> bool:
  return _archive_available


def get_archive_init_error() -> Optional[str]:
  return _archive_init_error


def init_archive_db(max_attempts: int = 10, retry_delay_sec: float = 1.0) -> bool:
  global _archive_available, _archive_init_error
  _archive_available = False
  _archive_init_error = None
  last_error: Optional[Exception] = None
  for attempt in range(1, max_attempts + 1):
    try:
      get_archive_store().init_db()
      _archive_available = True
      _archive_init_error = None
      logger.info('Archive database initialised')
      return True
    except Exception as exc:  # pragma: no cover - defensive
      last_error = exc
      logger.warning('Archive database init attempt %d/%d failed: %s', attempt, max_attempts, exc)
      if attempt < max_attempts:
        time.sleep(retry_delay_sec)

  _archive_available = False
  _archive_init_error = str(last_error) if last_error else 'archive_db_init_failed'
  logger.error('Archive database unavailable after retries: %s', _archive_init_error)
  return False
