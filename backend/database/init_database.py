"""
Database Initialization Script
-------------------------------
Run this script to create all database tables.

Usage:
    python -m backend.database.init_database
"""

from backend.database.connection import init_db, engine
from backend.database.models import User, Video, Comment
from backend.core.config import DATABASE_FILE

if __name__ == "__main__":
    print("=" * 60)
    print("uTube Database Initialization")
    print("=" * 60)
    print(f"\nDatabase location: {DATABASE_FILE}")
    print("\nCreating tables for models:")
    print("  - User")
    print("  - Video")
    print("  - Comment")
    print("\n" + "-" * 60)
    
    # Initialize database (create all tables)
    init_db()
    
    print("-" * 60)
    print("\n✓ Database initialized successfully!")
    print(f"\nYou can now use the database at: {DATABASE_FILE}")
    print("\nNext steps:")
    print("  1. Create your first user")
    print("  2. Upload videos")
    print("  3. Add comments")
    print("\n" + "=" * 60)
