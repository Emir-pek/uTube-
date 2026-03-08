"""
Channel Routes
--------------
Public channel page data.

Endpoints:
- GET /channel/{user_id}: Get channel info (username, avatar, banner, subscriber_count, videos)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional

from backend.database import get_db
from backend.database.models import User, Video, Subscription
from backend.routes.video_routes import (
    get_thumbnail_url,
    get_video_url,
    parse_tags,
    _parse_resolutions,
    VideoListResponse,
    AuthorResponse,
)

router = APIRouter(prefix="/channel", tags=["Channel"])


class ChannelResponse(BaseModel):
    """Response model for channel page."""
    id: int
    username: str
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    channel_description: Optional[str] = None
    subscriber_count: int = 0
    videos: List[dict] = []


@router.get("/{user_id}", response_model=ChannelResponse)
def get_channel(user_id: int, db: Session = Depends(get_db)):
    """
    Get channel data for the public channel page.
    Returns username, avatar_url, banner_url, subscriber_count, and published videos.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found"
        )

    subscriber_count = db.query(func.count(Subscription.id)).filter(
        Subscription.following_id == user.id
    ).scalar() or 0

    videos = db.query(Video).filter(
        Video.user_id == user.id,
        Video.status == "published",
        Video.visibility == "public"
    ).order_by(Video.upload_date.desc()).all()

    videos_data = [
        {
            "id": v.id,
            "title": v.title,
            "video_url": get_video_url(v.video_filename, is_temp=False),
            "thumbnail_url": get_thumbnail_url(v.thumbnail_filename),
            "view_count": v.view_count,
            "upload_date": v.upload_date.isoformat() + "Z",
            "duration": v.duration,
            "category": v.category,
            "tags": parse_tags(v.tags),
            "like_count": v.like_count,
            "status": v.status,
            "visibility": v.visibility,
            "resolutions": _parse_resolutions(v),
            "author": {
                "id": user.id,
                "username": user.username,
                "profile_image": user.profile_image,
                "video_count": len(videos),
            },
        }
        for v in videos
    ]

    return ChannelResponse(
        id=user.id,
        username=user.username,
        avatar_url=user.profile_image,
        banner_url=user.channel_banner_url,
        channel_description=user.channel_description,
        subscriber_count=subscriber_count,
        videos=videos_data,
    )
