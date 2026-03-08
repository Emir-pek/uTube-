"""
Admin Routes
------------
Privileged endpoints accessible only to admin users.
All actions are recorded in the AdminAuditLog table.

Endpoints:
- GET  /admin/users                         : List all users
- GET  /admin/videos                        : List all videos
- DELETE /admin/videos/{id}                 : Delete a video
- PATCH /admin/videos/{id}/visibility       : Change video visibility
- POST /admin/users/{id}/ban-upload         : Ban user from uploading
- DELETE /admin/users/{id}/ban-upload       : Unban user from uploading
- DELETE /admin/comments/{id}               : Delete any comment
- POST /admin/warnings                      : Send a warning to a user
- GET  /admin/stats/video/{id}              : Video statistics
- GET  /admin/stats/channel/{id}            : Channel statistics
- GET  /admin/audit-log                     : View all admin actions
- GET  /notifications                       : Current user's warnings (non-admin)
- POST /notifications/{id}/read             : Mark warning as read
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import os
import shutil

from backend.database import get_db
from backend.database.models import User, Video, Comment, Like, Subscription, AdminAuditLog, AdminWarning
from backend.routes.auth_routes import get_current_user
from backend.core.config import VIDEOS_DIR, THUMBNAILS_DIR

router = APIRouter(tags=["Admin"])


# ============================================================================
# Admin Dependency
# ============================================================================

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Raises 403 Forbidden if the current user does not have admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )
    return current_user


# ============================================================================
# Helper: Audit Logging
# ============================================================================

def log_admin_action(
    db: Session,
    admin: User,
    action_type: str,
    target_type: str,
    target_id: Optional[int],
    detail: Optional[str] = None
):
    """Record an admin action in the AdminAuditLog table."""
    log = AdminAuditLog(
        admin_user_id=admin.id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
    )
    db.add(log)
    db.flush()


# ============================================================================
# Pydantic Schemas
# ============================================================================

class AdminUserItem(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    upload_banned: bool
    upload_ban_reason: Optional[str] = None
    is_verified: bool
    is_live: bool
    subscriber_count: int = 0
    video_count: int = 0
    total_views: int = 0
    total_likes: int = 0
    created_at: str

    class Config:
        from_attributes = True


class AdminVideoItem(BaseModel):
    id: int
    title: str
    status: str
    visibility: str
    view_count: int
    upload_date: str
    author_id: int
    author_username: Optional[str] = None

    class Config:
        from_attributes = True


class VisibilityUpdate(BaseModel):
    visibility: str = Field(..., pattern="^(public|unlisted|private)$")


class BanUploadRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class AdminWarningRequest(BaseModel):
    target_user_id: int
    title: str = Field(..., min_length=3, max_length=200)
    message: str = Field(..., min_length=10)


class AdminWarningResponse(BaseModel):
    id: int
    target_user_id: int
    admin_id: Optional[int] = None
    title: str
    message: str
    is_read: bool
    created_at: str

    class Config:
        from_attributes = True


class AuditLogItem(BaseModel):
    id: int
    admin_username: Optional[str] = None
    action_type: str
    target_type: str
    target_id: Optional[int] = None
    detail: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class VideoStatsResponse(BaseModel):
    video_id: int
    title: str
    view_count: int
    like_count: int
    dislike_count: int
    comment_count: int
    upload_date: str
    status: str
    visibility: str
    author_username: Optional[str] = None


class ChannelStatsResponse(BaseModel):
    user_id: int
    username: str
    subscriber_count: int
    video_count: int
    total_views: int
    total_likes: int
    is_live: bool
    upload_banned: bool
    created_at: str


# ============================================================================
# User Management
# ============================================================================

@router.get("/admin/users", response_model=List[AdminUserItem])
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return paginated list of all users."""
    query = db.query(User)
    if search:
        query = query.filter(
            User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    users = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for u in users:
        sub_count = db.query(func.count(Subscription.id)).filter(Subscription.following_id == u.id).scalar() or 0
        vid_count = db.query(func.count(Video.id)).filter(Video.user_id == u.id).scalar() or 0
        total_views = db.query(func.coalesce(func.sum(Video.view_count), 0)).filter(Video.user_id == u.id).scalar() or 0
        video_ids = [v.id for v in db.query(Video.id).filter(Video.user_id == u.id).all()]
        total_likes = 0
        if video_ids:
            total_likes = db.query(func.count(Like.id)).filter(Like.video_id.in_(video_ids), Like.is_dislike == False).scalar() or 0
        result.append(AdminUserItem(
            id=u.id,
            username=u.username,
            email=u.email,
            is_admin=bool(u.is_admin),
            upload_banned=bool(u.upload_banned),
            upload_ban_reason=u.upload_ban_reason,
            is_verified=bool(u.is_verified),
            is_live=bool(u.is_live),
            subscriber_count=sub_count,
            video_count=vid_count,
            total_views=total_views,
            total_likes=total_likes,
            created_at=u.created_at.isoformat() + "Z",
        ))
    return result


@router.post("/admin/users/{user_id}/ban-upload", status_code=200)
def ban_user_upload(
    user_id: int,
    body: BanUploadRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Prevent a user from uploading new videos."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot ban another admin")
    user.upload_banned = True
    user.upload_ban_reason = body.reason
    log_admin_action(db, admin, "BAN_UPLOAD", "user", user_id, body.reason)
    db.commit()
    return {"detail": f"User '{user.username}' banned from uploading."}


@router.delete("/admin/users/{user_id}/ban-upload", status_code=200)
def unban_user_upload(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Restore a user's ability to upload videos."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.upload_banned = False
    user.upload_ban_reason = None
    log_admin_action(db, admin, "UNBAN_UPLOAD", "user", user_id)
    db.commit()
    return {"detail": f"User '{user.username}' upload ban lifted."}


# ============================================================================
# Video Management
# ============================================================================

@router.get("/admin/videos", response_model=List[AdminVideoItem])
def list_all_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return paginated list of all videos."""
    query = db.query(Video)
    if search:
        query = query.filter(Video.title.ilike(f"%{search}%"))
    if status_filter:
        query = query.filter(Video.status == status_filter)
    videos = query.order_by(Video.upload_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for v in videos:
        author = db.query(User).filter(User.id == v.user_id).first()
        result.append(AdminVideoItem(
            id=v.id,
            title=v.title,
            status=v.status or "unknown",
            visibility=v.visibility or "public",
            view_count=v.view_count or 0,
            upload_date=v.upload_date.isoformat() + "Z",
            author_id=v.user_id,
            author_username=author.username if author else None,
        ))
    return result


@router.delete("/admin/videos/{video_id}", status_code=200)
def admin_delete_video(
    video_id: int,
    reason: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a video and optionally its physical files."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    title = video.title
    # Attempt to delete physical files (non-blocking)
    try:
        if video.video_filename:
            video_path = VIDEOS_DIR / video.video_filename
            if video_path.exists():
                video_path.unlink()
        if video.thumbnail_filename:
            thumb_path = THUMBNAILS_DIR / video.thumbnail_filename
            if thumb_path.exists():
                thumb_path.unlink()
    except Exception:
        pass  # File deletion is best-effort

    log_admin_action(db, admin, "DELETE_VIDEO", "video", video_id, reason or f"Title: {title}")
    db.delete(video)
    db.commit()
    return {"detail": f"Video '{title}' deleted."}


@router.patch("/admin/videos/{video_id}/visibility", status_code=200)
def admin_set_visibility(
    video_id: int,
    body: VisibilityUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Change a video's visibility (public / unlisted / private)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    old = video.visibility
    video.visibility = body.visibility
    log_admin_action(db, admin, "SET_VISIBILITY", "video", video_id, f"{old} → {body.visibility}")
    db.commit()
    return {"detail": f"Video visibility changed to '{body.visibility}'."}


# ============================================================================
# Comment Management
# ============================================================================

@router.delete("/admin/comments/{comment_id}", status_code=200)
def admin_delete_comment(
    comment_id: int,
    reason: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete any comment (admin bypass of ownership check)."""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    log_admin_action(db, admin, "DELETE_COMMENT", "comment", comment_id, reason)
    db.delete(comment)
    db.commit()
    return {"detail": "Comment deleted."}


# ============================================================================
# Warnings
# ============================================================================

@router.post("/admin/warnings", response_model=AdminWarningResponse, status_code=201)
def send_warning(
    body: AdminWarningRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Send a formal warning to a user's notifications."""
    target = db.query(User).filter(User.id == body.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
    warning = AdminWarning(
        target_user_id=body.target_user_id,
        admin_user_id=admin.id,
        title=body.title,
        message=body.message,
    )
    db.add(warning)
    log_admin_action(db, admin, "SEND_WARNING", "user", body.target_user_id, body.title)
    db.commit()
    db.refresh(warning)
    return AdminWarningResponse(
        id=warning.id,
        target_user_id=warning.target_user_id,
        admin_id=warning.admin_user_id,
        title=warning.title,
        message=warning.message,
        is_read=warning.is_read,
        created_at=warning.created_at.isoformat() + "Z",
    )


# ============================================================================
# Statistics
# ============================================================================

@router.get("/admin/stats/video/{video_id}", response_model=VideoStatsResponse)
def video_stats(
    video_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return detailed statistics for a single video."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    like_count = db.query(func.count(Like.id)).filter(Like.video_id == video_id, Like.is_dislike == False).scalar() or 0
    dislike_count = db.query(func.count(Like.id)).filter(Like.video_id == video_id, Like.is_dislike == True).scalar() or 0
    comment_count = db.query(func.count(Comment.id)).filter(Comment.video_id == video_id).scalar() or 0
    author = db.query(User).filter(User.id == video.user_id).first()
    return VideoStatsResponse(
        video_id=video.id,
        title=video.title,
        view_count=video.view_count or 0,
        like_count=like_count,
        dislike_count=dislike_count,
        comment_count=comment_count,
        upload_date=video.upload_date.isoformat() + "Z",
        status=video.status or "unknown",
        visibility=video.visibility or "public",
        author_username=author.username if author else None,
    )


@router.get("/admin/stats/channel/{user_id}", response_model=ChannelStatsResponse)
def channel_stats(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return detailed statistics for a channel/user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    sub_count = db.query(func.count(Subscription.id)).filter(Subscription.following_id == user_id).scalar() or 0
    vid_count = db.query(func.count(Video.id)).filter(Video.user_id == user_id).scalar() or 0
    total_views = db.query(func.coalesce(func.sum(Video.view_count), 0)).filter(Video.user_id == user_id).scalar() or 0
    # Total likes across all this user's videos
    video_ids = [v.id for v in db.query(Video.id).filter(Video.user_id == user_id).all()]
    total_likes = 0
    if video_ids:
        total_likes = db.query(func.count(Like.id)).filter(Like.video_id.in_(video_ids), Like.is_dislike == False).scalar() or 0
    return ChannelStatsResponse(
        user_id=user.id,
        username=user.username,
        subscriber_count=sub_count,
        video_count=vid_count,
        total_views=total_views,
        total_likes=total_likes,
        is_live=bool(user.is_live),
        upload_banned=bool(user.upload_banned),
        created_at=user.created_at.isoformat() + "Z",
    )


# ============================================================================
# Audit Log
# ============================================================================

@router.get("/admin/audit-log")
def get_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return paginated admin audit log, most recent first."""
    logs = (
        db.query(AdminAuditLog)
        .order_by(desc(AdminAuditLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    result = []
    for lg in logs:
        admin_user = db.query(User).filter(User.id == lg.admin_user_id).first() if lg.admin_user_id else None
        result.append({
            "id": lg.id,
            "admin_username": admin_user.username if admin_user else "Unknown",
            "action_type": lg.action_type,
            "target_type": lg.target_type,
            "target_id": lg.target_id,
            "detail": lg.detail,
            "created_at": lg.created_at.isoformat() + "Z",
        })
    return result


# ============================================================================
# Notification Endpoints (non-admin, for regular users)
# ============================================================================

@router.get("/notifications")
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return all AdminWarnings for the current user, ordered by newest first."""
    warnings = (
        db.query(AdminWarning)
        .filter(AdminWarning.target_user_id == current_user.id)
        .order_by(desc(AdminWarning.created_at))
        .all()
    )
    result = []
    for w in warnings:
        result.append({
            "id": w.id,
            "title": w.title,
            "message": w.message,
            "is_read": w.is_read,
            "created_at": w.created_at.isoformat() + "Z",
        })
    return result


@router.get("/notifications/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return count of unread warnings for the bell badge."""
    count = db.query(func.count(AdminWarning.id)).filter(
        AdminWarning.target_user_id == current_user.id,
        AdminWarning.is_read == False
    ).scalar() or 0
    return {"unread_count": count}


@router.post("/notifications/{warning_id}/read", status_code=200)
def mark_notification_read(
    warning_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a specific warning as read."""
    warning = db.query(AdminWarning).filter(
        AdminWarning.id == warning_id,
        AdminWarning.target_user_id == current_user.id
    ).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found")
    warning.is_read = True
    db.commit()
    return {"detail": "Marked as read."}
