"""
Application Configuration
-------------------------
Centralized configuration management for the uTube application.
Stores database URLs, secret keys, and other environment-specific settings.
"""

import os
from pathlib import Path

# Project root directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Database Configuration
DATABASE_DIR = BASE_DIR / "backend" / "database"
DATABASE_FILE = DATABASE_DIR / "utube.db"
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# Ensure database directory exists
DATABASE_DIR.mkdir(parents=True, exist_ok=True)

# Application Settings
APP_NAME = "uTube - Video Sharing Platform"
APP_VERSION = "1.0.0"
DEBUG_MODE = True  # Set to False in production

# Security Settings (change these in production!)
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours for development (prevents timeout during long uploads)

# File Upload Settings
MAX_VIDEO_SIZE_MB = 500
ALLOWED_VIDEO_FORMATS = [".mp4", ".avi", ".mov", ".mkv", ".webm"]
ALLOWED_IMAGE_FORMATS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

# Storage Paths
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
VIDEOS_DIR = UPLOADS_DIR / "videos"
THUMBNAILS_DIR = UPLOADS_DIR / "thumbnails"
AVATARS_DIR = UPLOADS_DIR / "avatars"
BANNERS_DIR = UPLOADS_DIR / "banners"
BACKGROUNDS_DIR = STORAGE_DIR / "backgrounds"
PREVIEWS_DIR = UPLOADS_DIR / "previews"  # Phase 6: AI thumbnail generation frames
TEMP_DIR = STORAGE_DIR / "temp"
TEMP_UPLOADS_DIR = STORAGE_DIR / "temp"

# Ensure storage directories exist
for directory in [STORAGE_DIR, UPLOADS_DIR, VIDEOS_DIR, THUMBNAILS_DIR, AVATARS_DIR, BANNERS_DIR, PREVIEWS_DIR, BACKGROUNDS_DIR, TEMP_DIR, TEMP_UPLOADS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)



# API Settings
API_PREFIX = "/api/v1"
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://37.148.214.28",
    "http://37.148.214.28:3000",
    "http://37.148.214.28:8000",
]

# Allow overriding via environment variable
env_cors = os.getenv("CORS_ORIGINS")
if env_cors:
    CORS_ORIGINS.extend([origin.strip() for origin in env_cors.split(",")])

# Pagination
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
