from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
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
  mode: Literal['question', 'memory'] = 'question'
  history: List[HistoryItem] = Field(default_factory=list)
  continuous_data: Optional[Dict[str, Any]] = Field(default=None, alias='continuousData')

  class Config:
    populate_by_name = True


class ChatResponse(BaseModel):
  message: str
  session_id: str = Field(..., alias='sessionId')
  session_history: List[Dict[str, Any]] = Field(default_factory=list, alias='sessionHistory')
  error: Optional[str] = None
  debug: Optional[Dict[str, Any]] = None
  audio_url: Optional[str] = Field(default=None, alias='audioUrl')

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
    continuous_data=payload.continuous_data
  )

  return ChatResponse(
    message=result.message,
    session_id=result.session_id,
    session_history=result.session_history,
    error=result.error,
    debug=result.debug,
    audio_url=result.audio_url
  )
