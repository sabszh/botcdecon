from fastapi import APIRouter

from . import admin
from . import chat

api_router = APIRouter()
api_router.include_router(chat.router, tags=['chat'])
api_router.include_router(admin.router, tags=['admin'])
