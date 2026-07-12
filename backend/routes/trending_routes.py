"""
Trending Videos Endpoint
-------------------------
Returns trending videos for Netflix-style hero carousel.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
from typing import List
import traceback

from backend.database import get_db
from backend.database.models import Video, Like, Comment
from backend.routes.video_routes import VideoListResponse, AuthorResponse, get_thumbnail_url, get_video_url

# Create router
router = APIRouter(prefix="/videos", tags=["Trending"])


@router.get("/trending", response_model=List[VideoListResponse])
def get_trending_videos(
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """
    Get trending videos (most viewed) for hero carousel.
    
    Returns top videos ordered by view count (descending).
    Perfect for Netflix-style hero carousels.
    
    Args:
        limit: Number of trending videos to return (default: 5, max: 20)
        db: Database session
        
    Returns:
        List of trending videos
    """
    # Limit maximum results
    if limit > 20:
        limit = 20
    
    # Subquery to natively count likes without relying on the python hybrid property
    like_count_sq = db.query(func.count(Like.id)).filter(
        Like.video_id == Video.id, Like.is_dislike == False
    ).correlate(Video).scalar_subquery()

    # Subquery to natively count comments per video
    comment_count_sq = db.query(func.count(Comment.id)).filter(
        Comment.video_id == Video.id
    ).correlate(Video).scalar_subquery()

    # Query videos ordered by (likes + comments) / max(views, 1) descending
    # Multiply by 1.0 to force floating point division
    ratio_expr = (
        func.coalesce(like_count_sq, 0) + func.coalesce(comment_count_sq, 0)
    ) * 1.0 / case((Video.view_count == 0, 1), else_=Video.view_count)
    
    videos = db.query(Video)\
        .options(joinedload(Video.author))\
        .filter(Video.status == 'published', Video.visibility == 'public')\
        .order_by(ratio_expr.desc())\
        .limit(limit)\
        .all()
    
    # Format response
    return [
        VideoListResponse(
            id=video.id,
            title=video.title,
            video_url=get_video_url(video.video_filename),
            thumbnail_url=get_thumbnail_url(video.thumbnail_filename),
            view_count=video.view_count,
            upload_date=video.upload_date.isoformat() + "Z",
            duration=video.duration,
            category=video.category,
            like_count=video.like_count,
            author=AuthorResponse(
                id=video.author.id,
                username=video.author.username,
                profile_image=video.author.profile_image,
                video_count=video.author.videos.count()
            )
        )
        for video in videos
    ]
