"""
Migration: Add 'resolutions' column to the videos table.
Run once: python -m backend.scripts.migrate_resolutions
"""

import sqlite3
import sys
from pathlib import Path

# Resolve DB path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "backend" / "database" / "utube.db"


def migrate():
    if not DB_PATH.exists():
        print(f"[ERROR] Database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("PRAGMA table_info(videos)")
    columns = [row[1] for row in cursor.fetchall()]

    if "resolutions" in columns:
        print("[INFO] Column 'resolutions' already exists. Nothing to do.")
        conn.close()
        return

    # Add the column
    cursor.execute("ALTER TABLE videos ADD COLUMN resolutions TEXT DEFAULT '{}'")
    conn.commit()
    print("[SUCCESS] Added 'resolutions' column to videos table.")
    conn.close()


if __name__ == "__main__":
    migrate()
