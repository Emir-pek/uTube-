"""
Chat Routes
-----------
WebSocket endpoint for real-time live stream chat.
HTTP endpoints for fetching message history, activity history, and clip logging.

Endpoints:
- WS  /ws/chat/{streamer_username}?token=XYZ  (real-time chat)
- GET /chat/history/{streamer_username}        (last 50 messages)
- GET /live/activity/history/{streamer_username} (last 10 activities)
- POST /live/clip                              (log clip timestamp)

WebSocket Commands (from creator):
- { type: "command", action: "slow_mode", enabled: true/false }
- { type: "command", action: "delete_message", msg_id: "..." }
- { type: "command", action: "poll_start", data: { question, options } }
- { type: "command", action: "poll_end" }

WebSocket Actions (from any authenticated user):
- { type: "poll_vote", option: "..." }
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import datetime, timedelta
import json
import time

from backend.database import get_db, SessionLocal
from backend.database.models import User, ChatMessage, ActivityLog, ClipLog, StreamMarker, StreamModerator, StreamBan, StreamTimeout
from backend.core.security import decode_access_token
from backend.chat.manager import manager

router = APIRouter(tags=["Chat"])

# ============================================================================
# Helper: Validate JWT from query param
# ============================================================================

def validate_ws_token(token: Optional[str], db: Session) -> Optional[User]:
    """Validate a JWT token from WebSocket query parameter."""
    if not token:
        return None
    try:
        payload = decode_access_token(token.strip())
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


# ============================================================================
# WebSocket: Minimal Test Endpoint (diagnostic — no auth, no DB)
# ============================================================================

@router.websocket("/ws/test")
async def test_websocket(websocket: WebSocket):
    """Minimal WS endpoint to verify basic WebSocket connectivity."""
    print("=" * 50)
    print("[WS TEST] Connection attempt received!")
    print("=" * 50)

    await websocket.accept()
    print("[WS TEST] ✅ WebSocket accepted successfully!")

    await websocket.send_json({
        "message": "Test connection successful!",
        "timestamp": datetime.utcnow().isoformat()
    })

    try:
        while True:
            data = await websocket.receive_text()
            print(f"[WS TEST] Received: {data}")
            await websocket.send_json({"echo": data})
    except WebSocketDisconnect:
        print("[WS TEST] Client disconnected normally")
    except Exception as e:
        print(f"[WS TEST] Error: {e}")


# ============================================================================
# WebSocket: Real-time Chat
# ============================================================================

@router.websocket("/ws/chat/{streamer_username}")
async def chat_websocket(
    websocket: WebSocket,
    streamer_username: str,
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for live stream chat.
    
    Auth: Token validated on handshake. No token = read-only.
    Creator (sender === room owner) gets isMod: true automatically.
    """
    print("🟢" * 40)
    print(f"🟢 ENDPOINT REACHED - streamer: {streamer_username}")
    print(f"🟢 Token present: {token is not None}")
    print("🟢" * 40)
    
    # CRITICAL: Accept the WebSocket FIRST
    try:
        print("🔵 Attempting to accept WebSocket...")
        await websocket.accept()
        print("✅ WebSocket accepted successfully!")
    except Exception as e:
        print(f"❌ FAILED TO ACCEPT: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    user = None
    try:
        print("🔵 Creating database session...")
        db = SessionLocal()
        try:
            print("🔵 Validating token...")
            user = validate_ws_token(token, db)
            print(f"✅ Token validation: {'Success - ' + user.username if user else 'Failed/Anonymous'}")
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️ Token validation error (continuing as anonymous): {e}")
    
    username = user.username if user else None
    user_id = user.id if user else None
    is_mod = False
    is_creator = (username == streamer_username)
    user_tier = 1
    
    if user:
        # Check if user is a moderator for this channel
        # (Using the new 5-tier system from User model)
        user_tier = user.tier
        
        # Room owners are always Tier 5 (Broadcasters)
        if is_creator:
            user_tier = 5
            streamer_user_id = user.id
        else:
            # Need streamer's ID for moderation checks
            db = SessionLocal()
            try:
                streamer = db.query(User).filter(User.username == streamer_username).first()
                streamer_user_id = streamer.id if streamer else None
            finally:
                db.close()
            
        if user_tier >= 2 or is_creator:
            is_mod = True
            
    role_label = "Viewer"
    if user_tier == 2: role_label = "Moderator"
    elif user_tier == 3: role_label = "Sr Moderator"
    elif user_tier == 4: role_label = "Admin"
    elif user_tier == 5: role_label = "Broadcaster"
    
    print(f"✅ User: {username or 'anonymous'}, is_creator: {is_creator}, role: {role_label}")
    
    # Join room
    if streamer_username not in manager.rooms:
        manager.rooms[streamer_username] = []
    manager.rooms[streamer_username].append((websocket, username))
    print(f"✅ Added to room. Total connections: {len(manager.rooms[streamer_username])}")
    
    # Send personal connection confirmation
    try:
        await manager.send_personal(websocket, {
            "type": "system",
            "id": f"sys-{int(time.time() * 1000)}",
            "user": "System",
            "text": f"Connected to {streamer_username}'s chat" + (f" as {username}" if username else " (read-only)"),
            "timestamp": int(time.time() * 1000),
            "isMod": is_mod,
            "tier": user_tier,
            "role": role_label,
            "isCreator": is_creator
        })
        print("✅ Connection confirmation sent")
    except Exception as e:
        print(f"⚠️ Failed to send confirmation: {e}")
    
    # Send current slow mode state
    try:
        await manager.send_personal(websocket, {
            "type": "slow_mode",
            "enabled": manager.is_slow_mode(streamer_username)
        })
    except Exception as e:
        print(f"⚠️ Failed to send slow mode state: {e}")
    
    # Send active poll if one exists
    try:
        active_poll = manager.get_poll(streamer_username)
        if active_poll:
            await manager.send_personal(websocket, {
                "type": "poll_update",
                **active_poll
            })
    except Exception as e:
        print(f"⚠️ Failed to send poll state: {e}")
    
    # Broadcast updated viewer list to all
    try:
        await manager.broadcast_viewer_list(streamer_username)
        print("✅ Viewer list broadcasted")
    except Exception as e:
        print(f"⚠️ Failed to broadcast viewer list: {e}")
    
    # Continue with your existing message loop...
    try:
        print("✅ Entering message loop...")
        while True:
            raw = await websocket.receive_text()
            
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(websocket, {
                    "type": "error", "text": "Invalid message format"
                })
                continue
            
            # ... [ALL YOUR EXISTING MESSAGE HANDLING CODE - KEEP AS IS]
            # (Keep everything from "Handle Standardized Poll Messages" onwards)
            
            msg_type = data.get("type")
            
            if msg_type == "POLL_VOTE":
                if not username:
                    await manager.send_personal(websocket, {"type": "error", "text": "Login required to vote"})
                    continue
                option_index = data.get("optionIndex")
                if option_index is None:
                    continue
                
                accepted = manager.vote_poll(streamer_username, username, option_index)
                if accepted:
                    await manager.broadcast(streamer_username, {
                        "type": "POLL_VOTE",
                        "optionIndex": option_index
                    })
                else:
                    await manager.send_personal(websocket, {"type": "error", "text": "Already voted or invalid option"})
                continue

            if msg_type == "POLL_START":
                if not is_creator:
                    await manager.send_personal(websocket, {"type": "error", "text": "Only the creator can start polls"})
                    continue
                poll_data = data.get("data", {})
                question = poll_data.get("question", "").strip()
                options = poll_data.get("options", [])
                duration = poll_data.get("duration", 60)
                
                if not question or len(options) < 2:
                    await manager.send_personal(websocket, {"type": "error", "text": "Invalid poll data"})
                else:
                    manager.start_poll(streamer_username, question, options, duration)
                    full_poll = manager.get_poll(streamer_username)
                    await manager.broadcast(streamer_username, {
                        "type": "POLL_START",
                        "data": full_poll
                    })
                continue

            if msg_type == "POLL_END":
                if not is_creator:
                    continue
                results = manager.end_poll(streamer_username)
                await manager.broadcast(streamer_username, {
                    "type": "POLL_END",
                    "data": results
                })
                continue

            if msg_type == "poll_vote":
                pass
            
            if msg_type == "command":
                if not is_mod:
                    await manager.send_personal(websocket, {
                        "type": "error", "text": "Only moderators can use commands"
                    })
                    continue
                
                action = data.get("action")
                
                if action == "slow_mode":
                    enabled = data.get("enabled", False)
                    manager.set_slow_mode(streamer_username, enabled)
                    await manager.broadcast(streamer_username, {
                        "type": "slow_mode",
                        "enabled": enabled
                    })
                    await manager.broadcast(streamer_username, {
                        "type": "system",
                        "id": f"sys-{int(time.time() * 1000)}",
                        "user": "System",
                        "text": f"Slow mode {'enabled (5s cooldown)' if enabled else 'disabled'}",
                        "timestamp": int(time.time() * 1000),
                        "isMod": True
                    })
                
                elif action == "delete_message":
                    msg_id = data.get("msg_id")
                    if msg_id and user_tier >= 2:
                        await manager.broadcast(streamer_username, {
                            "type": "message.deleted",
                            "msg_id": msg_id
                        })
                        # Persistence logic
                        db = SessionLocal()
                        try:
                            db_id_str = msg_id.replace("msg-", "")
                            try:
                                db_id = int(db_id_str)
                                db.query(ChatMessage).filter(
                                    ChatMessage.id == db_id,
                                    ChatMessage.room == streamer_username
                                ).delete()
                                db.commit()
                            except ValueError:
                                pass
                        except Exception:
                            db.rollback()
                        finally:
                            db.close()
                            
                elif action == "timeout_user" or action == "ban_user":
                    # DEPRECATED: Use HTTP API /api/moderation/ban or /api/moderation/timeout
                    # to ensure reasons are provided and validated.
                    await manager.send_personal(websocket, {
                        "type": "error", 
                        "text": "Mod action must be performed via the Moderation Panel (API) to include a reason."
                    })
                continue
            
            if not username:
                await manager.send_personal(websocket, {
                    "type": "error", "text": "You must be logged in to send messages"
                })
                continue
            
            text = data.get("text", "").strip()
            if not text:
                continue
            
            
            # Layer 3: Server-Side Validation (CRITICAL)
            if not is_creator and username:
                db = SessionLocal()
                try:
                    now = datetime.utcnow()
                    
                    # 1. Check for active ban
                    ban = db.query(StreamBan).filter(
                        StreamBan.channel_id == streamer_user_id,
                        StreamBan.banned_user_id == user_id,
                        or_(StreamBan.expires_at == None, StreamBan.expires_at > now)
                    ).first()
                    
                    if ban:
                        await manager.send_personal(websocket, {
                            "type": "user.banned",
                            "userId": user_id,
                            "reason": ban.reason,
                            "expires_at": ban.expires_at.isoformat() if ban.expires_at else None,
                            "banned_by": "System" # Or lookup banned_by_id
                        })
                        continue
                        
                    # 2. Check for active timeout
                    timeout = db.query(StreamTimeout).filter(
                        StreamTimeout.channel_id == streamer_user_id,
                        StreamTimeout.timed_out_user_id == user_id,
                        StreamTimeout.expires_at > now
                    ).order_by(StreamTimeout.expires_at.desc()).first()
                    
                    if timeout:
                        time_left = int((timeout.expires_at - now).total_seconds())
                        await manager.send_personal(websocket, {
                            "type": "user.timedout",
                            "userId": user_id,
                            "reason": timeout.reason,
                            "expires_at": timeout.expires_at.isoformat(),
                            "secondsRemaining": time_left
                        })
                        continue
                finally:
                    db.close()
                        
            if not is_creator and not manager.check_slow_mode_cooldown(streamer_username, username):
                await manager.send_personal(websocket, {
                    "type": "error",
                    "text": f"Slow mode is on. Wait {manager.SLOW_MODE_COOLDOWN}s between messages."
                })
                continue
            
            if len(text) > 500:
                text = text[:500]
            
            timestamp = int(time.time() * 1000)
            
            db = SessionLocal()
            try:
                chat_msg = ChatMessage(
                    room=streamer_username,
                    sender=username,
                    text=text,
                    is_mod=is_creator
                )
                db.add(chat_msg)
                db.commit()
                db.refresh(chat_msg)
                msg_id = f"msg-{chat_msg.id}"
            except Exception:
                db.rollback()
                msg_id = f"msg-{timestamp}"
            finally:
                db.close()
            
            await manager.broadcast(streamer_username, {
                "type": "chat",
                "id": msg_id,
                "user": username,
                "text": text,
                "timestamp": timestamp,
                "isMod": is_creator
            })
    
    except WebSocketDisconnect:
        print(f"🔌 Client disconnected: {username or 'anonymous'}")
        manager.disconnect(streamer_username, websocket)
        await manager.broadcast_viewer_list(streamer_username)
    except Exception as e:
        print(f"❌ Error in message loop: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        manager.disconnect(streamer_username, websocket)
        await manager.broadcast_viewer_list(streamer_username)

# ============================================================================
# HTTP: Chat History
# ============================================================================

@router.get("/history/{streamer_username}")
def get_chat_history(
    streamer_username: str,
    limit: int = 30,
    db: Session = Depends(get_db)
):
    """Fetch the latest chat messages for a streamer's room and return chronologically."""
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.room == streamer_username)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    
    # Reverse to chronological order (oldest first)
    messages.reverse()
    
    return [
        {
            "id": f"msg-{msg.id}",
            "user": msg.sender,
            "text": msg.text,
            "timestamp": int(msg.created_at.timestamp() * 1000),
            "isMod": msg.is_mod
        }
        for msg in messages
    ]


# ============================================================================
# HTTP: Stream Marker
# ============================================================================

@router.post("/live/marker")
def create_marker(
    db: Session = Depends(get_db)
):
    """Save a stream marker timestamp for future reference."""
    marker = StreamMarker(
        room="system",
        username="creator",
        marker_timestamp=datetime.utcnow()
    )
    db.add(marker)
    db.commit()

    return {"success": True, "marker_id": marker.id, "timestamp": marker.marker_timestamp.isoformat() + "Z"}
