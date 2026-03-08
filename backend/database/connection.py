"""
Database Connection Management
-------------------------------
Handles SQLAlchemy engine creation, session management, and database initialization.
Provides a dependency injection pattern for route handlers.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import logging
from fastapi import HTTPException

from backend.core.config import DATABASE_URL

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create SQLAlchemy engine
# connect_args={"check_same_thread": False} is needed for SQLite
# to allow multiple threads to use the same connection
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,  # Set to True for SQL debugging
    pool_pre_ping=True,  # Verify connections before using them
)

# Enable foreign key constraints for SQLite
# SQLite doesn't enforce foreign keys by default
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """
    Configure SQLite connection.
    - Enable foreign key constraints
    - Enable Write-Ahead Logging (WAL) for concurrency
    """
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

# Create SessionLocal class
# Each instance of SessionLocal will be a database session
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for all ORM models
# All models will inherit from this
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency for route handlers.
    
    Usage in FastAPI routes:
    ```python
    @app.get("/videos")
    def get_videos(db: Session = Depends(get_db)):
        videos = db.query(Video).all()
        return videos
    ```
    
    Usage in Flask routes:
    ```python
    @app.route("/videos")
    def get_videos():
        db = next(get_db())
        try:
            videos = db.query(Video).all()
            return jsonify(videos)
        finally:
            db.close()
    ```
    
    Yields:
        Session: SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        logger.debug("Database session created")
        yield db
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        logger.debug("Database session closed")
        db.close()


def run_schema_migrations():
    """
    Ensure tables have all required columns by running safe migrations.
    
    SQLAlchemy's create_all() only creates missing TABLES, not missing COLUMNS.
    This function detects missing columns in existing tables and adds them via ALTER TABLE.
    Safe to run repeatedly — it only adds columns that don't already exist.
    """
    import sqlite3
    
    # Extract the file path from the DATABASE_URL (sqlite:///path/to/db)
    db_path = DATABASE_URL.replace("sqlite:///", "")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # --- Migration 1: Videos Table ---
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(videos)")
            existing_columns = {row[1] for row in cursor.fetchall()}
            
            video_columns = [
                ("status",       "TEXT DEFAULT 'processing'"),
                ("tags",         "TEXT"),           # JSON stored as TEXT in SQLite
                ("visibility",   "TEXT DEFAULT 'public'"),
                ("scheduled_at", "TEXT"),
                ("resolutions",  "TEXT DEFAULT '{}'"),  # JSON map of available resolutions
            ]
            
            for col_name, col_def in video_columns:
                if col_name not in existing_columns:
                    try:
                        cursor.execute(f"ALTER TABLE videos ADD COLUMN {col_name} {col_def}")
                        logger.info(f"  ✅ Added missing column: videos.{col_name}")
                    except Exception as e:
                        logger.warning(f"  ⚠️ Could not add videos.{col_name}: {e}")

        # --- Migration 2: Likes Table ---
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='likes'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(likes)")
            existing_columns = {row[1] for row in cursor.fetchall()}
            
            if "is_dislike" not in existing_columns:
                try:
                    cursor.execute("ALTER TABLE likes ADD COLUMN is_dislike BOOLEAN DEFAULT 0 NOT NULL")
                    logger.info("  ✅ Added missing column: likes.is_dislike")
                except Exception as e:
                    logger.warning(f"  ⚠️ Could not add likes.is_dislike: {e}")

        # --- Migration 3: Users Table (Stream Key & Metadata) ---
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(users)")
            existing_columns = {row[1] for row in cursor.fetchall()}
            
            user_columns = [
                ("is_verified", "BOOLEAN DEFAULT False NOT NULL"),
                ("verification_code", "VARCHAR(6)"),
                ("verification_expires_at", "DATETIME"),
                ("pending_email", "VARCHAR(100)"),
                ("channel_description", "TEXT"),
                ("channel_banner_url", "VARCHAR(255)"),
                ("stream_key", "VARCHAR(100)"),
                ("stream_title", "VARCHAR(100)"),
                ("stream_category", "VARCHAR(50) DEFAULT 'Gaming'"),
                ("stream_thumbnail", "VARCHAR(255)"),
                ("studio_bg_url", "VARCHAR(500)"),
                ("is_live", "BOOLEAN DEFAULT False NOT NULL"),
                ("is_staging", "BOOLEAN DEFAULT False NOT NULL"),
                ("viewer_count", "INTEGER DEFAULT 0"),
                ("tier", "INTEGER DEFAULT 1"),
                ("permissions", "TEXT")
            ]
            
            for col_name, col_def in user_columns:
                if col_name not in existing_columns:
                    try:
                        cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
                        logger.info(f"  ✅ Added missing column: users.{col_name}")
                    except Exception as e:
                        logger.warning(f"  ⚠️ Could not add users.{col_name}: {e}")

        # --- Migration 4: UserBackgrounds Table (Name field) ---
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_backgrounds'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(user_backgrounds)")
            existing_columns = {row[1] for row in cursor.fetchall()}
            
            if "name" not in existing_columns:
                try:
                    cursor.execute("ALTER TABLE user_backgrounds ADD COLUMN name VARCHAR(100)")
                    logger.info("  ✅ Added missing column: user_backgrounds.name")
                except Exception as e:
                    logger.warning(f"  ⚠️ Could not add user_backgrounds.name: {e}")

        conn.commit()
        conn.close()
        logger.info("Schema migration checks complete.")
            
    except Exception as e:
        logger.error(f"Schema migration failed: {e}")


def init_db():
    """
    Initialize the database by creating all tables.
    
    This should be called once when the application starts.
    It will create all tables defined in models.py.
    
    Usage:
    ```python
    from backend.database.connection import init_db
    
    if __name__ == "__main__":
        init_db()
        print("Database initialized successfully!")
    ```
    """
    from backend.database import models  # Import models to register them
    
    logger.info("Initializing database...")
    Base.metadata.create_all(bind=engine)
    run_schema_migrations()
    logger.info(f"Database initialized successfully at {DATABASE_URL}")


def drop_db():
    """
    Drop all tables from the database.
    
    ⚠️ WARNING: This will delete all data!
    Use only in development or for testing.
    
    Usage:
    ```python
    from backend.database.connection import drop_db
    
    if __name__ == "__main__":
        drop_db()
        print("All tables dropped!")
    ```
    """
    from backend.database import models  # Import models to register them
    
    logger.warning("Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("All tables dropped!")


def reset_db():
    """
    Reset the database by dropping and recreating all tables.
    
    ⚠️ WARNING: This will delete all data!
    Use only in development or for testing.
    
    Usage:
    ```python
    from backend.database.connection import reset_db
    
    if __name__ == "__main__":
        reset_db()
        print("Database reset complete!")
    ```
    """
    drop_db()
    init_db()
    logger.info("Database reset complete!")


# Test the connection
if __name__ == "__main__":
    try:
        # Test database connection
        logger.info("Testing database connection...")
        db = next(get_db())
        logger.info("✓ Database connection successful!")
        db.close()
        
        # Initialize database
        init_db()
        
    except Exception as e:
        logger.error(f"✗ Database connection failed: {e}")
