from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.admin_auth import require_admin
from ..services.archive_db import archive_is_available, get_archive_init_error, get_archive_store

router = APIRouter(prefix='/admin')


def _require_archive() -> None:
  if archive_is_available():
    return
  raise HTTPException(status_code=503, detail=get_archive_init_error() or 'archive_db_unavailable')


class AdminSessionSummary(BaseModel):
  session_id: str = Field(..., alias='sessionId')
  started_at: str = Field(..., alias='startedAt')
  last_activity_at: str = Field(..., alias='lastActivityAt')
  language: str
  user_name: str = Field(..., alias='userName')
  user_location: Optional[str] = Field(None, alias='userLocation')
  turn_count: int = Field(..., alias='turnCount')
  last_user_message: str = Field(..., alias='lastUserMessage')
  last_bot_message: str = Field(..., alias='lastBotMessage')

  class Config:
    populate_by_name = True


class AdminTurn(BaseModel):
  id: int
  created_at: str = Field(..., alias='createdAt')
  mode: str
  language: str
  user_message: str = Field(..., alias='userMessage')
  bot_message: str = Field(..., alias='botMessage')
  error: Optional[str] = None
  continuous_data: Optional[Dict[str, Any]] = Field(None, alias='continuousData')

  class Config:
    populate_by_name = True


class AdminSessionListResponse(BaseModel):
  items: List[AdminSessionSummary]
  total: int
  limit: int
  offset: int


class AdminSessionDetailResponse(BaseModel):
  session: AdminSessionSummary
  turns: List[AdminTurn]


@router.get('/chat-sessions', response_model=AdminSessionListResponse, dependencies=[Depends(require_admin)])
def list_chat_sessions(
  limit: int = Query(50, ge=1, le=200),
  offset: int = Query(0, ge=0),
  q: Optional[str] = Query(None),
  language: Optional[str] = Query(None)
) -> AdminSessionListResponse:
  _require_archive()
  store = get_archive_store()
  items, total = store.list_sessions(limit=limit, offset=offset, q=q, language=language)
  return AdminSessionListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get('/chat-sessions/{session_id}', response_model=AdminSessionDetailResponse, dependencies=[Depends(require_admin)])
def get_chat_session(session_id: str) -> AdminSessionDetailResponse:
  _require_archive()
  store = get_archive_store()
  detail = store.get_session_detail(session_id)
  if not detail:
    raise HTTPException(status_code=404, detail='chat_session_not_found')
  session, turns = detail
  return AdminSessionDetailResponse(session=session, turns=turns)
