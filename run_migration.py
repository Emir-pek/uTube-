import sys
import os

# Add project root to sys.path
project_root = r"c:\Users\smila\Desktop\Project github\uTube"
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.database.connection import run_schema_migrations

if __name__ == "__main__":
    print("Running schema migrations...")
    run_schema_migrations()
    print("Migration complete!")
