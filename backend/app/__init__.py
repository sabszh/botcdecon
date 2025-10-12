from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .settings import settings
from .routes import api_router
from .routes.health import router as health_router


def create_app() -> FastAPI:
  app = FastAPI(
    title='Bot de Continuonus API',
    version='1.0.0',
    debug=settings.debug
  )

  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=settings.allow_credentials,
    allow_methods=settings.allow_methods,
    allow_headers=settings.allow_headers
  )

  app.include_router(health_router)
  app.include_router(api_router, prefix=settings.api_prefix)

  static_dir = Path(__file__).resolve().parent.parent / 'static'
  static_dir.mkdir(parents=True, exist_ok=True)
  app.mount('/static', StaticFiles(directory=str(static_dir)), name='static')

  return app


app = create_app()
