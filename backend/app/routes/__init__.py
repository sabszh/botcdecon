from fastapi import APIRouter

from . import chat

api_router = APIRouter()
api_router.include_router(chat.router, tags=['chat'])
