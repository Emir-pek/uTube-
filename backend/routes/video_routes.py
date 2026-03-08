"""
Video Routes
------------
Handles video upload, retrieval, and management.

Endpoints:
- POST /videos: Upload a new video (protected)
- GET /videos: Get all videos (feed)
- GET /videos/{video_id}: Get specific video details
- DELETE /videos/{video_id}: Delete a video (protected)
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Any, Union
from datetime import datetime
import os
import shutil
import json
import logging
import threading
from pathlib import Path

# Set up logging
logger = logging.getLogger(__name__)

from backend.database import get_db
from backend.database.models import User, Video
from backend.routes.auth_routes import get_current_user, get_optional_user
from backend.core.video_processor import (
    generate_unique_filename,
    validate_video_file,
    generate_thumbnail,
    get_video_duration,
    cleanup_file,
    get_video_metadata,
    generate_preview_frames,
    cleanup_preview_frames
)
from backend.services.embedding_service import generate_embedding, compute_cosine_similarity
from backend.core.config import VIDEOS_DIR, THUMBNAILS_DIR, PREVIEWS_DIR, TEMP_UPLOADS_DIR
from backend.core.security import secure_resolve
from backend.services.transcoding_service import transcode_video
from backend.database.connection import SessionLocal

# Create router
router = APIRouter(prefix="/videos", tags=["Videos"])


# ============================================================================
# Pydantic Models (Request/Response Schemas)
# ============================================================================

class AuthorResponse(BaseModel):
    """Response model for user/author information."""
    id: int
    username: str
    profile_image: Optional[str] = None
    video_count: Optional[int] = 0

    class Config:
        from_attributes = True

class VideoUploadResponse(BaseModel):
    """Response model for video upload."""
    id: int
    title: str
    description: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    view_count: int
    upload_date: str
    author: AuthorResponse
    preview_frames: List[str] = []  # 3 preview frames for thumbnail selection
    
    class Config:
        from_attributes = True


class VideoListResponse(BaseModel):
    """Response model for video list."""
    id: int
    title: str
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    view_count: int
    upload_date: str
    author: AuthorResponse
    duration: Optional[int] = None
    category: Optional[str] = None
    tags: List[str] = []  # Phase 5: Recommendation-ready
    like_count: int = 0
    status: str = "published"
    visibility: str = "public"
    resolutions: Optional[dict] = None

    class Config:
        from_attributes = True


class ChannelSearchResponse(BaseModel):
    id: int
    username: str
    profile_image: Optional[str] = None
    subscriber_count: int = 0
    video_count: int = 0

    class Config:
        from_attributes = True


class CombinedSearchResponse(BaseModel):
    channels: List[ChannelSearchResponse]
    videos: List[VideoListResponse]


class VideoResponse(BaseModel):
    """Response model for video details."""
    id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []  # Phase 5: Recommendation-ready JSON tags
    visibility: str = "public"  # Phase 5: Access control
    scheduled_at: Optional[str] = None  # Phase 5: ISO 8601 datetime
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    view_count: int
    upload_date: str
    duration: Optional[int] = None
    like_count: int = 0
    author: AuthorResponse
    resolutions: Optional[dict] = None
    status: str = "published"
    
    class Config:
        from_attributes = True


# ============================================================================
# Helper Functions
# ============================================================================

def get_video_url(filename: str, is_temp: bool = False) -> str:
    """Generate full URL for video file."""
    if not filename: return None
    if is_temp:
        return f"/storage/temp/{filename}"
    return f"/storage/uploads/videos/{filename}"


def get_thumbnail_url(filename: str) -> str:
    """Generate full URL for thumbnail file."""
    if not filename: return None
    return f"/storage/uploads/thumbnails/{filename}"


def get_preview_url(filename: str) -> str:
    """Generate full URL for preview frame."""
    if not filename: return None
    return f"/storage/uploads/previews/{filename}"

def parse_tags(tags_val: Union[str, List, None]) -> List[str]:
    """Safely parse tags from DB (which might be JSON string) to List."""
    if not tags_val:
        return []
    if isinstance(tags_val, list):
        return tags_val
    if isinstance(tags_val, str):
        try:
            parsed = json.loads(tags_val)
            if isinstance(parsed, list):
                return parsed
            return [] # fallback if json is not a list
        except json.JSONDecodeError:
            return [] # fallback if invalid json
    return []

def format_video_response(video: Video, include_duration: bool = False) -> dict:
    """Format video object for API response."""
    # Check if video file exists in main video directory, if not assume temp
    video_path = secure_resolve(VIDEOS_DIR, video.video_filename)
    is_temp = not video_path.exists()
    
    # helper to ensure category is None if empty string? No, Optional[str] handles None.
    
    response = {
        "id": video.id,
        "title": video.title,
        "description": video.description,
        "category": video.category,
        "tags": parse_tags(video.tags),
        "visibility": video.visibility,
        "scheduled_at": (video.scheduled_at.isoformat() + "Z") if video.scheduled_at else None,
        "video_url": get_video_url(video.video_filename, is_temp=is_temp),
        "thumbnail_url": get_thumbnail_url(video.thumbnail_filename),
        "view_count": video.view_count,
        "upload_date": video.upload_date.isoformat() + "Z",
        "duration": video.duration,
        "like_count": video.like_count,
        "author": {
            "id": video.author.id,
            "username": video.author.username,
            "profile_image": video.author.profile_image,
            "video_count": video.author.videos.count() if video.author else 0
        },
        "resolutions": _parse_resolutions(video),
        "status": video.status or "published",
    }
    
    return response


def _parse_resolutions(video) -> dict:
    """Parse video.resolutions into a URL-mapped dict."""
    raw = video.resolutions
    # Parse stringified JSON if the DB returned a string
    while isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not raw:
        return None
    
    if not isinstance(raw, dict) or not raw:
        return None
    
    result = {}
    for label, filename in raw.items():
        result[label] = f"/storage/uploads/videos/{filename}"
    return result


# ============================================================================
# Routes
# ============================================================================

@router.post("/", response_model=VideoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    background_tasks: BackgroundTasks,
    title: str = Form(..., min_length=1, max_length=200),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    visibility: str = Form("public"),
    scheduled_at: Optional[str] = Form(None),
    video_file: UploadFile = File(...),
    thumbnail_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    video_path = None
    thumbnail_path = None
    thumbnail_filename = None
    thumbnail_success = False
    
    try:
        print(f"[UPLOAD] Starting video upload for user {current_user.username} - Title: {title}")
        
        # ── DRAFT CLEANUP: Delete previous draft to prevent storage bloat ──
        existing_draft = db.query(Video).filter(
            Video.user_id == current_user.id,
            Video.status == 'draft'
        ).order_by(Video.upload_date.desc()).first()
        
        if existing_draft:
            # Delete the old temp file
            try:
                old_temp_path = secure_resolve(TEMP_UPLOADS_DIR, existing_draft.video_filename)
                if old_temp_path.exists():
                    os.remove(str(old_temp_path))
                    print(f"[DRAFT CLEANUP] Deleted old temp file: {existing_draft.video_filename}")
            except Exception as e:
                print(f"[DRAFT CLEANUP] Could not delete old temp file: {e}")
            
            # Delete old thumbnail if it exists
            try:
                if existing_draft.thumbnail_filename:
                    old_thumb_path = secure_resolve(THUMBNAILS_DIR, existing_draft.thumbnail_filename)
                    if old_thumb_path.exists():
                        os.remove(str(old_thumb_path))
            except Exception as e:
                print(f"[DRAFT CLEANUP] Could not delete old thumbnail: {e}")
            
            # Delete old preview frames
            try:
                for preview_file in PREVIEWS_DIR.glob(f"video_{existing_draft.id}_preview_*.*"):
                    os.remove(str(preview_file))
            except Exception as e:
                print(f"[DRAFT CLEANUP] Could not delete old previews: {e}")
            
            db.delete(existing_draft)
            db.commit()
            print(f"[DRAFT CLEANUP] Deleted previous draft video ID {existing_draft.id}")
        
        # Validate file
        file_size = 0
        video_file.file.seek(0, 2)
        file_size = video_file.file.tell()
        video_file.file.seek(0)
        
        is_valid, error_msg = validate_video_file(video_file.filename, file_size)
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)
        
        # Generate unique filenames
        safe_video_filename = os.path.basename(video_file.filename.replace('\0', ''))
        video_filename = generate_unique_filename(safe_video_filename)
        
        if thumbnail_file:
            safe_thumb_filename = os.path.basename(thumbnail_file.filename.replace('\0', ''))
            extension = os.path.splitext(safe_thumb_filename)[1]
            thumbnail_filename = f"{os.path.splitext(video_filename)[0]}{extension}"
        else:
            thumbnail_filename = f"{os.path.splitext(video_filename)[0]}.jpg"
            
        # Explicit CodeQL sanitization before resolving path
        video_filename = os.path.basename(video_filename.replace('\0', ''))
        thumbnail_filename = os.path.basename(thumbnail_filename.replace('\0', ''))
        
        # Save video file to TEMP STAGING
        video_path = secure_resolve(TEMP_UPLOADS_DIR, video_filename)
        thumbnail_path = secure_resolve(THUMBNAILS_DIR, thumbnail_filename)
        
        os.makedirs(video_path.parent, exist_ok=True)
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video_file.file, buffer)
        
        if thumbnail_file:
            os.makedirs(thumbnail_path.parent, exist_ok=True)
            with open(thumbnail_path, "wb") as buffer:
                shutil.copyfileobj(thumbnail_file.file, buffer)
            thumbnail_success = True
        else:
            # We will generate it from the video later
            thumbnail_success = False
        
        # Extract metadata
        metadata = get_video_metadata(str(video_path))
        duration = metadata.get("duration")
        
        # Parse tags
        tags_list = []
        if tags:
            try:
                tags_list = json.loads(tags)
            except json.JSONDecodeError:
                tags_list = []
        
        # Parse scheduled_at
        scheduled_datetime = None
        if scheduled_at:
            try:
                scheduled_datetime = datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
            except ValueError:
                scheduled_datetime = None
                
        # Generate semantic embedding
        combined_text = f"{title} {description or ''} {' '.join(tags_list)}"
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            # Offload PyTorch inference to a worker thread to prevent blocking/crashing the main event loop
            embedding = await loop.run_in_executor(None, generate_embedding, combined_text)
        except Exception as e:
            print(f"[ERROR] Failed to generate embedding: {e}")
            embedding = None
        
        # Create database entry (visibility defaults to private for upload phase)
        new_video = Video(
            title=title,
            description=description,
            category=category,
            tags=tags_list, # SQLAlchemy handles this if type is JSON, or we might need json.dumps if Text
            visibility='private', 
            status='draft', # Initial status — becomes 'published' on final publish
            scheduled_at=scheduled_datetime,
            video_filename=video_filename,
            thumbnail_filename=thumbnail_filename,
            duration=int(duration) if duration else None,
            user_id=current_user.id,
            view_count=0,
            embedding=json.dumps(embedding) if embedding else None
        )
        # Handle string serialization for Text columns
        if isinstance(tags_list, list):
             new_video.tags = json.dumps(tags_list)
        else:
             if not new_video.tags:
                 new_video.tags = "[]"
        
        db.add(new_video)
        db.commit()
        db.refresh(new_video)
        # 1. Generate the 3 high-quality preview frames for the interactive picker
        preview_frames = generate_preview_frames(
            str(video_path), 
            str(PREVIEWS_DIR), 
            new_video.id
        )
        
        # 2. Extract first frame as temporary thumbnail if one wasn't uploaded
        if not thumbnail_success:
            thumb_filename = f"thumb_{new_video.id}.jpg"
            thumb_path = THUMBNAILS_DIR / thumb_filename
            
            # Generate thumbnail at 1.0s mark
            thumbnail_success = generate_thumbnail(str(video_path), str(thumb_path), timestamp=1.0)
            
            if thumbnail_success:
                new_video.thumbnail_filename = thumb_filename
                db.add(new_video)
                db.commit()
                logger.info(f"Initial thumbnail generated for video {new_video.id}")
            else:
                logger.error(f"Failed to generate initial thumbnail for video {new_video.id}")
            
        preview_frames_urls = [get_preview_url(f) for f in preview_frames]
        
        return VideoUploadResponse(
            id=new_video.id,
            title=new_video.title,
            description=new_video.description,
            video_url=get_video_url(video_filename, is_temp=True),
            thumbnail_url=get_thumbnail_url(new_video.thumbnail_filename),
            view_count=new_video.view_count,
            upload_date=new_video.upload_date.isoformat() + "Z",
            preview_frames=preview_frames_urls,
            author=AuthorResponse(
                id=current_user.id,
                username=current_user.username,
                profile_image=current_user.profile_image,
                video_count=current_user.videos.count()
            )
        )
        
    except HTTPException:
        if video_path and os.path.exists(video_path): cleanup_file(str(video_path))
        if thumbnail_path and thumbnail_filename and os.path.exists(thumbnail_path): cleanup_file(str(thumbnail_path))
        raise
    except Exception as e:
        if video_path and os.path.exists(video_path): cleanup_file(str(video_path))
        if thumbnail_path and thumbnail_filename and os.path.exists(thumbnail_path): cleanup_file(str(thumbnail_path))
        print(f"[UPLOAD ERROR] {e}")
        logger.exception("Video upload failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {str(e)}")


@router.get("/drafts")
def get_user_draft(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the user's most recent draft video for resume-upload flow.
    Returns a single draft object or {"draft": null} if none exist.
    """
    draft = db.query(Video).filter(
        Video.user_id == current_user.id,
        Video.status == 'draft'
    ).order_by(Video.upload_date.desc()).first()
    
    if not draft:
        return {"draft": None}
    
    return {
        "draft": {
            "id": draft.id,
            "title": draft.title,
            "description": draft.description,
            "category": draft.category,
            "tags": parse_tags(draft.tags),
            "video_url": get_video_url(draft.video_filename, is_temp=True),
            "thumbnail_url": get_thumbnail_url(draft.thumbnail_filename),
            "duration": draft.duration,
            "upload_date": draft.upload_date.isoformat() + "Z",
            "preview_frames": [
                get_preview_url(f.name) 
                for f in PREVIEWS_DIR.glob(f"video_{draft.id}_preview_*.*")
            ] if PREVIEWS_DIR.exists() else []
        }
    }


@router.get("/", response_model=List[VideoListResponse])
def get_all_videos(
    skip: int = 0,
    limit: int = 20,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if limit > 100: limit = 100
    
    query = db.query(Video)
    now = datetime.utcnow()
    # Filter for PUBLIC and PUBLISHED videos only
    query = query.filter(
        Video.visibility == "public",
        Video.status == "published", # Ensure processing is complete
        or_(Video.scheduled_at == None, Video.scheduled_at <= now)
    )
    
    if category: query = query.filter(Video.category == category)
    if search:
        from sqlalchemy import cast, String
        # ── Smart Stemming / Query Expansion + Typo Forgiveness ──
        search_words = search.strip().split()
        search_variations = set([search.strip()])  # Always include the exact phrase
        suffixes = ['ing', 'ers', 'er', 'ed', 'es', 's', 'lar', 'ler', 'r']
        for word in search_words:
            if len(word) > 3:
                search_variations.add(word)
                for suffix in suffixes:
                    if word.endswith(suffix):
                        stripped = word[:-len(suffix)]
                        if len(stripped) >= 3:
                            search_variations.add(stripped)
                # Typo forgiveness hack (chop last 1 and 2 chars)
                if len(word) >= 5:
                    search_variations.add(word[:-1])
                    search_variations.add(word[:-2])

        search_conditions = []
        for term in search_variations:
            search_conditions.extend([
                Video.title.ilike(f"%{term}%"),
                Video.description.ilike(f"%{term}%"),
                cast(Video.tags, String).ilike(f"%{term}%"),
                Video.category.ilike(f"%{term}%"),
                User.username.ilike(f"%{term}%")
            ])
        query = query.join(User, Video.user_id == User.id).filter(or_(*search_conditions))
    
    videos = query.order_by(Video.upload_date.desc()).offset(skip).limit(limit).all()
    
    return [
        VideoListResponse(
            id=video.id,
            title=video.title,
            video_url=get_video_url(video.video_filename, is_temp=False),
            thumbnail_url=get_thumbnail_url(video.thumbnail_filename),
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            duration=video.duration,
            category=video.category,
            tags=parse_tags(video.tags), # FIXED: Parse tags here
            like_count=video.like_count,
            status=video.status,
            visibility=video.visibility,
            resolutions=_parse_resolutions(video),
            author=AuthorResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
                video_count=video.author.videos.count()
            )
        )
        for video in videos
    ]

@router.get("/semantic-search", response_model=CombinedSearchResponse)
def semantic_search(
    query: str,
    limit: int = 12,
    db: Session = Depends(get_db)
):
    """
    Performs context-aware local semantic search using sentence-transformers and numpy.
    Falls back to powerful lexical search if ML returns nothing.
    Now includes user channel matches.
    """
    if not query.strip():
        return CombinedSearchResponse(channels=[], videos=[])

    from sqlalchemy import cast, String

    now = datetime.utcnow()
    clean_query = query.strip()
    top_videos = []  # This is the master result list

    # ── PHASE 1: Attempt ML/Semantic Search ──
    try:
        query_vector = generate_embedding(clean_query)

        if query_vector and len(clean_query) >= 3:
            # Fetch all eligible videos that have embeddings
            eligible_videos = db.query(Video).filter(
                Video.visibility == "public",
                Video.status == "published",
                or_(Video.scheduled_at == None, Video.scheduled_at <= now),
                Video.embedding != None
            ).all()

            scored_videos = []
            for video in eligible_videos:
                try:
                    if video.embedding is None:
                        continue
                    video_vector = video.embedding if isinstance(video.embedding, list) else json.loads(video.embedding)
                    if not video_vector:
                        continue
                    score = compute_cosine_similarity(query_vector, video_vector)
                    if clean_query.lower() in video.title.lower():
                        score += 0.2
                    scored_videos.append((score, video))
                except Exception:
                    continue

            scored_videos.sort(key=lambda x: x[0], reverse=True)
            top_videos = [v[1] for v in scored_videos[:limit] if v[0] > 0.45]

        elif len(clean_query) < 3:
            # Short query: use prefix match
            short_matches = db.query(Video).filter(
                Video.visibility == "public",
                Video.status == "published",
                or_(Video.scheduled_at == None, Video.scheduled_at <= now),
                or_(
                    Video.title.ilike(f"{clean_query}%"),
                    Video.title.ilike(clean_query),
                )
            ).limit(limit).all()
            top_videos = short_matches

    except Exception:
        pass  # ML failure is fine — fallback handles it

    # ── PHASE 2: UNCONDITIONAL LEXICAL FALLBACK (with Smart Stemming) ──
    # If ML returned nothing for ANY reason, lexical search always fires.
    if not top_videos:
        # Expand the query by stripping common EN/TR suffixes + typo forgiveness
        words = clean_query.split()
        variations = set([clean_query])  # Always search the exact phrase first

        suffixes = ['ing', 'ers', 'er', 'ed', 'es', 's', 'lar', 'ler', 'r']
        for word in words:
            if len(word) > 3:  # Only stem words longer than 3 chars
                variations.add(word)
                for suffix in suffixes:
                    if word.endswith(suffix):
                        # e.g., 'gamer' minus 'r' = 'game'. 'gamers' minus 's' = 'gamer'
                        stripped = word[:-len(suffix)]
                        if len(stripped) >= 3:
                            variations.add(stripped)
                # Typo forgiveness hack (chop last 1 and 2 chars)
                if len(word) >= 5:
                    variations.add(word[:-1])
                    variations.add(word[:-2])

        # Build dynamic search conditions for all variations
        search_conditions = []
        for term in variations:
            search_conditions.extend([
                Video.title.ilike(f"%{term}%"),
                Video.description.ilike(f"%{term}%"),
                cast(Video.tags, String).ilike(f"%{term}%"),
                Video.category.ilike(f"%{term}%"),
                User.username.ilike(f"%{term}%")
            ])

        # Execute the Unconditional Fallback (joined with User for username search)
        top_videos = db.query(Video).join(User, Video.user_id == User.id).filter(
            Video.visibility == "public",
            Video.status == "published",
            or_(Video.scheduled_at == None, Video.scheduled_at <= now),
            or_(*search_conditions)
        ).order_by(Video.view_count.desc()).limit(limit).all()

    # ── PHASE 3: Search for matching Channels ──
    channels_query = db.query(User).filter(User.username.ilike(f"%{clean_query}%")).limit(5).all()
    channels_list = [
        ChannelSearchResponse(
            id=user.id,
            username=user.username,
            profile_image=user.profile_image,
            subscriber_count=user.followers.count(),
            video_count=user.videos.count()
        )
        for user in channels_query
    ]

    # ── PHASE 4: Format and return ──
    videos_list = [
        VideoListResponse(
            id=video.id,
            title=video.title,
            video_url=get_video_url(video.video_filename, is_temp=False),
            thumbnail_url=get_thumbnail_url(video.thumbnail_filename),
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            duration=video.duration,
            category=video.category,
            tags=parse_tags(video.tags),
            like_count=video.like_count,
            status=video.status,
            visibility=video.visibility,
            author=AuthorResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
                video_count=video.author.videos.count()
            )
        )
        for video in top_videos
    ]
    
    return CombinedSearchResponse(channels=channels_list, videos=videos_list)

@router.get("/history", response_model=List[VideoListResponse])
def get_video_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch the current user's watch history (Placeholder)."""
    # Currently returning empty list until WatchHistory model is implemented
    return []

@router.get("/liked", response_model=List[VideoListResponse])
def get_liked_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch videos liked by the current user."""
    from backend.database.models import Like
    
    # Query videos linked to likes by the current user
    liked_videos = db.query(Video).join(Like).filter(
        Like.user_id == current_user.id,
        Like.is_dislike == False
    ).order_by(Like.created_at.desc()).all()
    
    return [
        VideoListResponse(
            id=video.id,
            title=video.title,
            thumbnail_url=get_thumbnail_url(video.thumbnail_filename),
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            duration=video.duration,
            category=video.category,
            tags=parse_tags(video.tags),
            like_count=video.like_count,
            status=video.status,
            visibility=video.visibility,
            author=AuthorResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
                video_count=video.author.videos.count()
            )
        )
        for video in liked_videos
    ]

@router.get("/{video_id}", response_model=VideoResponse)
def get_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    
    now = datetime.utcnow()
    is_owner = current_user and current_user.id == video.user_id
    
    if video.visibility == "private" and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This video is private")
    
    if video.scheduled_at and video.scheduled_at > now and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This video is not yet published")
    
    return format_video_response(video, include_duration=True) # Uses parse_tags inside format_video_response now

@router.post("/{video_id}/view", status_code=status.HTTP_200_OK)
async def increment_view_count(video_id: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    video.view_count += 1
    db.commit()
    return {"status": "success", "view_count": video.view_count}

@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(video_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.user_id != current_user.id: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this video")
    
    video_path_perm = secure_resolve(VIDEOS_DIR, video.video_filename)
    video_path_temp = secure_resolve(TEMP_UPLOADS_DIR, video.video_filename)
    
    if video_path_perm.exists(): cleanup_file(str(video_path_perm))
    if video_path_temp.exists(): cleanup_file(str(video_path_temp))

    thumbnail_path = secure_resolve(THUMBNAILS_DIR, video.thumbnail_filename)
    if video.thumbnail_filename != "default_thumbnail.png": cleanup_file(str(thumbnail_path))
    
    db.delete(video)
    db.commit()
    return None

class VideoUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: Optional[str] = None
    scheduled_at: Optional[str] = None
    selected_preview_frame: Optional[str] = None

    @validator('title', 'description', 'category', pre=True, always=True)
    def sanitize_text_fields(cls, v):
        if v is None: return v
        import re
        return re.sub(r'<[^>]+>', '', str(v)).strip()

    @validator('tags', pre=True, always=True)
    def sanitize_tags(cls, v):
        if v is None: return v
        import re
        return [re.sub(r'<[^>]+>', '', str(tag)).strip() for tag in v]

    class Config: from_attributes = True

@router.post("/{video_id}/thumbnail", response_model=VideoResponse)
def upload_video_thumbnail(
    video_id: int,
    thumbnail_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.user_id != current_user.id: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this video")
    
    import time
    safe_thumb_filename = os.path.basename(thumbnail_file.filename.replace('\0', ''))
    extension = os.path.splitext(safe_thumb_filename)[1]
    final_filename = f"video_{video_id}_custom_{int(time.time())}{extension}"
    
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    base_path = os.path.abspath(str(THUMBNAILS_DIR))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_path, final_filename)))
    if not fullpath.startswith(base_path):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    with open(fullpath, "wb") as buffer:
        shutil.copyfileobj(thumbnail_file.file, buffer)
        
    old_filename = video.thumbnail_filename
    if old_filename and old_filename != "default_thumbnail.png" and old_filename != final_filename:
        old_path = secure_resolve(THUMBNAILS_DIR, old_filename)
        if old_path.exists():
            try:
                os.remove(str(old_path))
            except:
                pass
                
    video.thumbnail_filename = final_filename
    db.commit()
    db.refresh(video)
    return format_video_response(video, include_duration=True)

@router.patch("/{video_id}/", response_model=VideoResponse)
@router.put("/{video_id}/", response_model=VideoResponse)
async def update_video(
    video_id: int,
    update_data: VideoUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    print(f"[UPDATE] Received request to update video {video_id}")
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.user_id != current_user.id: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this video")
    
    new_visibility = update_data.visibility
    
    needs_new_embedding = False

    if update_data.title is not None: 
        video.title = update_data.title
        needs_new_embedding = True
    if update_data.description is not None: 
        video.description = update_data.description
        needs_new_embedding = True
    if update_data.category is not None: video.category = update_data.category
    if update_data.tags is not None: 
        video.tags = json.dumps(update_data.tags)
        needs_new_embedding = True

    # ── Auto-Hashtag Injection: append #tags to description if not already present ──
    if update_data.tags and video.description is not None:
        tag_list = [t.strip() for t in update_data.tags if t.strip()]
        if tag_list:
            hashtag_string = " ".join([f"#{t.replace(' ', '')}" for t in tag_list])
            if hashtag_string not in (video.description or ""):
                video.description = f"{video.description}\n\n{hashtag_string}".strip()
        
    if needs_new_embedding:
        try:
            # Recompute semantic embedding if textual metadata changed
            tags_list = json.loads(video.tags) if isinstance(video.tags, str) else (video.tags or [])
            combined_text = f"{video.title} {video.description or ''} {' '.join(tags_list)}"
            
            import asyncio
            loop = asyncio.get_event_loop()
            new_embedding = await loop.run_in_executor(None, generate_embedding, combined_text)
            video.embedding = json.dumps(new_embedding) if new_embedding else None
        except Exception as e:
            print(f"[ERROR] Failed to update embedding: {e}")
    if update_data.visibility is not None: video.visibility = update_data.visibility
    if update_data.scheduled_at is not None:
        video.scheduled_at = datetime.fromisoformat(update_data.scheduled_at) if update_data.scheduled_at else None
    
    # Auto-update status to 'published' when visibility becomes public
    if new_visibility == 'public':
        video.status = 'published'
    if new_visibility == 'public':
        temp_video_path = secure_resolve(TEMP_UPLOADS_DIR, video.video_filename)
        perm_video_path = secure_resolve(VIDEOS_DIR, video.video_filename)
        
        # Move if logic
        if not perm_video_path.exists():
            if temp_video_path.exists():
                try:
                    shutil.move(str(temp_video_path), str(perm_video_path))
                    print(f"[MOVE] Video moved from TEMP to VIDEOS: {video.video_filename}")
                    
                    # Refinement: Explicit Move Verification
                    # Ensure source is gone even if shutil.move failed to delete it (e.g. cross-fs copy)
                    if temp_video_path.exists():
                        try:
                            os.remove(str(temp_video_path))
                            print(f"[CLEANUP] Verified/Deleted temp source: {video.video_filename}")
                        except Exception as e:
                            print(f"[CLEANUP WARNING] Could not delete temp source: {e}")
                            
                except Exception as e:
                    print(f"[MOVE ERROR] Failed to move video: {e}")

        # Post-Publish Safety: If perm exists, temp should definitely be gone
        if perm_video_path.exists() and temp_video_path.exists():
             try:
                os.remove(str(temp_video_path))
                print(f"[CLEANUP] Deleted residue temp source: {video.video_filename}")
             except Exception as e:
                print(f"[CLEANUP WARNING] Residue cleanup failed: {e}")

        # Trigger background transcoding when publishing
        if perm_video_path.exists():
            def _run_transcode(vid=video.id, src=str(perm_video_path)):
                transcode_video(
                    video_id=vid,
                    source_path=src,
                    videos_dir=str(VIDEOS_DIR),
                    db_session_factory=SessionLocal
                )
            threading.Thread(target=_run_transcode, daemon=True).start()
            print(f"[TRANSCODE] Background transcoding started for video {video.id}")
    
    # POST-PUBLISH CLEANUP
    selected_thumbnail_path = None
    if update_data.selected_preview_frame:
        temp_filename = os.path.basename(update_data.selected_preview_frame.replace('\0', ''))
        temp_path = secure_resolve(PREVIEWS_DIR, temp_filename)
        selected_thumbnail_path = temp_path
    
    if selected_thumbnail_path and selected_thumbnail_path.exists():
        try:
            file_ext = selected_thumbnail_path.suffix
            final_filename = f"video_{video_id}_final{file_ext}"
            final_path = secure_resolve(THUMBNAILS_DIR, final_filename)
            THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
            shutil.move(str(selected_thumbnail_path), str(final_path))
            video.thumbnail_filename = final_filename
            print(f"[CLEANUP] Thumbnail updated to {final_filename}")
        except Exception as e:
            print(f"[CLEANUP ERROR] Failed to move thumbnail: {e}")
            video.thumbnail_filename = os.path.basename(str(selected_thumbnail_path))
    
    # CLEANUP: Delete ALL preview frames if published or thumbnail selected
    if new_visibility == 'public' or update_data.selected_preview_frame:
        try:
            preview_pattern = f"video_{video_id}_preview_*.*"
            deleted_count = 0
            for preview_file in PREVIEWS_DIR.glob(preview_pattern):
                try:
                    # EXTRA SAFETY: Do not delete if it matches the new thumbnail filename (shouldn't happen due to move, but safe is better)
                    if preview_file.name == video.thumbnail_filename:
                        continue
                        
                    os.remove(str(preview_file))
                    deleted_count += 1
                except Exception as e:
                    print(f"[CLEANUP WARNING] Could not delete {preview_file.name}: {e}")
            if deleted_count > 0: print(f"[CLEANUP] Deleted {deleted_count} preview frame(s)")
        except Exception as e:
            print(f"[CLEANUP ERROR] Error during preview cleanup: {e}")
    
    db.commit()
    db.refresh(video)
    return format_video_response(video, include_duration=True)

@router.get("/user/{user_id}", response_model=List[VideoListResponse])
def get_user_videos(user_id: int, skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    if limit > 100: limit = 100
    videos = db.query(Video).filter(
        Video.user_id == user_id,
        Video.status == 'published',
        Video.visibility == 'public'
    ).order_by(Video.upload_date.desc()).offset(skip).limit(limit).all()
    
    return [
        VideoListResponse(
            id=video.id,
            title=video.title,
            video_url=get_video_url(video.video_filename, is_temp=False),
            thumbnail_url=get_thumbnail_url(video.thumbnail_filename),
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            duration=video.duration,
            category=video.category,
            tags=parse_tags(video.tags), # FIXED
            like_count=video.like_count,
            status=video.status,
            visibility=video.visibility,
            author=AuthorResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
                video_count=video.author.videos.count()
            )
        )
        for video in videos
    ]


@router.get("/{video_id}/resolutions")
def get_video_resolutions(
    video_id: int,
    db: Session = Depends(get_db)
):
    """Get available resolutions and transcoding status for a video."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    
    resolutions = _parse_resolutions(video)
    
    # Determine transcoding status
    if video.status == 'transcoding':
        transcode_status = 'processing'
    elif resolutions and len(resolutions) > 1:
        transcode_status = 'ready'
    elif resolutions and len(resolutions) == 1:
        transcode_status = 'ready'  # Only original available
    else:
        transcode_status = 'pending'
    
    return {
        "status": transcode_status,
        "resolutions": resolutions or {"original": get_video_url(video.video_filename)}
    }
