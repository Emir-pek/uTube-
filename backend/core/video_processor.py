"""
Video Processing Utilities
---------------------------
Handles video file processing, thumbnail generation, and metadata extraction.

Features:
- Automatic thumbnail generation from video
- Video metadata extraction (duration, resolution)
- File validation and sanitization
"""

import os
import uuid
import subprocess
from pathlib import Path
from typing import Optional, Tuple
import logging

from backend.core.config import (
    VIDEOS_DIR,
    THUMBNAILS_DIR,
    TEMP_DIR,
    TEMP_UPLOADS_DIR,
    ALLOWED_VIDEO_FORMATS,
    MAX_VIDEO_SIZE_MB
)
from backend.core.security import secure_resolve

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_unique_filename(original_filename: str) -> str:
    """
    Generate a unique filename using UUID while preserving the extension.
    
    Args:
        original_filename: Original filename from upload
        
    Returns:
        Unique filename with original extension
        
    Example:
        >>> generate_unique_filename("my_video.mp4")
        "a3b8d1b6-0b3b-4b1a-9c1a-1a2b3c4d5e6f.mp4"
    """
    extension = Path(original_filename).suffix.lower()
    unique_id = str(uuid.uuid4())
    return f"{unique_id}{extension}"


def validate_video_file(filename: str, file_size: int) -> Tuple[bool, str]:
    """
    Validate video file format and size.
    
    Args:
        filename: Name of the file
        file_size: Size of the file in bytes
        
    Returns:
        Tuple of (is_valid, error_message)
        
    Example:
        >>> validate_video_file("video.mp4", 1024 * 1024 * 10)  # 10MB
        (True, "")
        >>> validate_video_file("video.exe", 1024)
        (False, "Invalid file format. Allowed formats: .mp4, .avi, .mov, .mkv, .webm")
    """
    # Check file extension
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_VIDEO_FORMATS:
        return False, f"Invalid file format. Allowed formats: {', '.join(ALLOWED_VIDEO_FORMATS)}"
    
    # Check file size
    max_size_bytes = MAX_VIDEO_SIZE_MB * 1024 * 1024
    if file_size > max_size_bytes:
        return False, f"File too large. Maximum size: {MAX_VIDEO_SIZE_MB}MB"
    
    return True, ""


def get_video_duration(video_path: str) -> Optional[float]:
    """
    Extract video duration using cv2 (OpenCV).
    """
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        cap.release()
        
        if fps > 0 and frame_count > 0:
            return float(frame_count / fps)
        else:
            logger.error(f"cv2 error: Invalid fps ({fps}) or frame_count ({frame_count})")
            return None
            
    except Exception as e:
        logger.error(f"Error extracting duration with cv2: {e}")
        return None


def generate_thumbnail(video_path: str, thumbnail_path: str, timestamp: float = 1.0) -> bool:
    """
    Generate a thumbnail from a video using OpenCV instead of FFmpeg.
    """
    try:
        import cv2
        # Ensure thumbnail directory exists
        Path(thumbnail_path).parent.mkdir(parents=True, exist_ok=True)
        
        video = cv2.VideoCapture(video_path)
        fps = video.get(cv2.CAP_PROP_FPS)
        frame_number = int(timestamp * fps) if fps > 0 else 30
        
        video.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        success, frame = video.read()
        
        if success:
            height, width = frame.shape[:2]
            new_width = 320
            new_height = int(height * (new_width / width))
            resized = cv2.resize(frame, (new_width, new_height))
            
            cv2.imwrite(thumbnail_path, resized)
            video.release()
            logger.info(f"Thumbnail generated: {thumbnail_path}")
            return True
        else:
            video.release()
            logger.error("Failed to read video frame for thumbnail")
            return False
            
    except ImportError:
        logger.error("OpenCV not installed, unable to generate thumbnail")
        return False
    except Exception as e:
        logger.error(f"Error generating thumbnail with OpenCV: {e}")
        return False


def generate_preview_frames(video_path: str, output_dir: str, video_id: int, count: int = 3) -> list:
    """
    Extract 3 high-quality frames from video for thumbnail selection.
    Uses OpenCV instead of FFmpeg.
    """
    try:
        import cv2
        # Validate video path - Check TEMP/STAGING first!
        src_path = Path(video_path)
        if not src_path.exists():
            try:
                temp_path = secure_resolve(TEMP_UPLOADS_DIR, video_path)
                if temp_path.exists():
                    src_path = temp_path
                    logger.info(f"Video found in TEMP staging: {src_path}")
                else:
                    raise FileNotFoundError
            except (Exception, FileNotFoundError):
                try:
                    perm_path = secure_resolve(VIDEOS_DIR, video_path)
                    if perm_path.exists():
                        src_path = perm_path
                        logger.info(f"Video found in VIDEOS storage: {src_path}")
                    else:
                        raise FileNotFoundError
                except (Exception, FileNotFoundError):
                    logger.error(f"Video file not found or access denied: {video_path}")
                    return []
        
        duration = get_video_duration(str(src_path))
        if not duration or duration < 1:
            logger.warning(f"Invalid video duration: {duration}")
            return []
        
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        percentages = [0.33, 0.66, 0.90]
        timestamps = [duration * p for p in percentages]
        
        preview_frames = []
        cap = cv2.VideoCapture(str(src_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        for i, timestamp in enumerate(timestamps, 1):
            frame_num = int(timestamp * fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            success, frame = cap.read()
            if success:
                filename = f"video_{video_id}_preview_{i}.jpg"
                output_path = os.path.join(output_dir, filename)
                
                height, width = frame.shape[:2]
                new_width = 1280
                new_height = int(height * (new_width / width))
                resized = cv2.resize(frame, (new_width, new_height))
                cv2.imwrite(output_path, resized)
                
                preview_frames.append(filename)
                logger.info(f"Preview frame {i} generated at {timestamp:.2f}s: {filename}")
            else:
                logger.error(f"Failed to generate preview {i} at timestamp {timestamp}")
                
        cap.release()
        return preview_frames
        
    except ImportError:
        logger.error("OpenCV not installed, unable to generate previews")
        return []
    except Exception as e:
        logger.error(f"Error generating preview frames with OpenCV: {e}")
        return []



def generate_thumbnail_opencv(video_path: str, thumbnail_path: str, frame_number: int = 30) -> bool:
    """
    Generate a thumbnail using OpenCV (alternative to FFmpeg).
    
    Args:
        video_path: Path to the source video file
        thumbnail_path: Path where thumbnail should be saved
        frame_number: Frame number to capture (default: 30)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        import cv2
        
        # Open video file
        video = cv2.VideoCapture(video_path)
        
        # Set frame position
        video.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        
        # Read frame
        success, frame = video.read()
        
        if success:
            # Resize frame
            height, width = frame.shape[:2]
            new_width = 320
            new_height = int(height * (new_width / width))
            resized = cv2.resize(frame, (new_width, new_height))
            
            # Save thumbnail
            cv2.imwrite(thumbnail_path, resized)
            video.release()
            logger.info(f"Thumbnail generated with OpenCV: {thumbnail_path}")
            return True
        else:
            video.release()
            logger.error("Failed to read video frame")
            return False
            
    except ImportError:
        logger.warning("OpenCV not installed, falling back to FFmpeg")
        return generate_thumbnail(video_path, thumbnail_path)
    except Exception as e:
        logger.error(f"Error generating thumbnail with OpenCV: {e}")
        return False


def cleanup_file(file_path: str) -> None:
    """
    Safely delete a file.
    
    Args:
        file_path: Path to the file to delete
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up file: {file_path}")
    except Exception as e:
        logger.error(f"Error cleaning up file {file_path}: {e}")


def cleanup_preview_frames(video_id: int, preview_dir: str) -> None:
    """
    Delete all preview frames for a specific video ID.
    Used after upload completion to save storage space.
    
    Args:
        video_id: Video ID whose preview frames should be deleted
        preview_dir: Directory containing preview frames
        
    Example:
        >>> cleanup_preview_frames(123, "previews/")
        # Deletes: video_123_preview_1.jpg through video_123_preview_5.jpg
    """
    try:
        pattern = f"video_{video_id}_preview_*.jpg"
        preview_path = Path(preview_dir)
        
        if not preview_path.exists():
            logger.warning(f"Preview directory does not exist: {preview_dir}")
            return
        
        # Find and delete all matching preview frames
        deleted_count = 0
        for frame_file in preview_path.glob(pattern):
            try:
                frame_file.unlink()
                deleted_count += 1
                logger.info(f"Deleted preview frame: {frame_file.name}")
            except Exception as e:
                logger.error(f"Failed to delete {frame_file.name}: {e}")
        
        if deleted_count > 0:
            logger.info(f"Cleanup complete: Deleted {deleted_count} preview frames for video {video_id}")
        else:
            logger.warning(f"No preview frames found for video {video_id}")
            
    except Exception as e:
        logger.error(f"Error during preview frame cleanup for video {video_id}: {e}")


def get_video_metadata(video_path: str) -> dict:
    """
    Extract comprehensive video metadata using OpenCV.
    """
    metadata = {
        "duration": None,
        "width": None,
        "height": None,
        "codec": None,
        "bitrate": None
    }
    
    try:
        import cv2
        metadata["duration"] = get_video_duration(video_path)
        
        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            metadata["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            metadata["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            # OpenCV doesn't easily provide codec name or bitrate without parsing fourcc
            cap.release()
            
    except Exception as e:
        logger.error(f"Error extracting metadata: {e}")
    
    return metadata


# Test the video processor
if __name__ == "__main__":
    print("Video Processor Utilities")
    print("=" * 60)
    
    # Test filename generation
    print("\n1. Unique Filename Generation:")
    filename = generate_unique_filename("my_video.mp4")
    print("   Original: my_video.mp4")
    print(f"   Unique: {filename}")
    
    # Test file validation
    print("\n2. File Validation:")
    test_files = [
        ("video.mp4", 10 * 1024 * 1024),  # 10MB
        ("video.exe", 1024),  # Invalid format
        ("large.mp4", 600 * 1024 * 1024),  # Too large
    ]
    for fname, fsize in test_files:
        valid, msg = validate_video_file(fname, fsize)
        status = "✓" if valid else "✗"
        print(f"   {status} {fname} ({fsize / 1024 / 1024:.1f}MB): {msg if msg else 'Valid'}")
    
    print("\n" + "=" * 60)
    print("Note: FFmpeg must be installed for thumbnail generation and metadata extraction")
    print("Install: https://ffmpeg.org/download.html")
