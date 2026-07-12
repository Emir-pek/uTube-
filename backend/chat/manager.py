"""
WebSocket Connection Manager
-----------------------------
Manages room-based WebSocket connections for live stream chat.
Each streamer's username is a "room" — all viewers in that room
receive broadcast messages.

Enhanced with:
- Username tracking per connection (for active viewer list)
- Viewer list broadcasting on join/leave
- Slow mode state per room
- Message deletion broadcasting
"""

from fastapi import WebSocket
from typing import Dict, List, Optional, Set
import json
import time


class ConnectionManager:
    """
    Manages WebSocket connections organized by room (streamer username).
    Tracks usernames per connection for viewer list features.
    """
    
    def __init__(self):
        # room_name -> list of (WebSocket, username) tuples
        self.rooms: Dict[str, List[tuple]] = {}
        # room_name -> slow_mode_enabled
        self.slow_mode: Dict[str, bool] = {}
        # room_name -> {username: last_message_timestamp} for slow mode enforcement
        self.last_message_times: Dict[str, Dict[str, float]] = {}
        # room_name -> active poll data
        self.active_polls: Dict[str, dict] = {}
        # Slow mode cooldown in seconds
        self.SLOW_MODE_COOLDOWN = 5
    
    async def connect(self, room: str, websocket: WebSocket, username: Optional[str] = None):
        """Accept a WebSocket connection and add it to the room."""
        await websocket.accept()
        if room not in self.rooms:
            self.rooms[room] = []
        self.rooms[room].append((websocket, username))
    
    def disconnect(self, room: str, websocket: WebSocket):
        """Remove a WebSocket connection from the room."""
        if room in self.rooms:
            self.rooms[room] = [
                (ws, uname) for ws, uname in self.rooms[room]
                if ws is not websocket
            ]
            # Clean up empty rooms
            if not self.rooms[room]:
                del self.rooms[room]
                self.slow_mode.pop(room, None)
                self.last_message_times.pop(room, None)
                self.active_polls.pop(room, None)

    async def disconnect_user(self, room: str, username: str, reason_text: str = "You have been disconnected by a moderator."):
        """Forcefully disconnect a specific user from the room."""
        if room not in self.rooms:
            return
            
        dead_connections = []
        for ws, uname in self.rooms[room]:
            if uname == username:
                try:
                    await self.send_personal(ws, {"type": "error", "text": reason_text})
                    await ws.close(code=1008)
                except Exception:
                    pass
                dead_connections.append(ws)
                
        for dead in dead_connections:
            self.disconnect(room, dead)
            
    def get_username(self, room: str, websocket: WebSocket) -> Optional[str]:
        """Get the username for a specific connection."""
        if room in self.rooms:
            for ws, uname in self.rooms[room]:
                if ws is websocket:
                    return uname
        return None
    
    def get_room_count(self, room: str) -> int:
        """Get the number of active connections in a room."""
        return len(self.rooms.get(room, []))
    
    def get_viewer_list(self, room: str) -> List[str]:
        """Get list of unique usernames currently in the room."""
        if room not in self.rooms:
            return []
        seen = set()
        viewers = []
        for _, uname in self.rooms[room]:
            display = uname or "Anonymous"
            # Exclude the streamer themselves from the viewer tally
            if display != room and display not in seen:
                seen.add(display)
                viewers.append(display)
        return viewers
    
    def is_slow_mode(self, room: str) -> bool:
        """Check if slow mode is enabled for a room."""
        return self.slow_mode.get(room, False)
    
    def set_slow_mode(self, room: str, enabled: bool):
        """Toggle slow mode for a room."""
        self.slow_mode[room] = enabled
        if not enabled:
            self.last_message_times.pop(room, None)
    
    def check_slow_mode_cooldown(self, room: str, username: str) -> bool:
        """
        Check if a user can send a message under slow mode.
        Returns True if allowed, False if rate-limited.
        """
        if not self.is_slow_mode(room):
            return True
        
        if room not in self.last_message_times:
            self.last_message_times[room] = {}
        
        now = time.time()
        last = self.last_message_times[room].get(username, 0)
        
        if now - last < self.SLOW_MODE_COOLDOWN:
            return False
        
        self.last_message_times[room][username] = now
        return True
    
    async def broadcast(self, room: str, message: dict):
        """
        Broadcast a JSON message to all connections in a room.
        Removes dead connections silently to prevent memory leaks.
        """
        if room not in self.rooms:
            return
        
        dead_connections = []
        message_json = json.dumps(message)
        
        for ws, uname in self.rooms[room]:
            try:
                await ws.send_text(message_json)
            except Exception:
                dead_connections.append(ws)
        
        # Clean up dead connections
        for dead in dead_connections:
            self.disconnect(room, dead)
    
    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send a JSON message to a single connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass
    
    async def broadcast_viewer_list(self, room: str):
        """Broadcast the updated viewer list to everyone in the room."""
        viewers = self.get_viewer_list(room)
        await self.broadcast(room, {
            "type": "viewer_list",
            "viewers": viewers,
            "count": len(viewers)
        })
    
    async def broadcast_activity(self, room: str, activity_type: str, username: str):
        """Broadcast an activity alert (like, subscribe) to the room."""
        await self.broadcast(room, {
            "type": "activity",
            "activity_type": activity_type,
            "user": username,
            "timestamp": int(time.time() * 1000)
        })
    
    async def broadcast_message_deleted(self, room: str, msg_id: str):
        """Broadcast a message deletion event to everyone in the room."""
        await self.broadcast(room, {
            "type": "message_deleted",
            "msg_id": msg_id
        })

    async def broadcast_status_update(self, room: str, is_live: bool, is_staging: bool = False):
        """Broadcast a stream status update (live/staging/offline) to everyone in the room."""
        await self.broadcast(room, {
            "type": "status_update",
            "is_live": is_live,
            "is_staging": is_staging,
            "timestamp": int(time.time() * 1000)
        })
    
    # ── Poll Management ─────────────────────────────────────────────────
    
    def start_poll(self, room: str, question: str, options: list, duration: int = 60):
        """Start a new poll in a room. Replaces any existing poll."""
        # Convert string options to objects if needed
        formatted_options = []
        for opt in options:
            if isinstance(opt, str):
                formatted_options.append({"text": opt, "votes": 0})
            else:
                formatted_options.append(opt)
                
        self.active_polls[room] = {
            "question": question,
            "options": formatted_options,
            "duration": duration,
            "voters": set()
        }
    
    def vote_poll(self, room: str, username: str, option_index: int) -> bool:
        """
        Record a vote by index. Returns True if accepted, False if already voted
        or invalid index.
        """
        poll = self.active_polls.get(room)
        if not poll:
            return False
        if username in poll["voters"]:
            return False
        if option_index < 0 or option_index >= len(poll["options"]):
            return False
            
        poll["options"][option_index]["votes"] = poll["options"][option_index].get("votes", 0) + 1
        poll["voters"].add(username)
        return True
    
    def end_poll(self, room: str) -> dict:
        """End the active poll and return final results."""
        poll = self.active_polls.pop(room, None)
        if not poll:
            return {}
        return {
            "question": poll["question"],
            "options": poll["options"],
            "duration": poll.get("duration", 0)
        }
    
    def get_poll(self, room: str) -> dict:
        """Get the current active poll data (without voters set)."""
        poll = self.active_polls.get(room)
        if not poll:
            return {}
        return {
            "question": poll["question"],
            "options": poll["options"],
            "duration": poll.get("duration", 0)
        }


# Singleton instance — shared across all routes
manager = ConnectionManager()
