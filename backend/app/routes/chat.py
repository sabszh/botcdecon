from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from typing_extensions import Literal

from ..services.chat import ChatResult, ChatService, get_chat_service
from ..settings import settings

router = APIRouter(prefix='/chat')


class HistoryItem(BaseModel):
  role: Literal['user', 'bot', 'system'] = 'user'
  content: str


class ChatRequest(BaseModel):
  session_id: str = Field(..., alias='sessionId')
  message: str
  language: Literal['da', 'en'] = Field(settings.default_language, alias='language')
  user_name: str = Field('Visitor', alias='userName')
  user_location: Optional[str] = Field(None, alias='userLocation')
  mode: Literal['question', 'memory', 'handoff', 'followup'] = 'question'
  history: List[HistoryItem] = Field(default_factory=list)
  continuous_data: Optional[Dict[str, Any]] = Field(default=None, alias='continuousData')
  include_history: bool = Field(False, alias='includeHistory')

  class Config:
    populate_by_name = True


class ChatResponse(BaseModel):
  message: str
  session_id: str = Field(..., alias='sessionId')
  session_history: List[Dict[str, Any]] = Field(default_factory=list, alias='sessionHistory')
  handoff_action: Optional[Literal['continue', 'return', 'question', 'memory']] = Field(default=None, alias='handoffAction')
  error: Optional[str] = None
  debug: Optional[Dict[str, Any]] = None
  audio_url: Optional[str] = Field(default=None, alias='audioUrl')
  audio_turn_id: Optional[str] = Field(default=None, alias='audioTurnId')
  audio_status: str = Field(default='none', alias='audioStatus')

  class Config:
    populate_by_name = True


@router.post('', response_model=ChatResponse)
async def chat_endpoint(
  payload: ChatRequest,
  service: ChatService = Depends(get_chat_service)
) -> ChatResponse:
  result: ChatResult = await service.chat(
    session_id=payload.session_id,
    message=payload.message,
    language=payload.language,
    user_name=payload.user_name,
    user_location=payload.user_location,
    mode=payload.mode,
    history=[item.dict() for item in payload.history],
    continuous_data=payload.continuous_data,
    include_history=payload.include_history
  )

  return ChatResponse(
    message=result.message,
    session_id=result.session_id,
    session_history=result.session_history,
    handoff_action=result.handoff_action,
    error=result.error,
    debug=result.debug,
    audio_url=result.audio_url,
    audio_turn_id=result.audio_turn_id,
    audio_status=result.audio_status
  )


@router.get('/audio/{turn_id}')
async def chat_audio_endpoint(
  turn_id: str,
  service: ChatService = Depends(get_chat_service)
):
  job = service.get_audio_job(turn_id)
  if not job:
    raise HTTPException(status_code=404, detail='audio_turn_not_found')
  if job.status == 'pending':
    return JSONResponse(status_code=202, content={'status': 'pending', 'turnId': turn_id})
  if job.status == 'error':
    return JSONResponse(status_code=424, content={'status': 'error', 'turnId': turn_id, 'error': job.error})
  if not job.audio_bytes:
    raise HTTPException(status_code=500, detail='audio_missing')
  return Response(
    content=job.audio_bytes,
    media_type=job.content_type,
    headers={'Cache-Control': 'no-store'}
  )
