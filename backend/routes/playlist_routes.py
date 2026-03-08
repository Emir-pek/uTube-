"""
Playlist Routes
---------------
Handles playlist CRUD, adding/removing videos, and listing user playlists.

Endpoints:
- POST /playlists: Create a new playlist (protected)
- GET /playlists/{id}: Get playlist details with ordered videos
- PATCH /playlists/{id}: Update playlist (protected, owner only)
- DELETE /playlists/{id}: Delete playlist (protected, owner only)
- POST /playlists/{id}/videos: Add a video to a playlist (protected, owner only)
- DELETE /playlists/{id}/videos/{video_id}: Remove a video (protected, owner only)
- GET /users/{user_id}/playlists: Get a user's playlists
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

from backend.database import get_db
from backend.database.models import User, Video, Playlist, PlaylistVideo, WatchLater
from backend.routes.auth_routes import get_current_user, get_optional_user

# Create router
router = APIRouter(prefix="/playlists", tags=["Playlists"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class PlaylistCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    visibility: Optional[str] = "public"


class PlaylistUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    visibility: Optional[str] = None


class PlaylistVideoRequest(BaseModel):
    video_id: int


class OwnerResponse(BaseModel):
    id: int
    username: str
    profile_image: Optional[str] = None

    class Config:
        from_attributes = True


class PlaylistVideoItemResponse(BaseModel):
    """A video entry within a playlist."""
    id: int
    title: str
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None
    view_count: int = 0
    upload_date: str
    order_index: int
    author: OwnerResponse

    class Config:
        from_attributes = True


class PlaylistResponse(BaseModel):
    """Summary response for playlist listings."""
    id: int
    title: str
    description: Optional[str] = None
    visibility: str = "public"
    video_count: int = 0
    thumbnail_url: Optional[str] = None  # First video's thumbnail
    owner: OwnerResponse
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class PlaylistDetailResponse(BaseModel):
    """Detailed response including ordered videos."""
    id: int
    title: str
    description: Optional[str] = None
    visibility: str = "public"
    video_count: int = 0
    owner: OwnerResponse
    created_at: str
    updated_at: str
    videos: List[PlaylistVideoItemResponse] = []

    class Config:
        from_attributes = True


# ============================================================================
# Helper Functions
# ============================================================================

def _get_video_url(filename, is_temp=False):
    """Construct a video URL from filename."""
    if not filename:
        return None
    prefix = "temp_uploads" if is_temp else "videos"
    return f"/storage/uploads/{prefix}/{filename}"


def _get_thumbnail_url(filename):
    """Construct a thumbnail URL from filename."""
    if not filename:
        return None
    return f"/storage/uploads/thumbnails/{filename}"


def _format_playlist_response(playlist: Playlist) -> dict:
    """Format a playlist into a summary response dict."""
    entries = playlist.entries  # Already ordered by order_index
    first_video_thumb = None
    if entries:
        first_video = entries[0].video
        if first_video:
            first_video_thumb = _get_thumbnail_url(first_video.thumbnail_filename)

    return PlaylistResponse(
        id=playlist.id,
        title=playlist.title,
        description=playlist.description,
        visibility=playlist.visibility,
        video_count=len(entries),
        thumbnail_url=first_video_thumb,
        owner=OwnerResponse(
            id=playlist.owner.id,
            username=playlist.owner.username,
            profile_image=playlist.owner.profile_image,
        ),
        created_at=playlist.created_at.isoformat() + "Z",
        updated_at=playlist.updated_at.isoformat() + "Z",
    )


def _format_playlist_detail(playlist: Playlist) -> dict:
    """Format a playlist into a detailed response with ordered videos."""
    videos = []
    for entry in playlist.entries:
        video = entry.video
        if not video:
            continue
        videos.append(PlaylistVideoItemResponse(
            id=video.id,
            title=video.title,
            thumbnail_url=_get_thumbnail_url(video.thumbnail_filename),
            duration=video.duration,
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            order_index=entry.order_index,
            author=OwnerResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
            ),
        ))

    return PlaylistDetailResponse(
        id=playlist.id,
        title=playlist.title,
        description=playlist.description,
        visibility=playlist.visibility,
        video_count=len(videos),
        owner=OwnerResponse(
            id=playlist.owner.id,
            username=playlist.owner.username,
            profile_image=playlist.owner.profile_image,
        ),
        created_at=playlist.created_at.isoformat() + "Z",
        updated_at=playlist.updated_at.isoformat() + "Z",
        videos=videos,
    )


# ============================================================================
# Routes
# ============================================================================

@router.post("/", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
def create_playlist(
    data: PlaylistCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new playlist."""
    playlist = Playlist(
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        visibility=data.visibility or "public",
        user_id=current_user.id,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    print(f"[PLAYLIST] Created playlist '{playlist.title}' (id={playlist.id}) for user {current_user.username}")
    return _format_playlist_response(playlist)


@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
def get_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Get playlist details with ordered videos."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    # Private playlists are only visible to the owner
    is_owner = current_user and current_user.id == playlist.user_id
    if playlist.visibility == "private" and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This playlist is private")

    return _format_playlist_detail(playlist)


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
def update_playlist(
    playlist_id: int,
    data: PlaylistUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update playlist title, description, or visibility."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this playlist")

    if data.title is not None:
        playlist.title = data.title.strip()
    if data.description is not None:
        playlist.description = data.description.strip() if data.description else None
    if data.visibility is not None:
        playlist.visibility = data.visibility

    db.commit()
    db.refresh(playlist)
    return _format_playlist_response(playlist)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(
    playlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this playlist")

    db.delete(playlist)
    db.commit()
    print(f"[PLAYLIST] Deleted playlist {playlist_id} by user {current_user.username}")
    return None


@router.post("/{playlist_id}/videos", response_model=PlaylistDetailResponse)
def add_video_to_playlist(
    playlist_id: int,
    data: PlaylistVideoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a video to a playlist. Auto-assigns order_index."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this playlist")

    # Verify the video exists
    video = db.query(Video).filter(Video.id == data.video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Check if video is already in playlist
    existing = db.query(PlaylistVideo).filter(
        PlaylistVideo.playlist_id == playlist_id,
        PlaylistVideo.video_id == data.video_id,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Video is already in this playlist")

    # Auto-calculate next order_index
    max_order = db.query(func.max(PlaylistVideo.order_index)).filter(
        PlaylistVideo.playlist_id == playlist_id
    ).scalar()
    next_order = (max_order + 1) if max_order is not None else 0

    entry = PlaylistVideo(
        playlist_id=playlist_id,
        video_id=data.video_id,
        order_index=next_order,
    )
    db.add(entry)
    db.commit()
    db.refresh(playlist)
    print(f"[PLAYLIST] Added video {data.video_id} to playlist {playlist_id} at index {next_order}")
    return _format_playlist_detail(playlist)


@router.delete("/{playlist_id}/videos/{video_id}", response_model=PlaylistDetailResponse)
def remove_video_from_playlist(
    playlist_id: int,
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a video from a playlist and reindex remaining entries."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this playlist")

    entry = db.query(PlaylistVideo).filter(
        PlaylistVideo.playlist_id == playlist_id,
        PlaylistVideo.video_id == video_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found in this playlist")

    db.delete(entry)

    # Reindex remaining entries to keep order_index contiguous
    remaining = db.query(PlaylistVideo).filter(
        PlaylistVideo.playlist_id == playlist_id
    ).order_by(PlaylistVideo.order_index).all()
    for i, e in enumerate(remaining):
        e.order_index = i

    db.commit()
    db.refresh(playlist)
    print(f"[PLAYLIST] Removed video {video_id} from playlist {playlist_id}")
    return _format_playlist_detail(playlist)


# ============================================================================
# User Playlists Route (separate prefix for /users/{id}/playlists)
# ============================================================================

user_playlists_router = APIRouter(prefix="/users", tags=["Playlists"])


@user_playlists_router.get("/{user_id}/playlists", response_model=List[PlaylistResponse])
def get_user_playlists(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Get a user's playlists. Only shows public playlists to non-owners."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_owner = current_user and current_user.id == user_id

    query = db.query(Playlist).filter(Playlist.user_id == user_id)
    if not is_owner:
        query = query.filter(Playlist.visibility == "public")

    playlists = query.order_by(Playlist.updated_at.desc()).all()
    return [_format_playlist_response(p) for p in playlists]


# ============================================================================
# Watch Later Routes
# ============================================================================

watch_later_router = APIRouter(prefix="/users/watch-later", tags=["Watch Later"])

@watch_later_router.post("/{video_id}", status_code=status.HTTP_201_CREATED)
def add_to_watch_later(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a video to the user's Watch Later list."""
    # Verify the video exists
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Check if already in Watch Later
    existing = db.query(WatchLater).filter(
        WatchLater.user_id == current_user.id,
        WatchLater.video_id == video_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Video is already in Watch Later")

    new_entry = WatchLater(user_id=current_user.id, video_id=video_id)
    db.add(new_entry)
    db.commit()
    print(f"[WATCH_LATER] User {current_user.username} added video {video_id} to Watch Later")
    return {"message": "Added to Watch Later"}

@watch_later_router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_watch_later(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a video from the user's Watch Later list."""
    entry = db.query(WatchLater).filter(
        WatchLater.user_id == current_user.id,
        WatchLater.video_id == video_id
    ).first()
    
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found in Watch Later")

    db.delete(entry)
    db.commit()
    print(f"[WATCH_LATER] User {current_user.username} removed video {video_id} from Watch Later")
    return None

@watch_later_router.get("", response_model=List[PlaylistVideoItemResponse])
def get_watch_later(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's Watch Later list."""
    entries = db.query(WatchLater).filter(
        WatchLater.user_id == current_user.id
    ).order_by(WatchLater.added_at.desc()).all()
    
    videos = []
    # We will format this to look like Playlist items for frontend compatibility
    for i, entry in enumerate(entries):
        video = entry.video
        if not video:
             continue
        videos.append(PlaylistVideoItemResponse(
            id=video.id,
            title=video.title,
            thumbnail_url=_get_thumbnail_url(video.thumbnail_filename),
            duration=video.duration,
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            order_index=i,  # Pseudo order to not break frontend
            author=OwnerResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
            ),
        ))
        
    return videos
