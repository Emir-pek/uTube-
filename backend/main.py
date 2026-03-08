"""
Main Application Entry Point
-----------------------------
FastAPI application setup and configuration.
"""

# CRITICAL: Load .env FIRST before any other imports
from dotenv import load_dotenv
from pathlib import Path
import sys
import os

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables from .env file
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

import logging
import asyncio
from contextlib import asynccontextmanager

# Suppress all INFO-level logs -- only show warnings and errors
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

from backend.core.config import APP_NAME, APP_VERSION, CORS_ORIGINS, API_PREFIX, STORAGE_DIR, UPLOADS_DIR
from backend.routes import auth_router, video_router, comment_router, like_router, trending_router, recommendation_router, chat_router
from backend.routes.channel_routes import router as channel_router
from backend.routes.stream_routes import router as stream_router
from backend.routes.moderator_routes import router as moderator_router
from backend.routes.admin_routes import router as admin_router
from backend.database import init_db
from backend.services.cleanup_service import startup_cleanup, cleanup_loop

# Lifespan context manager for startup and shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and ensure directories exist."""
    init_db()
    
    # Run full storage cleanup (stuck uploads, orphaned files, temp wipe)
    try:
        startup_cleanup()
    except Exception as e:
        print(f"[WARNING] Startup cleanup failed: {e}")
        
    # Task 1: Start Periodic Background Cleanup
    cleanup_task = asyncio.create_task(cleanup_loop())

    # Ensure storage directories exist
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[INFO] Static files mounted at: {os.path.abspath(STORAGE_DIR)}")

    # -- Clean Startup Banner --
    print("\n" + "=" * 52)
    print(f"  [*] {APP_NAME} v{APP_VERSION}")
    print("-" * 52)
    print("  > API Server:   http://localhost:8000")
    print(f"  > API Docs:     http://localhost:8000{API_PREFIX}/docs")
    print("  > Frontend:     http://localhost:3000")
    print("=" * 52 + "\n")

    yield
    
    # Shutdown logic
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        raise

# Create FastAPI application
app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="A video-sharing platform for students",
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    lifespan=lifespan
)

from starlette.types import ASGIApp, Receive, Scope, Send

class DebugMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "websocket":
            path = scope.get("path", "")
            query_string = scope.get("query_string", b"").decode()
            print("=" * 80)
            print(f"🔵 WEBSOCKET REQUEST RECEIVED")
            print(f"   Path: {path}")
            print(f"   Query: {query_string}")
            print(f"   Headers: {scope.get('headers', [])}")
            print("=" * 80)
        
        await self.app(scope, receive, send)

# Add this IMMEDIATELY after app = FastAPI(), before ANY other middleware
app.add_middleware(DebugMiddleware)

# ── Global Exception Handler: WebSocket-safe ──
@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    import traceback
    
    # CRITICAL: WebSocket connections cannot receive JSONResponse.
    # If we try to access request.method or return JSONResponse for a WS, the server crashes
    # and the browser sees readyState: 3 / code: 1006.
    if isinstance(request, WebSocket):
        logger.error(f"Unhandled exception in WebSocket connection:\n{traceback.format_exc()}")
        try:
            await request.close(code=1011, reason="Internal server error")
        except Exception:
            pass  # Connection might already be closed
        return  # Must return None for WebSocket
    
    # For HTTP requests, return JSON error as before
    logger.error(f"Unhandled exception on {request.method} {request.url.path}:\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."}
    )

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom ASGI middleware to ensure CORS headers on /storage static file responses
# CRITICAL: Written as raw ASGI — BaseHTTPMiddleware is incompatible with WebSockets
from starlette.datastructures import MutableHeaders

class StaticFilesCORSMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            # VIP BYPASS: Let WebSockets and lifespan events pass through untouched
            return await self.app(scope, receive, send)

        # For HTTP requests, intercept the response to add CORS on /storage paths
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if scope["path"].startswith("/storage"):
                    # Overwrite instead of append to prevent double headers
                    headers["access-control-allow-origin"] = "*"
                    headers["access-control-allow-methods"] = "GET, HEAD, OPTIONS"
                    headers["access-control-allow-headers"] = "*"
            await send(message)

        await self.app(scope, receive, send_wrapper)

app.add_middleware(StaticFilesCORSMiddleware)

# Mount static files securely using explicit relative path
# We use /storage as the URL prefix to match urlHelper.js and config.py logic
os.makedirs("storage", exist_ok=True)
os.makedirs("storage/uploads/thumbnails", exist_ok=True)
os.makedirs("storage/backgrounds", exist_ok=True)
os.makedirs("storage/uploads/banners", exist_ok=True)

app.mount("/storage", StaticFiles(directory="storage"), name="storage")

# Include routers
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(trending_router, prefix=API_PREFIX)
app.include_router(video_router, prefix=API_PREFIX)
app.include_router(comment_router, prefix=API_PREFIX)
app.include_router(like_router, prefix=API_PREFIX)
app.include_router(channel_router, prefix=API_PREFIX)
app.include_router(recommendation_router, prefix=API_PREFIX)
app.include_router(stream_router, prefix=f"{API_PREFIX}/streams")
app.include_router(moderator_router, prefix=API_PREFIX)

# Chat routes: WS endpoint at /api/v1/ws/chat/... and HTTP at /api/v1/chat/history/...
app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(admin_router, prefix=API_PREFIX)

# Mount static files
# /storage for local dev files
app.mount("/storage", StaticFiles(directory=str(Path(__file__).resolve().parent.parent / "storage")), name="storage")
# /uploads for direct access to videos/thumbnails/avatars
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")



@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully close database connections and clean up WAL files."""
    from backend.database import engine
    try:
        # Checkpoint WAL: merges -wal into the main .db file and removes -shm/-wal
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)")
        engine.dispose()
        print("[SHUTDOWN] Database connections closed and WAL files cleaned up.", flush=True)
    except Exception as e:
        print(f"[SHUTDOWN WARNING] WAL cleanup error: {e}", flush=True)
        engine.dispose()



# Root endpoint
@app.get("/")
def root():
    """Root endpoint with API information."""
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "docs": f"{API_PREFIX}/docs"
    }


# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Enable auto-reload in development
    )
