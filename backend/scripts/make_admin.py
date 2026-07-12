"""
Admin Bootstrap Script
-----------------------
Use this script to grant or revoke admin privileges for any user.

Usage:
    python -m backend.scripts.make_admin --email user@example.com
    python -m backend.scripts.make_admin --email user@example.com --revoke
"""

import argparse
import sys
from pathlib import Path

# Allow running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.database.connection import SessionLocal, init_db
from backend.database.models import User


def main():
    parser = argparse.ArgumentParser(description="Grant or revoke admin privileges for a user.")
    parser.add_argument("--email", required=True, help="Email address of the user to promote/demote")
    parser.add_argument("--revoke", action="store_true", help="Revoke admin privileges instead of granting them")
    args = parser.parse_args()

    # Ensure tables exist
    init_db()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email).first()
        if not user:
            print(f"[ERROR] No user found with email: {args.email}")
            sys.exit(1)

        if args.revoke:
            user.is_admin = False
            action = "revoked"
        else:
            user.is_admin = True
            action = "granted"

        db.commit()
        print(f"[OK] Admin privileges {action} for user: @{user.username} ({user.email})")
        print(f"     is_admin = {user.is_admin}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
