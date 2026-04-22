import logging
from pathlib import Path
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .settings import settings
from .routes import api_router
from .routes.health import router as health_router
from .services.admin_auth import require_admin
from .services.archive_db import init_archive_db
from .services.chat import get_chat_service
from .services.entries_sync import sync_entries_dataset
from .services.local_retrieval import get_local_corpus


logger = logging.getLogger(__name__)


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

    @app.on_event('startup')
    async def startup_sync_entries() -> None:
        archive_ready = init_archive_db()
        if settings.archive_db_enabled and not archive_ready:
            logger.warning('Archive database is unavailable; chat history admin will be disabled until the database is reachable')
        elif not settings.archive_db_enabled:
            logger.info('Archive database is disabled; chat history admin is unavailable in this environment')
        result = sync_entries_dataset()
        if not result.attempted:
            logger.info('Entries startup sync skipped (enabled=%s, url=%s)', settings.sync_entries_on_startup, settings.entries_source_url)
        elif result.success:
            get_chat_service.cache_clear()
            get_local_corpus.cache_clear()
            logger.info(
                'Entries startup sync completed from %s into %s (%d entries)',
                result.source_url,
                result.data_path,
                result.entries_count
            )
        else:
            logger.warning(
                'Entries startup sync failed from %s: %s. Falling back to existing %s',
                result.source_url,
                result.error,
                result.data_path
            )

        try:
            # Pre-warm chat dependencies (LLM client, retriever, TTS wiring) so
            # the first visitor turn does not pay cold-start latency.
            get_chat_service()
            logger.info('Chat service pre-warmed during startup')
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning('Chat service pre-warm failed: %s', exc)

    # ✅ serve frontend build
    dist_dir = Path(__file__).resolve().parent.parent.parent / "dist"
    if dist_dir.exists():
        index_file = dist_dir / "index.html"

        @app.get('/admin', include_in_schema=False, dependencies=[Depends(require_admin)])
        @app.get('/admin/', include_in_schema=False, dependencies=[Depends(require_admin)])
        async def admin_frontend() -> FileResponse:
            return FileResponse(index_file)

        app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
    else:
        print(f"⚠️ Dist folder not found at {dist_dir}. Did you run 'npm run build'?")

    return app


app = create_app()
