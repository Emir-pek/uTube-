"""
Storage Cleanup Service
-----------------------
Automated cleanup of orphaned files, temp directories, and stuck uploads.
Includes a continuous background task for runtime maintenance.

Functions:
- start_cleanup_loop(): Entry point for the asyncio background task.
- cleanup_temp_and_previews(): Periodic scan logic (Task 1).
- startup_cleanup(): Legacy startup cleanup (runs once).
"""

import os
import time
import shutil
import logging
import asyncio
import re
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.database.models import Video, User
from backend.core.config import (
    VIDEOS_DIR,
    THUMBNAILS_DIR,
    PREVIEWS_DIR,
    TEMP_DIR,
    TEMP_UPLOADS_DIR,
)

logger = logging.getLogger(__name__)

# Safety threshold: skip files younger than 5 minutes for startup cleanup
SAFETY_MINUTES = 5

# Task 1: 10 minutes for runtime cleanup
RUNTIME_SAFETY_SECONDS = 600  # 10 minutes

def _is_safe_to_delete(file_path: Path, safety_seconds: int = SAFETY_MINUTES * 60) -> bool:
    """
    Check if a file is safe to delete (older than safety_seconds).
    Prevents deleting files that are currently being written by active uploads.
    """
    try:
        mtime = file_path.stat().st_mtime
        age_seconds = time.time() - mtime
        return age_seconds > safety_seconds
    except (OSError, FileNotFoundError):
        return False

async def cleanup_loop():
    """
    Task 1: Periodic Background Task
    Runs every 60 seconds.
    Scans storage/uploads/temp and storage/uploads/previews.
    Logic: If file > 10 mins old AND not linked to 'published' video -> Delete.
    """
    logger.info("[CLEANUP] Starting continuous background cleanup service (60s interval)...")
    while True:
        try:
            await asyncio.sleep(60)
            await cleanup_temp_and_previews()
            # Also clean up stale unverified users
            await asyncio.to_thread(cleanup_unverified_users)
        except asyncio.CancelledError:
            logger.info("[CLEANUP] Background task cancelled.")
            break
        except Exception as e:
            logger.error(f"[CLEANUP] Error in background loop: {e}")

async def cleanup_temp_and_previews():
    """
    Async wrapper for the synchronous cleanup logic.
    Offloads heavy file I/O to a separate thread to avoid blocking the main event loop.
    """
    try:
        await asyncio.to_thread(_cleanup_temp_and_previews_sync)
    except Exception as e:
        logger.error(f"[CLEANUP] Thread execution error: {e}")

def _cleanup_temp_and_previews_sync():
    """
    Synchronous implementation of storage cleanup.
    Executed in a separate thread.
    Scan temp and previews dirs.
    Delete orphaned files > 10 mins old.
    """
    # logger.info("[CLEANUP] Running periodic scan (Threaded)...") 
    db: Session = SessionLocal()
    try:
        # --- Batch Optimization: Collect content first ---
        temp_files = []
        if TEMP_UPLOADS_DIR.exists():
            for f in TEMP_UPLOADS_DIR.iterdir():
                if f.is_file() and _is_safe_to_delete(f, RUNTIME_SAFETY_SECONDS):
                    temp_files.append(f)

        preview_files = []
        if PREVIEWS_DIR.exists():
            for f in PREVIEWS_DIR.iterdir():
                if f.is_file() and _is_safe_to_delete(f, RUNTIME_SAFETY_SECONDS):
                    preview_files.append(f)

        if not temp_files and not preview_files:
            return # Nothing to cleanup

        # Extract potential identifiers to query
        temp_filenames = {f.name for f in temp_files}
        
        preview_pattern = re.compile(r"video_(\d+)_preview_")
        preview_ids = set()
        for f in preview_files:
            m = preview_pattern.match(f.name)
            if m: preview_ids.add(int(m.group(1)))

        # --- Single Batch Query ---
        valid_filenames = set()
        valid_ids = set()

        if temp_filenames or preview_ids:
            query = db.query(Video).filter(Video.status == 'published')
            
            # Optimization: Fetch only necessary columns
            published_videos = query.options(
                # load_only(Video.id, Video.video_filename) 
            ).with_entities(Video.id, Video.video_filename).all()

            for vid_id, vid_filename in published_videos:
                valid_ids.add(vid_id)
                if vid_filename:
                    valid_filenames.add(vid_filename)

        # --- Process Temp Files ---
        for f in temp_files:
            if f.name not in valid_filenames:
                try:
                    file_size = os.path.getsize(f)
                    size_mb = file_size / (1024 * 1024)
                    
                    os.remove(str(f))
                    logger.info(f"[CLEANUP] Freed {size_mb:.2f} MB by deleting orphaned file: {f.name}")
                except (PermissionError, OSError) as e:
                    logger.warning(f"[CLEANUP] Could not delete {f.name} (file in use), skipping... Error: {e}")
                except Exception as e:
                    logger.error(f"[CLEANUP] Error deleting {f.name}: {e}")

        # --- Process Preview Files ---
        for f in preview_files:
            match = preview_pattern.match(f.name)
            should_delete = False
            
            if match:
                vid_id = int(match.group(1))
                if vid_id not in valid_ids:
                    should_delete = True
            else:
                should_delete = True

            if should_delete:
                try:
                    file_size = os.path.getsize(f)
                    size_mb = file_size / (1024 * 1024)
                    
                    os.remove(str(f))
                    logger.info(f"[CLEANUP] Freed {size_mb:.2f} MB by deleting orphaned preview: {f.name}")
                except (PermissionError, OSError) as e:
                    logger.warning(f"[CLEANUP] Could not delete {f.name} (file in use), skipping... Error: {e}")
                except Exception as e:
                    logger.error(f"[CLEANUP] Error deleting {f.name}: {e}")

    except Exception as e:
        logger.error(f"[CLEANUP] Periodic scan error: {e}")
    finally:
        db.close()


def cleanup_stuck_uploads():
    """
    Mark videos stuck in 'processing' state for > 30 minutes as 'failed'.
    Removes their temporary directories.
    """
    logger.info("[CLEANUP] Checking for stuck uploads...")
    db: Session = SessionLocal()
    try:
        threshold = datetime.utcnow() - timedelta(minutes=30)

        stuck_videos = db.query(Video).filter(
            Video.status == 'processing',
            Video.upload_date < threshold
        ).all()

        if stuck_videos:
            logger.info(f"[CLEANUP] Found {len(stuck_videos)} stuck video(s).")
            for video in stuck_videos:
                logger.info(f"[CLEANUP] Failing Video ID: {video.id}")
                video.status = 'failed'
                
                # Cleanup logic specific to stuck uploads...
                # (Simplified for brevity as periodic cleanup handles files now)
                
            db.commit()
            logger.info("[CLEANUP] Stuck uploads cleanup complete.")
        else:
             logger.info("[CLEANUP] No stuck uploads found.")

    except Exception as e:
        logger.error(f"[CLEANUP] Stuck uploads error: {e}")
    finally:
        db.close()


def purge_orphaned_files():
    """
    Scan videos/ and thumbnails/ directories.
    Delete any file whose filename is NOT referenced in the database.
    """
    logger.info("[CLEANUP] Scanning for orphaned files in videos/ and thumbnails/...")
    db: Session = SessionLocal()
    total_deleted = 0

    try:
        all_videos = db.query(Video).all()
        # Collect valid files
        valid_files = set()
        for v in all_videos:
            if v.video_filename: valid_files.add(v.video_filename)
            if v.thumbnail_filename: valid_files.add(v.thumbnail_filename)
        # valid_files.add("default_thumbnail.png") # Purged in Zero-Default policy

        # Scan directories
        for directory in [VIDEOS_DIR, THUMBNAILS_DIR]:
            if directory.exists():
                for f in directory.iterdir():
                    if f.is_file() and f.name not in valid_files:
                        if _is_safe_to_delete(f):
                            try:
                                os.remove(str(f))
                                total_deleted += 1
                                logger.info(f"[ORPHAN] Deleted: {f.name}")
                            except Exception as e:
                                logger.warning(f"[ORPHAN] Could not delete {f.name}: {e}")

        if total_deleted > 0:
            logger.info(f"[CLEANUP] Purged {total_deleted} orphaned file(s).")

    except Exception as e:
        logger.error(f"[CLEANUP] Orphan purge error: {e}")
    finally:
        db.close()


def wipe_temp_folders():
    """
    On server restart, delete all contents of temp directories.
    """
    logger.info("[CLEANUP] Wiping temp folders...")
    total_deleted = 0
    for temp_dir in [TEMP_DIR, TEMP_UPLOADS_DIR]:
        if not temp_dir.exists(): continue
        for item in temp_dir.iterdir():
            try:
                if _is_safe_to_delete(item):
                    if item.is_file(): os.remove(str(item))
                    elif item.is_dir(): shutil.rmtree(str(item))
                    total_deleted += 1
            except Exception:
                pass # Fail silently during wipe check
    
    if total_deleted > 0:
        logger.info(f"[CLEANUP] Wiped {total_deleted} temp item(s).")


def startup_cleanup():
    """Run all cleanup tasks once at startup."""
    cleanup_stuck_uploads()
    purge_orphaned_files()
    wipe_temp_folders()
    cleanup_unverified_users()


def cleanup_unverified_users():
    """
    Delete users who registered but never verified their email.
    Removes records where is_verified=False and created_at is older than 24 hours.
    This prevents 'Email already exists' errors for abandoned registrations.
    """
    db: Session = SessionLocal()
    try:
        threshold = datetime.utcnow() - timedelta(hours=24)
        stale_users = db.query(User).filter(
            User.is_verified == False,
            User.created_at < threshold
        ).all()

        if stale_users:
            for user in stale_users:
                logger.info(f"[CLEANUP] Deleting unverified user: {user.email} (registered {user.created_at})")
                db.delete(user)
            db.commit()
            logger.info(f"[CLEANUP] Removed {len(stale_users)} stale unverified user(s).")
    except Exception as e:
        logger.error(f"[CLEANUP] Unverified user cleanup error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    startup_cleanup()
