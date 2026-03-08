from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from typing import List, Optional
from datetime import datetime, timedelta

from backend.database.connection import get_db
from backend.database.models import User, StreamModerator, StreamBan, StreamTimeout, ModerationActionLog
from backend.services.auth_service import get_current_user
from pydantic import BaseModel, Field

router = APIRouter(tags=["moderation"])

# ============================================================================
# Schemas
# ============================================================================

class BanRequest(BaseModel):
    username: str
    reason: str = Field(..., min_length=3)
    duration: Optional[int] = None # Seconds, null = permanent

class TimeoutRequest(BaseModel):
    username: str
    duration: int # Seconds
    reason: str = Field(..., min_length=3)

class PermissionGrantRequest(BaseModel):
    username: str
    tier: int # 2: Mod, 3: Sr Mod, 4: Admin

class ModActionResponse(BaseModel):
    success: bool
    message: str

class UserPermissionsResponse(BaseModel):
    user_id: int
    username: str
    tier: int
    permissions: Optional[dict] = None

class ActionLogResponse(BaseModel):
    id: int
    action_type: str
    target_username: str
    performed_by_username: str
    timestamp: datetime
    details: Optional[dict] = None

# ============================================================================
# Helpers
# ============================================================================

def log_moderation_action(db: Session, action_type: str, target_id: int, actor_id: int, channel_id: int, details: dict = None):
    log = ModerationActionLog(
        action_type=action_type,
        target_user_id=target_id,
        performed_by_id=actor_id,
        channel_id=channel_id,
        details=details
    )
    db.add(log)
    db.commit()

# ============================================================================
# Moderation Endpoints
# ============================================================================

@router.post("/moderation/ban", response_model=ModActionResponse)
async def ban_user(
    req: BanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
        
    # Permission check: current_user.tier must be >= 3 to ban (Sr Mod+)
    if current_user.tier < 3:
        raise HTTPException(status_code=403, detail="Insufficient permissions to ban")
        
    # Cannot ban someone of equal or higher tier
    if target_user.tier >= current_user.tier:
        raise HTTPException(status_code=403, detail="Cannot ban users of equal or higher rank")

    expires_at = None
    if req.duration:
        # Permission check: Sr Moderators (Tier 3) can only ban up to 7 days
        if current_user.tier == 3 and req.duration > 7 * 24 * 3600:
             raise HTTPException(status_code=403, detail="Senior Moderators can only ban for up to 7 days")
        expires_at = datetime.utcnow() + timedelta(seconds=req.duration)

    existing_ban = db.query(StreamBan).filter(
        StreamBan.channel_id == current_user.id,
        StreamBan.banned_user_id == target_user.id
    ).first()
    
    if existing_ban:
        existing_ban.reason = req.reason
        existing_ban.expires_at = expires_at
        existing_ban.banned_by_id = current_user.id
    else:
        new_ban = StreamBan(
            channel_id=current_user.id,
            banned_user_id=target_user.id,
            banned_by_id=current_user.id,
            reason=req.reason,
            expires_at=expires_at
        )
        db.add(new_ban)
    
    log_moderation_action(db, "ban", target_user.id, current_user.id, current_user.id, {"reason": req.reason, "duration": req.duration})
    
    # WebSocket Broadcast (Layer 3: Backend Action)
    from backend.chat.manager import manager
    await manager.broadcast(current_user.username, {
        "type": "user.banned",
        "userId": target_user.id,
        "username": target_user.username,
        "reason": req.reason,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "banned_by": current_user.username,
        "duration": req.duration
    })
    
    # Layer 3: Force disconnect
    await manager.disconnect_user(current_user.username, target_user.username, f"You have been banned. Reason: {req.reason}")

    return ModActionResponse(success=True, message=f"User {req.username} banned")

@router.post("/moderation/unban", response_model=ModActionResponse)
async def unban_user(
    req: BanRequest, # Using same model for username
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if current_user.tier < 3:
        raise HTTPException(status_code=403, detail="Insufficient permissions to unban")

    ban = db.query(StreamBan).filter(
        StreamBan.channel_id == current_user.id,
        StreamBan.banned_user_id == target_user.id
    ).first()
    
    if ban:
        db.delete(ban)
        db.commit()
        log_moderation_action(db, "unban", target_user.id, current_user.id, current_user.id)
        return ModActionResponse(success=True, message=f"User {req.username} unbanned")
    
    return ModActionResponse(success=False, message="User was not banned")

@router.post("/moderation/timeout", response_model=ModActionResponse)
async def timeout_user(
    req: TimeoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if current_user.tier < 2:
        raise HTTPException(status_code=403, detail="Insufficient permissions to timeout")
        
    if target_user.tier >= current_user.tier:
        raise HTTPException(status_code=403, detail="Cannot timeout users of equal or higher rank")

    # Mod (Tier 2) can only timeout up to 10 min
    if current_user.tier == 2 and req.duration > 600:
        raise HTTPException(status_code=403, detail="Moderators can only timeout for up to 10 minutes")

    expires_at = datetime.utcnow() + timedelta(seconds=req.duration)
    
    timeout = StreamTimeout(
        channel_id=current_user.id,
        timed_out_user_id=target_user.id,
        timed_out_by_id=current_user.id,
        reason=req.reason,
        expires_at=expires_at
    )
    db.add(timeout)
    db.commit()
    
    log_moderation_action(db, "timeout", target_user.id, current_user.id, current_user.id, {"duration": req.duration, "reason": req.reason})
    
    # WebSocket Broadcast
    from backend.chat.manager import manager
    await manager.broadcast(current_user.username, {
        "type": "user.timedout",
        "userId": target_user.id,
        "username": target_user.username,
        "reason": req.reason,
        "expires_at": expires_at.isoformat(),
        "banned_by": current_user.username,
        "duration": req.duration
    })
    
    # Layer 3: Force disconnect
    await manager.disconnect_user(current_user.username, target_user.username, f"You have been timed out for {req.duration}s. Reason: {req.reason}")

    return ModActionResponse(success=True, message=f"User {req.username} timed out")

@router.delete("/moderation/message/{message_id}", response_model=ModActionResponse)
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.tier < 2:
        raise HTTPException(status_code=403, detail="Insufficient permissions to delete messages")
    
    # In a real app, we'd find the message in the DB and delete it.
    # For now, we'll log the action. The WebSocket will handle the real-time removal.
    log_moderation_action(db, "delete_message", 0, current_user.id, current_user.id, {"message_id": message_id})
    return ModActionResponse(success=True, message="Message deleted")

@router.get("/moderation/bans/active", response_model=List[dict])
async def get_active_bans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.tier < 2:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    now = datetime.utcnow()
    bans = db.query(StreamBan).filter(
        StreamBan.channel_id == current_user.id,
        or_(StreamBan.expires_at == None, StreamBan.expires_at > now)
    ).all()
    
    result = []
    for b in bans:
        user = db.query(User).filter(User.id == b.banned_user_id).first()
        banned_by = db.query(User).filter(User.id == b.banned_by_id).first()
        if user:
            result.append({
                "username": user.username,
                "reason": b.reason,
                "expires_at": b.expires_at,
                "created_at": b.created_at,
                "banned_by": banned_by.username if banned_by else "System"
            })
    return result

@router.get("/moderation/actions", response_model=List[ActionLogResponse])
async def get_moderation_log(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.tier < 3:
        raise HTTPException(status_code=403, detail="Insufficient permissions to view logs")
        
    logs = db.query(ModerationActionLog).filter(
        ModerationActionLog.channel_id == current_user.id
    ).order_by(desc(ModerationActionLog.timestamp)).offset(offset).limit(limit).all()
    
    result = []
    for l in logs:
        target = db.query(User).filter(User.id == l.target_user_id).first()
        actor = db.query(User).filter(User.id == l.performed_by_id).first()
        result.append(ActionLogResponse(
            id=l.id,
            action_type=l.action_type,
            target_username=target.username if target else "Unknown",
            performed_by_username=actor.username if actor else "System",
            timestamp=l.timestamp,
            details=l.details
        ))
    return result

# ============================================================================
# Permissions Endpoints
# ============================================================================

@router.post("/permissions/grant", response_model=ModActionResponse)
async def grant_permission(
    req: PermissionGrantRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only Broadcaster (Tier 5) or high-level Admin can grant tiers
    if current_user.tier < 4:
        raise HTTPException(status_code=403, detail="Insufficient permissions to grant roles")
        
    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if req.tier >= current_user.tier and current_user.tier < 5:
        raise HTTPException(status_code=403, detail="Cannot grant a tier equal or higher than your own")

    target_user.tier = req.tier
    db.commit()
    
    # Also track in channel_moderators if specifically for this channel (simplified here)
    log_moderation_action(db, "promote", target_user.id, current_user.id, current_user.id, {"new_tier": req.tier})
    
    return ModActionResponse(success=True, message=f"{req.username} promoted to Tier {req.tier}")

@router.post("/permissions/revoke", response_model=ModActionResponse)
async def revoke_permission(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.tier < 4:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    target_user = db.query(User).filter(User.username == username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.tier >= current_user.tier and current_user.tier < 5:
        raise HTTPException(status_code=403, detail="Cannot revoke permissions from equal or higher rank")

    target_user.tier = 1
    db.commit()
    
    log_moderation_action(db, "demote", target_user.id, current_user.id, current_user.id, {"new_tier": 1})
    return ModActionResponse(success=True, message=f"Permissions revoked for {username}")

@router.get("/permissions/user/{user_id}", response_model=UserPermissionsResponse)
async def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return UserPermissionsResponse(
        user_id=user.id,
        username=user.username,
        tier=user.tier,
        permissions=user.permissions
    )

@router.get("/permissions/channel/{channel_id}", response_model=List[dict])
async def get_channel_moderators(
    channel_id: int,
    db: Session = Depends(get_db)
):
    # In this simplified model, we look for users with Tier > 1 that are "associated" with channel.
    # For now, let's just return all Tier > 1 users as global mods/admins for testing, 
    # or implement a specific ChannelModerator check if we had that link properly.
    mods = db.query(User).filter(User.tier > 1).all() # This is a placeholder for real channel mod query
    return [{"username": u.username, "tier": u.tier} for u in mods]
