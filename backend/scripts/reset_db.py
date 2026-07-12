"""
Database Reset Script - Phase 5 Migration
------------------------------------------
Drops and recreates the Video table to accommodate the new schema.

WARNING: This will DELETE all video records but preserve users, comments, and likes.

Usage:
    python backend/reset_db.py
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.database.connection import engine
from backend.database.models import Video
from sqlalchemy import inspect

def reset_video_table():
    """Drop and recreate the Video table."""
    print("=" * 70)
    print("Phase 5 Database Migration - Video Table Reset")
    print("=" * 70)
    
    try:
        # Check if table exists
        inspector = inspect(engine)
        table_exists = 'videos' in inspector.get_table_names()
        
        if table_exists:
            print("\n[INFO] Dropping existing 'videos' table...")
            Video.__table__.drop(engine)
            print("[SUCCESS] 'videos' table dropped")
        else:
            print("\n[INFO] 'videos' table does not exist")
        
        # Recreate table with new schema
        print("[INFO] Creating 'videos' table with Phase 5 schema...")
        Video.__table__.create(engine)
        print("[SUCCESS] 'videos' table created with:")
        print("  ✅ tags: JSON (recommendation-ready)")
        print("  ✅ visibility: String (public/unlisted/private)")
        print("  ✅ scheduled_at: DateTime (publication scheduling)")
        
        print("\n" + "=" * 70)
        print("🚀 Migration Complete! Backend is Recommendation-Ready")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    confirm = input("\n⚠️  WARNING: This will DELETE all video records. Continue? (yes/no): ")
    if confirm.lower() == 'yes':
        reset_video_table()
    else:
        print("[INFO] Migration cancelled")
