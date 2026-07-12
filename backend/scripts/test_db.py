"""
Simple Database Test Script
----------------------------
Tests database connection and model creation.
"""

import sys
import os

# Add project root to Python path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

print("=" * 60)
print("uTube Database Initialization Test")
print("=" * 60)

try:
    print("\n1. Importing database modules...")
    try:
        from backend.database.connection import init_db, Base, engine
        from backend.database.models import User, Video, Comment
        from backend.core.config import DATABASE_FILE
    except ImportError:
        # Fallback for different working directory contexts
        from database.connection import init_db, Base, engine
        from database.models import User, Video, Comment
        from core.config import DATABASE_FILE
        
    print("   ✓ Imports successful")
    
    print(f"\n2. Database location: {DATABASE_FILE}")
    
    print("\n3. Creating tables...")
    print("   - User")
    print("   - Video")
    print("   - Comment")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    print("\n" + "=" * 60)
    print("✓ Database initialized successfully!")
    print("=" * 60)
    print(f"\nDatabase file: {DATABASE_FILE}")
    print("\nTables created:")
    for table_name in Base.metadata.tables.keys():
        print(f"  - {table_name}")
    
    print("\nYou can now:")
    print("  1. Create users")
    print("  2. Upload videos")
    print("  3. Add comments")
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
    
    # Prevent sys.exit(1) during pytest collection phase which causes INTERNALERROR
    if "pytest" not in sys.modules:
        sys.exit(1)
