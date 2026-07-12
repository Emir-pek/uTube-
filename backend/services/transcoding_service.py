"""
Transcoding Service
-------------------
Background video transcoding using FFmpeg.
Generates multiple resolution variants (144p, 360p, 720p, 1080p) for adaptive playback.
"""

import subprocess
import os
import json
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# Resolution targets: label → (width, height)
RESOLUTION_TARGETS = {
    "144p": (256, 144),
    "360p": (640, 360),
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}


def get_ffmpeg_path() -> str:
    """
    Find FFmpeg executable via system PATH or FFMPEG_PATH env var.
    Returns the resolved path if found, otherwise returns 'ffmpeg'
    so that downstream calls produce a clear FileNotFoundError.
    """
    env_path = os.getenv("FFMPEG_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    path = shutil.which("ffmpeg")
    if path:
        return path
    logger.warning("FFmpeg not found in system PATH or FFMPEG_PATH env var.")
    return "ffmpeg"


def get_ffprobe_path() -> str:
    """
    Find FFprobe executable via FFPROBE_PATH env var or system PATH.
    Returns the resolved path if found, otherwise returns 'ffprobe'.
    """
    env_path = os.getenv("FFPROBE_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    path = shutil.which("ffprobe")
    if path:
        return path
    logger.warning("FFprobe not found in system PATH or FFPROBE_PATH env var.")
    return "ffprobe"


def is_ffmpeg_available() -> bool:
    """Check if FFmpeg is installed and accessible."""
    try:
        result = subprocess.run(
            [get_ffmpeg_path(), "-version"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def check_ffmpeg_on_startup():
    """
    Called at module load to log FFmpeg availability.
    Provides an immediate, visible warning in the terminal if FFmpeg is missing.
    """
    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")

    if ffmpeg_path and ffprobe_path:
        print(f"✅ [STARTUP] FFmpeg found: {ffmpeg_path}")
        print(f"✅ [STARTUP] FFprobe found: {ffprobe_path}")
        logger.info(f"FFmpeg found: {ffmpeg_path}")
        logger.info(f"FFprobe found: {ffprobe_path}")
    else:
        if not ffmpeg_path:
            print("=" * 70)
            print("⚠️  FFmpeg is not installed or not found in PATH.")
            print("   Video transcoding will be DISABLED.")
            print("   Install: https://ffmpeg.org/download.html")
            print("   Or via conda: conda install -c conda-forge ffmpeg")
            print("=" * 70)
            logger.warning("FFmpeg is not installed or not found in PATH. Transcoding disabled.")
        if not ffprobe_path:
            print("⚠️  FFprobe is not installed or not found in PATH.")
            logger.warning("FFprobe is not installed or not found in PATH.")


# Run check at import time so the warning appears when the server starts
check_ffmpeg_on_startup()


def probe_video_resolution(video_path: str) -> dict:
    """
    Use ffprobe to get the original video's width and height.
    Returns {"width": int, "height": int} or empty dict on failure.
    """
    ffprobe_path = get_ffprobe_path()
    print(f"[FFPROBE] Using executable: {ffprobe_path}")
    print(f"[FFPROBE] Probing file: {video_path}")

    try:
        cmd = [
            ffprobe_path,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "json",
            video_path
        ]
        print(f"[FFPROBE] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            logger.error(f"ffprobe failed (code {result.returncode}): {result.stderr}")
            print(f"❌ [FFPROBE ERROR] Exit code {result.returncode}")
            print(f"--- ffprobe STDERR ---\n{result.stderr}\n----------------------")
            return {}

        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        if streams:
            width = int(streams[0].get("width", 0))
            height = int(streams[0].get("height", 0))
            print(f"✅ [FFPROBE] Detected resolution: {width}x{height}")
            return {"width": width, "height": height}
        else:
            print("❌ [FFPROBE] No video streams found in ffprobe output.")
            logger.error("ffprobe returned no video streams.")
            return {}

    except FileNotFoundError:
        logger.error(f"FFprobe executable not found at '{ffprobe_path}'.")
        print(f"❌ [FFPROBE ERROR] Executable not found at '{ffprobe_path}'.")
        print("   Fix: Set the FFPROBE_PATH environment variable to the full path of ffprobe.")
        print("   Example: set FFPROBE_PATH=C:\\ffmpeg\\bin\\ffprobe.exe")
    except subprocess.TimeoutExpired:
        logger.error("ffprobe timed out after 30 seconds.")
        print("❌ [FFPROBE ERROR] Timed out after 30 seconds.")
    except json.JSONDecodeError as e:
        logger.error(f"ffprobe returned invalid JSON: {e}")
        print(f"❌ [FFPROBE ERROR] Could not parse output as JSON: {e}")
    except Exception as e:
        logger.error(f"ffprobe unexpected error: {e}")
        print(f"❌ [FFPROBE ERROR] Unexpected error: {e}")
    return {}


def transcode_single(source_path: str, output_path: str, width: int, height: int) -> bool:
    """
    Transcode a video to a specific resolution using FFmpeg.
    Uses scale filter with aspect ratio preservation (scale=W:-2 ensures even height).
    """
    try:
        # Ensure the output directory exists before writing
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        cmd = [
            get_ffmpeg_path(),
            "-i", source_path,
            "-vf", f"scale={width}:-2",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-y",  # Overwrite output
            output_path
        ]
        logger.info(f"[TRANSCODE] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

        if result.returncode != 0:
            error_msg = result.stderr if result.stderr else "Unknown FFmpeg error"
            logger.error(f"[TRANSCODE] FFmpeg error for {output_path}: {error_msg}")
            print(f"❌ [TRANSCODE ERROR] FFmpeg failed with code {result.returncode} for {output_path}")
            print(f"--- FFmpeg STDERR ---\n{error_msg}\n---------------------")
            return False

        logger.info(f"[TRANSCODE] Successfully created: {output_path}")
        print(f"✅ [TRANSCODE SUCCESS] {output_path}")
        return True
    except FileNotFoundError:
        logger.error("[TRANSCODE] FFmpeg executable not found.")
        print("=" * 70)
        print("⚠️  FFmpeg is not installed or not found in PATH.")
        print("   Cannot transcode video. Install FFmpeg first:")
        print("   https://ffmpeg.org/download.html")
        print("=" * 70)
        return False
    except subprocess.TimeoutExpired:
        logger.error(f"[TRANSCODE] Timeout transcoding to {output_path}")
        print(f"❌ [TRANSCODE ERROR] Timeout on {output_path}")
        return False
    except OSError as e:
        logger.error(f"[TRANSCODE] OS Error executing FFmpeg: {e}")
        print(f"❌ [TRANSCODE ERROR] OS Error executing FFmpeg: {e}")
        return False
    except Exception as e:
        logger.error(f"[TRANSCODE] Unexpected Exception: {e}")
        print(f"❌ [TRANSCODE ERROR] Unexpected Exception: {e}")
        return False


def transcode_video(video_id: int, source_path: str, videos_dir: str, db_session_factory):
    """
    Main transcoding function — runs in a background thread.
    
    Args:
        video_id: Database ID of the video
        source_path: Absolute path to the original video file
        videos_dir: Base directory for video storage (VIDEOS_DIR)
        db_session_factory: SQLAlchemy sessionmaker to create a new DB session
    """
    # Ensure absolute paths
    source_path = str(Path(source_path).resolve())
    videos_dir = str(Path(videos_dir).resolve())

    # Ensure the base videos directory exists (handles fresh git clone)
    os.makedirs(videos_dir, exist_ok=True)
    
    print(f"\n[TRANSCODE] Starting background job for video {video_id}")
    print(f"[TRANSCODE] Source path: {source_path}")
    print(f"[TRANSCODE] Storage dir: {videos_dir}")

    if not is_ffmpeg_available():
        print("=" * 70)
        print("⚠️  FFmpeg is not installed or not found in PATH.")
        print("   Skipping transcoding. Only original resolution will be available.")
        print("   Install: https://ffmpeg.org/download.html")
        print("=" * 70)
        logger.warning("FFmpeg not available. Skipping transcoding for video %d.", video_id)
        # Mark Video as ready with original only
        _update_resolutions(video_id, db_session_factory, {"original": os.path.basename(source_path)}, status="published")
        return

    # 1. Probe original resolution
    info = probe_video_resolution(source_path)
    original_height = info.get("height", 0)
    print(f"[TRANSCODE] Original resolution: {info.get('width', '?')}x{original_height}")

    if original_height == 0:
        print("[TRANSCODE] Could not determine resolution via ffprobe. Keeping original only to prevent upscaling.")
        _update_resolutions(video_id, db_session_factory, {"original": os.path.basename(source_path)}, status="published")
        return

    # 2. Create per-video output directory
    output_dir = Path(videos_dir) / str(video_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 3. Start with original in the resolutions map
    resolutions = {"original": os.path.basename(source_path)}

    # Update status to transcoding
    _update_resolutions(video_id, db_session_factory, resolutions, status="transcoding")

    # 4. Transcode each target that is <= original height
    for label, (target_w, target_h) in RESOLUTION_TARGETS.items():
        if target_h > original_height:
            print(f"[TRANSCODE] Skipping {label} (target {target_h}p > original {original_height}p)")
            continue

        output_filename = f"{label}.mp4"
        output_path = str(output_dir / output_filename)

        success = transcode_single(source_path, output_path, target_w, target_h)
        if success:
            # Store path relative to videos_dir:  "{video_id}/{label}.mp4"
            resolutions[label] = f"{video_id}/{output_filename}"
            # Update DB after each successful transcode so frontend can see progress
            _update_resolutions(video_id, db_session_factory, resolutions, status="transcoding")
        else:
            print(f"[TRANSCODE] Failed to create {label} for video {video_id}")

    # 5. Mark as fully published
    _update_resolutions(video_id, db_session_factory, resolutions, status="published")
    print(f"[TRANSCODE] Completed transcoding for video {video_id}. Resolutions: {list(resolutions.keys())}")


def _update_resolutions(video_id: int, db_session_factory, resolutions: dict, status: str = None):
    """Helper to update the video's resolutions and status in a new DB session."""
    try:
        from backend.database.models import Video
        db = db_session_factory()
        try:
            video = db.query(Video).filter(Video.id == video_id).first()
            if video:
                video.resolutions = resolutions
                if status:
                    video.status = status
                db.commit()
                print(f"[TRANSCODE] Updated DB for video {video_id}: resolutions={list(resolutions.keys())}, status={status}")
        finally:
            db.close()
    except Exception as e:
        print(f"[TRANSCODE] DB update error: {e}")
