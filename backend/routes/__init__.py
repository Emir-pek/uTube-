"""
Routes Package
--------------
API route handlers for the uTube application.
"""

from backend.routes.auth_routes import router as auth_router
from backend.routes.video_routes import router as video_router
from backend.routes.comment_routes import router as comment_router
from backend.routes.like_routes import router as like_router
from backend.routes.trending_routes import router as trending_router
from backend.routes.recommendation_routes import router as recommendation_router
from backend.routes.chat_routes import router as chat_router
from backend.routes.playlist_routes import router as playlist_router
from backend.routes.playlist_routes import user_playlists_router

__all__ = ["auth_router", "video_router", "comment_router", "like_router", "trending_router", "recommendation_router", "chat_router", "playlist_router", "user_playlists_router"]

