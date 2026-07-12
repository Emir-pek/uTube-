from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Dict, Any

from backend.database import get_db
from backend.database.models import User, ChatMessage, ActivityLog, StreamMarker

router = APIRouter(tags=["Streams"])

@router.get("/{username}")
def get_stream(username: str, db: Session = Depends(get_db)):
    """
    Fetch full stream metadata for the WatchPage.
    Includes is_live status and the stream_key for the player.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {
        "is_live": user.is_live,
        "stream_key": user.stream_key,
        "stream_title": user.stream_title,
        "stream_category": user.stream_category,
        "stream_thumbnail": user.stream_thumbnail,
        "user": {
            "username": user.username,
            "profile_image": user.profile_image
        }
    }

@router.get("/{streamer_username}/stats")
def get_stream_stats(streamer_username: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Fetch real-time analytics for the Live Studio dashboard.
    Retrieves the actual DB metrics rather than mock data.
    """
    now = datetime.utcnow()
    one_minute_ago = now - timedelta(minutes=1)

    # 1. Chat Rate (messages in the last 60 seconds)
    chat_rate = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.room == streamer_username,
        ChatMessage.created_at >= one_minute_ago
    ).scalar() or 0

    # 2. New Subscribers (computed from activity log where type == 'subscribe' during this session)
    # We define the "session" as the last 4 hours for the sake of the live dashboard
    session_start = now - timedelta(hours=4)
    new_subs = db.query(func.count(ActivityLog.id)).filter(
        ActivityLog.room == streamer_username,
        ActivityLog.activity_type == 'subscribe',
        ActivityLog.created_at >= session_start
    ).scalar() or 0

    # 3. Viewers
    # The actual real-time viewer count requires Redis or the active WS manager.
    # We will try to fetch it from the Chat WS Manager directly if possible.
    try:
        from backend.chat.manager import manager
        actual_viewers = manager.get_viewers_count(streamer_username)
    except Exception:
        actual_viewers = 0

    # Return structured payload for LiveStudio.jsx
    return {
        "chat_rate": chat_rate,
        "new_subs": new_subs,
        "current_viewers": actual_viewers,
        # Note: Peak viewers and Total Watch time should ideally be tracked via Redis/DB across the session.
        # For this refactor, we provide the real-time core metrics. The frontend will aggregate peak.
    }
