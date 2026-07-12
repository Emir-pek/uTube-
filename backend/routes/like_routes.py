"""
Like / Dislike Routes
---------------------
Handles video like and dislike functionality (YouTube-style).

Endpoints:
- POST /videos/{video_id}/like: Toggle like on a video (protected)
- POST /videos/{video_id}/dislike: Toggle dislike on a video (protected)
- GET /videos/{video_id}/likes: Get like/dislike counts and user's status
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.database import get_db
from backend.database.models import User, Video, Like
from backend.routes.auth_routes import get_current_user

# Create router
router = APIRouter(prefix="/videos", tags=["Likes"])


# ============================================================================
# Pydantic Models (Request/Response Schemas)
# ============================================================================

class LikeResponse(BaseModel):
    """Response model for like/dislike status."""
    video_id: int
    like_count: int
    dislike_count: int
    user_has_liked: bool
    user_has_disliked: bool
    message: str


# ============================================================================
# Helper
# ============================================================================

def _get_counts_and_status(db: Session, video_id: int, user_id: Optional[int] = None):
    """Shared helper – returns like/dislike counts and user flags."""
    like_count = db.query(Like).filter(Like.video_id == video_id, Like.is_dislike == False).count()
    dislike_count = db.query(Like).filter(Like.video_id == video_id, Like.is_dislike == True).count()

    user_has_liked = False
    user_has_disliked = False
    if user_id:
        existing = db.query(Like).filter(Like.user_id == user_id, Like.video_id == video_id).first()
        if existing:
            if existing.is_dislike:
                user_has_disliked = True
            else:
                user_has_liked = True

    return like_count, dislike_count, user_has_liked, user_has_disliked


# ============================================================================
# Routes
# ============================================================================

@router.post("/{video_id}/like", response_model=LikeResponse)
def toggle_like(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle LIKE on a video.

    - No existing row  → create a like
    - Existing LIKE    → remove it (un-like)
    - Existing DISLIKE → switch to like
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    existing = db.query(Like).filter(
        Like.user_id == current_user.id, Like.video_id == video_id
    ).first()

    if existing:
        if existing.is_dislike:
            # Switch from dislike → like
            existing.is_dislike = False
            db.commit()
            message = "Switched to like"
        else:
            # Already liked → remove
            db.delete(existing)
            db.commit()
            message = "Like removed"
    else:
        # New like
        db.add(Like(user_id=current_user.id, video_id=video_id, is_dislike=False))
        db.commit()
        message = "Video liked"

    lc, dc, uhl, uhd = _get_counts_and_status(db, video_id, current_user.id)
    return LikeResponse(
        video_id=video_id, like_count=lc, dislike_count=dc,
        user_has_liked=uhl, user_has_disliked=uhd, message=message
    )


@router.post("/{video_id}/dislike", response_model=LikeResponse)
def toggle_dislike(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle DISLIKE on a video.

    - No existing row  → create a dislike
    - Existing DISLIKE → remove it (un-dislike)
    - Existing LIKE    → switch to dislike
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    existing = db.query(Like).filter(
        Like.user_id == current_user.id, Like.video_id == video_id
    ).first()

    if existing:
        if not existing.is_dislike:
            # Switch from like → dislike
            existing.is_dislike = True
            db.commit()
            message = "Switched to dislike"
        else:
            # Already disliked → remove
            db.delete(existing)
            db.commit()
            message = "Dislike removed"
    else:
        # New dislike
        db.add(Like(user_id=current_user.id, video_id=video_id, is_dislike=True))
        db.commit()
        message = "Video disliked"

    lc, dc, uhl, uhd = _get_counts_and_status(db, video_id, current_user.id)
    return LikeResponse(
        video_id=video_id, like_count=lc, dislike_count=dc,
        user_has_liked=uhl, user_has_disliked=uhd, message=message
    )


@router.get("/{video_id}/likes", response_model=LikeResponse)
def get_like_status(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get like/dislike counts and current user's status for a video."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    lc, dc, uhl, uhd = _get_counts_and_status(db, video_id, current_user.id)
    return LikeResponse(
        video_id=video_id, like_count=lc, dislike_count=dc,
        user_has_liked=uhl, user_has_disliked=uhd, message="Status retrieved"
    )
