"""
Database Models
---------------
SQLAlchemy ORM models for the uTube video-sharing platform.

Models:
- User: Platform users with authentication
- Video: Uploaded videos with metadata
- Comment: User comments on videos
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from backend.database.connection import Base


class User(Base):
    """
    User model for authentication and profile management.
    
    Attributes:
        id: Primary key
        username: Unique username for login
        email: Unique email address
        password_hash: Hashed password (never store plain text!)
        profile_image: Filename of user's avatar/profile picture
        created_at: Account creation timestamp
        
    Relationships:
        videos: All videos uploaded by this user
        comments: All comments made by this user
    """
    __tablename__ = "users"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # User Credentials
    username = Column(String(25), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Profile Information
    profile_image = Column(String(255), nullable=True, default="default_avatar.png")
    channel_description = Column(Text, nullable=True)
    channel_banner_url = Column(String(255), nullable=True)
    banner_position = Column(Integer, nullable=True, default=50)  # 0-100 vertical focal point %
    is_synthetic = Column(Integer, default=0, nullable=False)  # For test data (0=real, 1=synthetic)
    
    # Live Streaming Metadata (new_update)
    stream_key = Column(String(100), unique=True, index=True, nullable=True)
    is_live = Column(Boolean, default=False, nullable=False, index=True)
    is_staging = Column(Boolean, default=False, nullable=False, index=True)
    viewer_count = Column(Integer, default=0, nullable=False)
    stream_title = Column(String(100), nullable=True)
    stream_category = Column(String(50), nullable=True, default="Gaming")
    stream_thumbnail = Column(String(255), nullable=True, default=None)
    studio_bg_url = Column(String(500), nullable=True, default=None)
    
    # Moderation Tiers (1: Viewer, 2: Mod, 3: Sr Mod, 4: Admin, 5: Broadcaster)
    tier = Column(Integer, default=1, nullable=False)
    permissions = Column(JSON, nullable=True) # Specific JSON permissions if needed
    
    # Email Verification
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_code = Column(String(6), nullable=True)
    verification_expires_at = Column(DateTime, nullable=True)
    pending_email = Column(String(100), nullable=True)
    

    # Admin Fields
    is_admin = Column(Boolean, default=False, nullable=False)
    upload_banned = Column(Boolean, default=False, nullable=False)
    upload_ban_reason = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    videos = relationship(
        "Video",
        back_populates="author",
        cascade="all, delete-orphan",  # Delete videos when user is deleted
        lazy="dynamic"  # Load videos on demand
    )
    
    comments = relationship(
        "Comment",
        back_populates="author",
        cascade="all, delete-orphan",  # Delete comments when user is deleted
        lazy="dynamic"
    )
    
    likes = relationship(
        "Like",
        back_populates="user",
        cascade="all, delete-orphan",  # Delete likes when user is deleted
        lazy="dynamic"
    )
    
    # Subscription relationships
    following = relationship(
        "Subscription",
        foreign_keys="Subscription.follower_id",
        back_populates="follower",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    followers = relationship(
        "Subscription",
        foreign_keys="Subscription.following_id",
        back_populates="following_user",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    backgrounds = relationship(
        "UserBackground",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    playlists = relationship(
        "Playlist",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    watch_later_videos = relationship(
        "WatchLater",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


class UserBackground(Base):
    """
    UserBackground model for storing custom Live Studio backgrounds.
    
    Attributes:
        id: Primary key
        user_id: Foreign key to User
        file_path: Relative path to the uploaded video file
        thumbnail_path: Relative path to the generated thumbnail image (optional)
        is_default: Boolean indicating if it's the active background
        created_at: Upload timestamp
        
    Relationships:
        user: The user who uploaded this background
    """
    __tablename__ = "user_backgrounds"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=True)
    file_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    user = relationship("User", back_populates="backgrounds")
    
    def __repr__(self):
        return f"<UserBackground(id={self.id}, user_id={self.user_id}, path='{self.file_path}')>"


class Video(Base):
    """
    Video model for uploaded video content.
    
    Attributes:
        id: Primary key
        title: Video title
        description: Video description/summary
        video_filename: Stored filename of the video file
        thumbnail_filename: Stored filename of the thumbnail image
        view_count: Number of views (for analytics)
        upload_date: When the video was uploaded
        user_id: Foreign key to User (video owner)
        category: Video category (e.g., "Education", "Entertainment", "Technology")
        tags: Comma-separated tags for search and filtering
        duration: Video duration in seconds
        
    Relationships:
        author: The user who uploaded this video
        comments: All comments on this video
        likes: All likes on this video
    """
    __tablename__ = "videos"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Video Metadata
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True, index=True)  # For filtering
    tags = Column(JSON, nullable=True, default=list)  # Recommendation-ready JSON array
    
    # Phase 5: Access Control & Scheduling
    visibility = Column(String(20), nullable=False, default="public", index=True)  # public, unlisted, private
    scheduled_at = Column(DateTime, nullable=True)  # UTC - For future publication
    
    # File Storage
    video_filename = Column(String(255), nullable=False)
    thumbnail_filename = Column(String(255), nullable=True)
    
    # Analytics
    view_count = Column(Integer, default=0, nullable=False, index=True)  # Indexed for trending
    duration = Column(Integer, nullable=True)  # Duration in seconds
    
    # Status (draft, processing, published, failed)
    status = Column(String(20), default="draft", nullable=False, index=True)

    # Semantic Search
    embedding = Column(JSON, nullable=True)  # Store the dense vector as a JSON array of floats

    # Multi-Resolution Transcoding
    resolutions = Column(JSON, nullable=True, default=dict)  # {"360p": "file_360p.mp4", "720p": "file_720p.mp4", ...}

    # Timestamps
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Foreign Keys
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    author = relationship(
        "User",
        back_populates="videos"
    )
    
    comments = relationship(
        "Comment",
        back_populates="video",
        cascade="all, delete-orphan",  # Delete comments when video is deleted
        lazy="dynamic",
        order_by="Comment.created_at.desc()"  # Show newest comments first
    )
    
    likes = relationship(
        "Like",
        back_populates="video",
        cascade="all, delete-orphan",  # Delete likes when video is deleted
        lazy="dynamic"
    )
    
    playlist_entries = relationship(
        "PlaylistVideo",
        back_populates="video",
        cascade="all, delete-orphan"
    )
    
    watch_later_entries = relationship(
        "WatchLater",
        back_populates="video",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<Video(id={self.id}, title='{self.title}', category='{self.category}', author_id={self.user_id}, views={self.view_count})>"
    
    @property
    def like_count(self):
        """Get the number of likes (not dislikes) for this video."""
        return self.likes.filter(Like.is_dislike == False).count()
    
    @property
    def dislike_count(self):
        """Get the number of dislikes for this video."""
        return self.likes.filter(Like.is_dislike == True).count()
    
    def get_tags_list(self):
        """Parse tags into a list, handling both JSON list and string formats."""
        if isinstance(self.tags, list):
            return self.tags
        if isinstance(self.tags, str):
            import json
            try:
                parsed = json.loads(self.tags)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                return [tag.strip() for tag in self.tags.split(',') if tag.strip()]
        return []


class Comment(Base):
    """
    Comment model for user comments on videos.
    
    Attributes:
        id: Primary key
        text: Comment content
        created_at: When the comment was posted
        user_id: Foreign key to User (comment author)
        video_id: Foreign key to Video (commented video)
        
    Relationships:
        author: The user who wrote this comment
        video: The video this comment belongs to
    """
    __tablename__ = "comments"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Comment Content
    text = Column(Text, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Foreign Keys
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Relationships
    author = relationship(
        "User",
        back_populates="comments"
    )
    
    video = relationship(
        "Video",
        back_populates="comments"
    )
    
    comment_likes = relationship(
        "CommentLike",
        back_populates="comment",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )

    replies = relationship(
        "Comment",
        back_populates="parent_comment",
        cascade="all, delete-orphan",
        lazy="dynamic",
        foreign_keys="Comment.parent_id"
    )

    parent_comment = relationship(
        "Comment",
        back_populates="replies",
        remote_side="Comment.id",
        foreign_keys="Comment.parent_id"
    )
    
    def __repr__(self):
        return f"<Comment(id={self.id}, author_id={self.user_id}, video_id={self.video_id}, text='{self.text[:30]}...')>"


class Like(Base):
    """
    Like model for tracking user likes on videos.
    
    Attributes:
        id: Primary key
        user_id: Foreign key to User (who liked)
        video_id: Foreign key to Video (liked video)
        created_at: When the like was created
        
    Relationships:
        user: The user who liked the video
        video: The video that was liked
    """
    __tablename__ = "likes"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Keys
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    
    # Like vs Dislike
    is_dislike = Column(Boolean, default=False, nullable=False)  # False=like, True=dislike
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="likes")
    video = relationship("Video", back_populates="likes")
    
    # Unique constraint: one like per user per video
    __table_args__ = (
        UniqueConstraint('user_id', 'video_id', name='unique_user_video_like'),
    )
    
    def __repr__(self):
        return f"<Like(id={self.id}, user_id={self.user_id}, video_id={self.video_id})>"


class Subscription(Base):
    """
    Subscription model for user-to-user following.
    
    Attributes:
        id: Primary key
        follower_id: Foreign key to User (who is following)
        following_id: Foreign key to User (who is being followed)
        created_at: When the subscription was created
        
    Relationships:
        follower: The user who is following
        following_user: The user being followed
    """
    __tablename__ = "subscriptions"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Keys
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    follower = relationship("User", foreign_keys=[follower_id], back_populates="following")
    following_user = relationship("User", foreign_keys=[following_id], back_populates="followers")
    
    # Unique constraint: one subscription per follower-following pair
    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='unique_follower_following'),
    )
    
    def __repr__(self):
        return f"<Subscription(id={self.id}, follower_id={self.follower_id}, following_id={self.following_id})>"


class CommentLike(Base):
    """
    CommentLike model for tracking user likes/dislikes on comments (YouTube-style).
    
    Attributes:
        id: Primary key
        user_id: Foreign key to User
        comment_id: Foreign key to Comment
        is_dislike: False=like, True=dislike
        created_at: Timestamp
    """
    __tablename__ = "comment_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    is_dislike = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    comment = relationship("Comment", back_populates="comment_likes")
    
    # Unique constraint: one reaction per user per comment
    __table_args__ = (
        UniqueConstraint('user_id', 'comment_id', name='unique_user_comment_like'),
    )
    
    def __repr__(self):
        return f"<CommentLike(id={self.id}, user={self.user_id}, comment={self.comment_id}, dislike={self.is_dislike})>"


class StreamLike(Base):
    """
    StreamLike model for tracking likes on live streams.
    
    Attributes:
        id: Primary key
        user_id: Foreign key to User (who liked)
        streamer_id: Foreign key to User (whose stream was liked)
        created_at: When the like was created
    """
    __tablename__ = "stream_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    streamer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Unique constraint: one like per user per streamer
    __table_args__ = (
        UniqueConstraint('user_id', 'streamer_id', name='unique_stream_like'),
    )
    
    def __repr__(self):
        return f"<StreamLike(id={self.id}, user={self.user_id}, streamer={self.streamer_id})>"


class ChatMessage(Base):
    """
    ChatMessage model for persisting live stream chat messages.
    
    Attributes:
        id: Primary key
        room: Streamer username (room identifier)
        sender: Username of the message sender
        text: Message content
        is_mod: Whether sender is a moderator
        created_at: When the message was sent
    """
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    room = Column(String(50), nullable=False, index=True)
    sender = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    is_mod = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def __repr__(self):
        return f"<ChatMessage(id={self.id}, room='{self.room}', sender='{self.sender}')>"


class ActivityLog(Base):
    """
    ActivityLog model for persisting stream activity events.
    
    Attributes:
        id: Primary key
        room: Streamer username (room identifier)
        username: User who performed the action
        activity_type: Type of activity (like, subscribe)
        created_at: When the activity occurred
    """
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    room = Column(String(50), nullable=False, index=True)
    username = Column(String(50), nullable=False)
    activity_type = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<ActivityLog(id={self.id}, room='{self.room}', type='{self.activity_type}')>"


class ClipLog(Base):
    """
    ClipLog model for persisting clip marker timestamps.
    """
    __tablename__ = "clip_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    room = Column(String(50), nullable=False, index=True)
    username = Column(String(50), nullable=False)
    clip_timestamp = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<ClipLog(id={self.id}, room='{self.room}')>"


class StreamMarker(Base):
    """Stream marker model for saving timestamp markers during broadcast."""
    __tablename__ = "stream_markers"

    id = Column(Integer, primary_key=True, index=True)
    room = Column(String(50), nullable=False, index=True)
    username = Column(String(50), nullable=False)
    label = Column(String(200), nullable=True)
    marker_timestamp = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<StreamMarker(id={self.id}, room='{self.room}')>"


# ══════════════════════════════════════════════════════════════════════════════
# NEW: Livestream Moderation System
# ══════════════════════════════════════════════════════════════════════════════

class StreamModerator(Base):
    """
    Moderators assigned to specific streams/channels.
    Roles: admin, senior_mod, moderator
    """
    __tablename__ = "stream_moderators"
    
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    moderator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="moderator")  # 'admin', 'senior_mod', 'moderator'
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    __table_args__ = (UniqueConstraint('channel_id', 'moderator_id', name='uq_channel_mod'),)

    def __repr__(self):
        return f"<StreamModerator(channel={self.channel_id}, mod={self.moderator_id}, role='{self.role}')>"


class StreamBan(Base):
    """Banned users for a specific channel."""
    __tablename__ = "stream_bans"
    
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    banned_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    banned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # Null if admin/mod deleted
    reason = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True) # Null = permanent ban
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<StreamBan(channel={self.channel_id}, banned={self.banned_user_id})>"


class StreamTimeout(Base):
    """Temporarily timed-out users for a specific channel."""
    __tablename__ = "stream_timeouts"
    
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    timed_out_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    timed_out_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<StreamTimeout(channel={self.channel_id}, timed_out={self.timed_out_user_id})>"


class ModerationActionLog(Base):
    """Log of all moderation actions performed."""
    __tablename__ = "moderation_action_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String(50), nullable=False) # ban, unban, timeout, promote, demote, delete_message
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    performed_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<ModerationActionLog(id={self.id}, type='{self.action_type}', by={self.performed_by_id})>"


class AdminAuditLog(Base):
    """
    AdminAuditLog records every privileged admin action for transparency and accountability.

    Attributes:
        id: Primary key
        admin_user_id: FK to the admin who performed the action
        action_type: e.g. 'DELETE_VIDEO', 'BAN_USER', 'SEND_WARNING'
        target_type: 'video' | 'user' | 'comment'
        target_id: ID of the affected resource
        detail: Optional free-text reason or extra context
        created_at: Timestamp
    """
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(50), nullable=False, index=True)
    target_type = Column(String(20), nullable=False)  # 'video' | 'user' | 'comment'
    target_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    admin = relationship("User", foreign_keys=[admin_user_id])

    def __repr__(self):
        return f"<AdminAuditLog(id={self.id}, action='{self.action_type}', target={self.target_type}:{self.target_id})>"


class AdminWarning(Base):
    """
    AdminWarning stores formal channel warnings sent by admins to specific users.
    These appear in the user's Notifications page as a distinct admin notice.

    Attributes:
        id: Primary key
        target_user_id: FK to the user who receives the warning
        admin_user_id: FK to the admin who sent the warning
        title: Short summary (e.g. 'Community Guidelines Violation')
        message: Full warning message body
        is_read: Whether the user has acknowledged the warning
        created_at: Timestamp
    """
    __tablename__ = "admin_warnings"

    id = Column(Integer, primary_key=True, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    target_user = relationship("User", foreign_keys=[target_user_id])
    admin = relationship("User", foreign_keys=[admin_user_id])

    def __repr__(self):
        return f"<AdminWarning(id={self.id}, target_user={self.target_user_id}, title='{self.title[:30]}')>"


# ══════════════════════════════════════════════════════════════════════════════
# Playlist System
# ══════════════════════════════════════════════════════════════════════════════

class Playlist(Base):
    """
    Playlist model for user-created video collections (YouTube-style).
    
    Attributes:
        id: Primary key
        title: Playlist title
        description: Optional description
        visibility: public or private
        user_id: Foreign key to User (playlist owner)
        created_at: When the playlist was created
        updated_at: Last modification timestamp
        
    Relationships:
        owner: The user who created this playlist
        entries: Ordered list of PlaylistVideo entries
    """
    __tablename__ = "playlists"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    visibility = Column(String(20), nullable=False, default="public")  # public, private
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    owner = relationship("User", back_populates="playlists")
    entries = relationship(
        "PlaylistVideo",
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistVideo.order_index"
    )
    
    def __repr__(self):
        return f"<Playlist(id={self.id}, title='{self.title}', owner_id={self.user_id})>"


class PlaylistVideo(Base):
    """
    Junction table linking Videos to Playlists with ordering.
    
    Attributes:
        id: Primary key
        playlist_id: Foreign key to Playlist
        video_id: Foreign key to Video
        order_index: Integer for sort order (0-based)
        added_at: When the video was added to the playlist
        
    Relationships:
        playlist: The parent playlist
        video: The linked video
    """
    __tablename__ = "playlist_videos"
    
    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    playlist = relationship("Playlist", back_populates="entries")
    video = relationship("Video", back_populates="playlist_entries")
    
    # Unique constraint: a video can only appear once per playlist
    __table_args__ = (
        UniqueConstraint('playlist_id', 'video_id', name='unique_playlist_video'),
    )
    
    def __repr__(self):
        return f"<PlaylistVideo(playlist={self.playlist_id}, video={self.video_id}, order={self.order_index})>"


class WatchLater(Base):
    """
    WatchLater model for tracking videos a user wants to watch later.
    """
    __tablename__ = "watch_later"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="watch_later_videos")
    video = relationship("Video", back_populates="watch_later_entries")
    
    # Unique constraint: a user can only have a video in watch later once
    __table_args__ = (
        UniqueConstraint('user_id', 'video_id', name='unique_user_watch_later'),
    )
    
    def __repr__(self):
        return f"<WatchLater(user={self.user_id}, video={self.video_id})>"

class WatchHistory(Base):
    """
    WatchHistory model for tracking videos a user has watched.
    """
    __tablename__ = "watch_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    watched_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    video = relationship("Video")
    
    # Unique constraint: a user can only have a video in watch history once
    __table_args__ = (
        UniqueConstraint('user_id', 'video_id', name='unique_user_watch_history'),
    )
    
    def __repr__(self):
        return f"<WatchHistory(user={self.user_id}, video={self.video_id})>"
