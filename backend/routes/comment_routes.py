"""
Comment Routes
--------------
Handles comment creation, retrieval, deletion, and like/dislike for videos.

Endpoints:
- POST /videos/{video_id}/comments: Add a comment to a video (protected)
- GET /videos/{video_id}/comments: Get all comments for a video
- DELETE /comments/{comment_id}: Delete a comment (protected)
- POST /comments/{comment_id}/like: Toggle like on a comment (protected)
- POST /comments/{comment_id}/dislike: Toggle dislike on a comment (protected)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field
from typing import List, Optional

from backend.database import get_db
from backend.database.models import User, Video, Comment, CommentLike
from backend.routes.auth_routes import get_current_user, get_optional_user

# Create router
router = APIRouter(tags=["Comments"])


# ============================================================================
# Pydantic Models (Request/Response Schemas)
# ============================================================================

class CommentCreate(BaseModel):
    """Request model for creating a comment."""
    text: str = Field(..., min_length=1, max_length=1000, description="Comment text")
    parent_id: Optional[int] = Field(None, description="Parent comment ID for replies")
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "Great video! Very helpful."
            }
        }


class CommentResponse(BaseModel):
    """Response model for comment details."""
    id: int
    text: str
    created_at: str
    author: dict
    like_count: int = 0
    dislike_count: int = 0
    user_has_liked: bool = False
    user_has_disliked: bool = False
    parent_id: Optional[int] = None
    replies: List["CommentResponse"] = []
    
    class Config:
        from_attributes = True

CommentResponse.model_rebuild()


class CommentLikeResponse(BaseModel):
    """Response model for comment like/dislike actions."""
    comment_id: int
    like_count: int
    dislike_count: int
    user_has_liked: bool
    user_has_disliked: bool
    message: str


class CommentWithVideoResponse(BaseModel):
    """Response model for comment with video information."""
    id: int
    text: str
    created_at: str
    author: dict
    video: dict


# ============================================================================
# Helpers
# ============================================================================

def _get_comment_counts(db: Session, comment_id: int, user_id: Optional[int] = None):
    """Get like/dislike counts and user status for a comment."""
    like_count = db.query(CommentLike).filter(
        CommentLike.comment_id == comment_id, CommentLike.is_dislike == False
    ).count()
    dislike_count = db.query(CommentLike).filter(
        CommentLike.comment_id == comment_id, CommentLike.is_dislike == True
    ).count()
    
    user_has_liked = False
    user_has_disliked = False
    if user_id:
        existing = db.query(CommentLike).filter(
            CommentLike.user_id == user_id, CommentLike.comment_id == comment_id
        ).first()
        if existing:
            if existing.is_dislike:
                user_has_disliked = True
            else:
                user_has_liked = True
    
    return like_count, dislike_count, user_has_liked, user_has_disliked


def _format_comment(comment, db: Session, user_id: Optional[int] = None, include_replies: bool = True):
    """Format a comment with like/dislike information, optionally including replies."""
    lc, dc, uhl, uhd = _get_comment_counts(db, comment.id, user_id)
    replies_data = []
    if include_replies:
        for reply in comment.replies.order_by(Comment.created_at.asc()):
            replies_data.append(_format_comment(reply, db, user_id, include_replies=False))
    return CommentResponse(
        id=comment.id,
        text=comment.text,
        created_at=comment.created_at.isoformat() + "Z",
        author={
            "id": comment.author.id,
            "username": comment.author.username,
            "profile_image": comment.author.profile_image
        },
        like_count=lc,
        dislike_count=dc,
        user_has_liked=uhl,
        user_has_disliked=uhd,
        parent_id=comment.parent_id,
        replies=replies_data
    )


# ============================================================================
# Routes
# ============================================================================

@router.post("/videos/{video_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    video_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a top-level comment or a reply to a video (protected route)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Validate parent comment if replying
    if comment_data.parent_id:
        parent = db.query(Comment).filter(
            Comment.id == comment_data.parent_id,
            Comment.video_id == video_id
        ).first()
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent comment not found")
    
    new_comment = Comment(
        text=comment_data.text,
        user_id=current_user.id,
        video_id=video_id,
        parent_id=comment_data.parent_id
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    # Return a dict so FastAPI correctly builds the CommentResponse model
    return {
        "id": new_comment.id,
        "text": new_comment.text,
        "created_at": new_comment.created_at.isoformat() + "Z",
        "author": {
            "id": current_user.id,
            "username": current_user.username,
            "profile_image": current_user.profile_image
        },
        "like_count": 0,
        "dislike_count": 0,
        "user_has_liked": False,
        "user_has_disliked": False,
        "parent_id": new_comment.parent_id,
        "replies": []
    }


@router.get("/videos/{video_id}/comments", response_model=List[CommentResponse])
def get_video_comments(
    video_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Get top-level comments for a video (replies are nested inside each comment)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    
    if limit > 100:
        limit = 100
    
    # Only return top-level comments (parent_id IS NULL); replies come nested
    comments = db.query(Comment)\
        .options(joinedload(Comment.author))\
        .filter(Comment.video_id == video_id, Comment.parent_id == None)\
        .order_by(Comment.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    
    user_id = current_user.id if current_user else None
    return [_format_comment(c, db, user_id) for c in comments]


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a comment (author or video owner only)."""
    comment = db.query(Comment)\
        .options(joinedload(Comment.video))\
        .filter(Comment.id == comment_id)\
        .first()
    
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    
    is_comment_author = comment.user_id == current_user.id
    is_video_owner = comment.video.user_id == current_user.id
    
    if not (is_comment_author or is_video_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    db.delete(comment)
    db.commit()
    return None


# ============================================================================
# Comment Like / Dislike Routes
# ============================================================================

@router.post("/comments/{comment_id}/like", response_model=CommentLikeResponse)
def toggle_comment_like(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle LIKE on a comment.
    - No existing → create like
    - Existing like → remove (un-like)
    - Existing dislike → switch to like
    """
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    existing = db.query(CommentLike).filter(
        CommentLike.user_id == current_user.id, CommentLike.comment_id == comment_id
    ).first()

    if existing:
        if existing.is_dislike:
            existing.is_dislike = False
            db.commit()
            message = "Switched to like"
        else:
            db.delete(existing)
            db.commit()
            message = "Like removed"
    else:
        db.add(CommentLike(user_id=current_user.id, comment_id=comment_id, is_dislike=False))
        db.commit()
        message = "Comment liked"

    lc, dc, uhl, uhd = _get_comment_counts(db, comment_id, current_user.id)
    return CommentLikeResponse(
        comment_id=comment_id, like_count=lc, dislike_count=dc,
        user_has_liked=uhl, user_has_disliked=uhd, message=message
    )


@router.post("/comments/{comment_id}/dislike", response_model=CommentLikeResponse)
def toggle_comment_dislike(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle DISLIKE on a comment.
    - No existing → create dislike
    - Existing dislike → remove
    - Existing like → switch to dislike
    """
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    existing = db.query(CommentLike).filter(
        CommentLike.user_id == current_user.id, CommentLike.comment_id == comment_id
    ).first()

    if existing:
        if not existing.is_dislike:
            existing.is_dislike = True
            db.commit()
            message = "Switched to dislike"
        else:
            db.delete(existing)
            db.commit()
            message = "Dislike removed"
    else:
        db.add(CommentLike(user_id=current_user.id, comment_id=comment_id, is_dislike=True))
        db.commit()
        message = "Comment disliked"

    lc, dc, uhl, uhd = _get_comment_counts(db, comment_id, current_user.id)
    return CommentLikeResponse(
        comment_id=comment_id, like_count=lc, dislike_count=dc,
        user_has_liked=uhl, user_has_disliked=uhd, message=message
    )


# ============================================================================
# Additional Routes
# ============================================================================

@router.get("/users/{user_id}/comments", response_model=List[CommentWithVideoResponse])
def get_user_comments(
    user_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get all comments made by a specific user."""
    if limit > 100:
        limit = 100
    
    comments = db.query(Comment)\
        .options(joinedload(Comment.author), joinedload(Comment.video))\
        .filter(Comment.user_id == user_id)\
        .order_by(Comment.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    
    return [
        CommentWithVideoResponse(
            id=comment.id,
            text=comment.text,
            created_at=comment.created_at.isoformat() + "Z",
            author={
                "id": comment.author.id,
                "username": comment.author.username,
                "profile_image": comment.author.profile_image
            },
            video={
                "id": comment.video.id,
                "title": comment.video.title,
                "thumbnail_url": f"/storage/uploads/thumbnails/{comment.video.thumbnail_filename}" if comment.video.thumbnail_filename else None
            }
        )
        for comment in comments
    ]


@router.get("/comments/count/{video_id}")
def get_comment_count(video_id: int, db: Session = Depends(get_db)):
    """Get the total number of comments for a video."""
    count = db.query(Comment).filter(Comment.video_id == video_id).count()
    return {"video_id": video_id, "comment_count": count}
