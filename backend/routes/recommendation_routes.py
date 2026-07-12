"""
Recommendation Feed Routes
---------------------------
Hybrid recommendation system based on user preferences and behavior.

Endpoints:
- GET /feed/recommended: Get personalized video recommendations
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional
from collections import Counter

from backend.database import get_db
from backend.database.models import User, Video, Like, Subscription
from backend.routes.auth_routes import get_current_user, get_optional_user
from backend.routes.video_routes import (
    VideoListResponse, 
    AuthorResponse, 
    get_thumbnail_url, 
    get_video_url, 
    parse_tags
)

# Create router
router = APIRouter(prefix="/feed", tags=["Recommendations"])


@router.get("/recommended", response_model=List[VideoListResponse])
def get_recommended_feed(
    limit: int = 20,
    author_id: Optional[int] = None,
    category: Optional[str] = None,
    exclude_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Get hybrid video recommendations (80/20 Contextual/Discovery split).
    """
    if limit > 50:
        limit = 50
        
    limit_contextual = int(limit * 0.8)
    limit_discovery = limit - limit_contextual
    
    recommended_ids = []
    
    # 1. Contextual recommendations (80%)
    # Same Category or Same Author
    if author_id or category:
        conditions = []
        if author_id:
            conditions.append(Video.user_id == author_id)
        if category:
            conditions.append(Video.category == category)
            
        context_query = db.query(Video.id).filter(
            or_(*conditions),
            Video.status == 'published',
            Video.visibility == 'public'
        )
        
        if exclude_id:
            context_query = context_query.filter(Video.id != exclude_id)
            
        context_videos = context_query.order_by(Video.view_count.desc()).limit(limit_contextual).all()
        recommended_ids.extend([v.id for v in context_videos])
        
    # 2. Discovery factor (20%)
    # Random videos from different categories
    discovery_query = db.query(Video.id).filter(
        Video.status == 'published',
        Video.visibility == 'public'
    )
    
    # Exclude current video and already picked contextual videos
    exclude_ids = recommended_ids.copy()
    if exclude_id:
        exclude_ids.append(exclude_id)
        
    if exclude_ids:
        discovery_query = discovery_query.filter(~Video.id.in_(exclude_ids))
        
    # Try to pick from different categories if possible
    if category:
        discovery_query = discovery_query.filter(Video.category != category)
        
    discovery_videos = discovery_query.order_by(Video.view_count.desc()).limit(limit_discovery).all()
    recommended_ids.extend([v.id for v in discovery_videos])
    
    # 3. Fill remaining slots if needed (e.g. not enough different categories)
    if len(recommended_ids) < limit:
        remaining = limit - len(recommended_ids)
        refill_query = db.query(Video.id).filter(
            ~Video.id.in_(recommended_ids),
            Video.status == 'published',
            Video.visibility == 'public'
        )
        if exclude_id:
            refill_query = refill_query.filter(Video.id != exclude_id)
            
        refill_videos = refill_query.order_by(Video.view_count.desc()).limit(remaining).all()
        recommended_ids.extend([v.id for v in refill_videos])
        
    # Fetch full details
    videos = db.query(Video).filter(Video.id.in_(recommended_ids)).all()
    
    # Maintain the hybrid order (sort by the order of recommended_ids)
    video_map = {v.id: v for v in videos}
    ordered_videos = [video_map[vid] for vid in recommended_ids if vid in video_map]

    
    # Format response
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
        for video in ordered_videos
    ]


@router.get("/subscriptions", response_model=List[VideoListResponse])
def get_subscription_feed(
    limit: int = 20,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get latest videos from channels the current user is subscribed to.
    Returns videos sorted by upload date (newest first).
    """
    if limit > 50:
        limit = 50

    # Get IDs of users the current user follows
    followed_ids = db.query(Subscription.following_id).filter(
        Subscription.follower_id == current_user.id
    ).all()
    followed_ids = [fid[0] for fid in followed_ids]

    if not followed_ids:
        return []

    # Get latest videos from those users
    videos = (
        db.query(Video)
        .filter(Video.user_id.in_(followed_ids))
        .filter(Video.status == 'published', Video.visibility == 'public')
        .order_by(Video.upload_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

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
        for video in videos
    ]
