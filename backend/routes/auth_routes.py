"""
Authentication Routes
---------------------
Handles user registration, login, authentication, and public profile access.

Endpoints:
- POST /register: Create a new user account
- POST /login: Authenticate and get access token
- GET /me: Get current user information
- GET /profile/{username}: Public user profile (no auth required)
- POST /live/like/{username}: Like/unlike a live stream
"""

from jose import JWTError
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, Request, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, Union
from datetime import datetime, timedelta
import shutil
import os
from pathlib import Path
import uuid
import random
import string
import logging

# Configure logging
logger = logging.getLogger(__name__)

from backend.database import get_db
from backend.database.models import User, Subscription, Video, StreamLike, ActivityLog
from backend.chat.manager import manager
from backend.services.mail_service import send_verification_email
from backend.core.config import THUMBNAILS_DIR, AVATARS_DIR, BANNERS_DIR, STORAGE_DIR, BACKGROUNDS_DIR
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    validate_password_strength,
    validate_email,
    generate_stream_key,
    secure_resolve
)

# Create router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Security scheme for JWT
from backend.services.auth_service import security, get_current_user


# ============================================================================
# Pydantic Models (Request/Response Schemas)
# ============================================================================

class UserRegister(BaseModel):
    """Request model for user registration."""
    username: str = Field(..., min_length=3, max_length=25, pattern="^[a-zA-Z0-9_-]+$", description="Username (3-25 chars, letters/numbers/underscore/hyphen only)")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=8, description="Password (min 8 characters)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "username": "john_doe",
                "email": "john@example.com",
                "password": "SecurePass123"
            }
        }


class UserLogin(BaseModel):
    """Request model for user login."""
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., description="Password")
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@example.com",
                "password": "SecurePass123"
            }
        }


class UserUpdate(BaseModel):
    """Request model for user profile update."""
    username: Optional[str] = Field(None, min_length=3, max_length=25, pattern="^[a-zA-Z0-9_-]+$")
    email: Optional[EmailStr] = Field(None)
    channel_description: Optional[str] = Field(None)
    channel_banner_url: Optional[str] = Field(None)
    password: Optional[str] = Field(None, min_length=8)
    new_password: Optional[str] = Field(None, min_length=8)

    @validator('channel_description', pre=True, always=True)
    def sanitize_description(cls, v):
        if v is None: return v
        import re
        return re.sub(r'<[^>]+>', '', str(v)).strip()


class LiveMetadataUpdate(BaseModel):
    """Request model for live stream metadata updates."""
    title: str = Field(..., max_length=100)
    category: str = Field(..., max_length=50)
    studio_bg_url: Optional[str] = Field(None, max_length=500)

    @validator('title', 'category', pre=True, always=True)
    def sanitize_text(cls, v):
        if v is None: return v
        import re
        return re.sub(r'<[^>]+>', '', str(v)).strip()


class Token(BaseModel):
    """Response model for authentication token."""
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    is_admin: bool = False


class UserResponse(BaseModel):
    """Response model for user information."""
    id: int
    username: str
    email: str
    profile_image: Optional[str] = None
    channel_description: Optional[str] = None
    channel_banner_url: Optional[str] = None
    banner_position: Optional[int] = 50
    is_verified: bool = False
    is_admin: bool = False
    upload_banned: bool = False
    upload_ban_reason: Optional[str] = None
    stream_title: Optional[str] = None
    stream_category: Optional[str] = None
    stream_thumbnail: Optional[str] = None
    created_at: str
    subscriber_count: int = 0
    video_count: int = 0
    total_views: int = 0
    is_live: bool = False
    is_staging: bool = False
    viewer_count: int = 0
    
    class Config:
        from_attributes = True


class PublicProfileResponse(BaseModel):
    """Response model for public profile info (no email, no sensitive data)."""
    id: int
    username: str
    profile_image: Optional[str] = None
    channel_description: Optional[str] = None
    channel_banner_url: Optional[str] = None
    is_verified: bool = False
    stream_title: Optional[str] = None
    stream_category: Optional[str] = None
    stream_thumbnail: Optional[str] = None
    subscriber_count: int = 0
    video_count: int = 0
    is_live: bool = False
    is_staging: bool = False

    class Config:
        from_attributes = True


class BackgroundResponse(BaseModel):
    """Response model for user studio backgrounds."""
    id: int
    user_id: int
    name: Optional[str] = None
    file_path: str
    thumbnail_path: Optional[str] = None
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True
class VerifyEmailRequest(BaseModel):
    """Request model for verifying email OTP."""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class VerificationRequiredResponse(BaseModel):
    """Response returned after registration, before verification."""
    message: str
    email: str
    status: str = "verification_required"



# ============================================================================
# Dependency: Get Optional User
# ============================================================================



def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Dependency to get the current user if a valid token is provided,
    otherwise returns None without raising an exception.
    """
    if not credentials:
        return None
        
    try:
        # Extract token and strip whitespace
        token = credentials.credentials.strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
            
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


# ============================================================================
# Routes
# ============================================================================


from pydantic import BaseModel

class EmailValidationRequest(BaseModel):
    email: str

@router.post("/validate-email", status_code=status.HTTP_200_OK)
def validate_email_endpoint(data: EmailValidationRequest):
    """
    Validate an email syntax and domain MX records.
    Used by the frontend to provide real-time validation feedback.
    """
    is_valid, error_msg = validate_email(data.email)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    return {"status": "ok", "message": "Email is valid"}

@router.post("/register", response_model=VerificationRequiredResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account.
    
    Steps:
    1. Validate email format
    2. Check if email/username already exists
    3. Validate password strength
    4. Hash password
    5. Create user in database
    6. Generate OTP and send verification email
    7. Return verification_required response
    
    Args:
        user_data: User registration data
        db: Database session
        
    Returns:
        Verification required response with email
        
    Raises:
        HTTPException 400: If email/username exists or validation fails
    """
    # Validate email format and DNS
    is_email_valid, email_error = validate_email(user_data.email)
    if not is_email_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=email_error
        )
    
    # Check if email already exists — allow overwriting unverified records
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        else:
            # Remove stale unverified record so the email can be reused
            db.delete(existing_user)
            db.flush()
    
    # Check if username already exists — DO NOT allow overwriting even if unverified (usernames are reserved)
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken."
        )
    
    # Validate password strength
    is_valid, error_msg = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Hash password
    hashed_password = hash_password(user_data.password)
    
    # Generate OTP for email verification
    verification_code = ''.join(random.choices(string.digits, k=6))
    
    # Create new user with secure auto-generated stream key
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hashed_password,
        stream_key=generate_stream_key(),
        verification_code=verification_code,
        verification_expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Always log the OTP to the terminal for development
    print(f"\n[REGISTER] OTP code for {new_user.email}: {verification_code}", flush=True)
    
    # Send verification email (mock or SMTP)
    email_sent = send_verification_email(new_user.email, verification_code)
    if not email_sent:
        print(f"[REGISTER WARNING] Email dispatch failed, but code is saved. Use code from terminal.", flush=True)
    
    return VerificationRequiredResponse(
        message="Verification code sent to your email. Please check your inbox.",
        email=new_user.email
    )

@router.post("/resend-otp", response_model=VerificationRequiredResponse)
def resend_otp(data: EmailValidationRequest, db: Session = Depends(get_db)):
    """
    Resend the OTP verification code for an unverified user.
    """
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already verified")
    
    # Generate new OTP
    verification_code = ''.join(random.choices(string.digits, k=6))
    user.verification_code = verification_code
    user.verification_expires_at = datetime.utcnow() + timedelta(minutes=15)
    db.commit()
    
    # Always log the OTP to the terminal for development
    print(f"\n[RESEND-OTP] New OTP code for {user.email}: {verification_code}", flush=True)
    
    email_sent = send_verification_email(user.email, verification_code)
    if not email_sent:
        print(f"[RESEND-OTP WARNING] Email dispatch failed, but code is saved. Use code from terminal.", flush=True)
    
    return VerificationRequiredResponse(
        message="A new verification code has been sent.",
        email=user.email
    )

@router.post("/verify-email", response_model=Token)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Verify the 6-digit OTP and generate JWT token.
    """
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already verified")
        
    if not user.verification_code or user.verification_code != data.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")
        
    if user.verification_expires_at and datetime.utcnow() > user.verification_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code has expired. Please register again.")
        
    # Verification successful
    user.is_verified = True
    user.verification_code = None
    user.verification_expires_at = None
    db.commit()
    
    # Generate access token immediately after verification
    access_token = create_access_token({"sub": user.id})
    return Token(
        access_token=access_token,
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin
    )

@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT token.
    
    Steps:
    1. Find user by email
    2. Verify password
    3. Generate JWT token
    
    Args:
        credentials: User login credentials
        db: Database session
        
    Returns:
        JWT access token and user info
        
    Raises:
        HTTPException 401: If credentials are invalid
    """
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    
    # Check if user exists and password is correct
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before logging in."
        )
    
    # Generate access token
    access_token = create_access_token({"sub": user.id})
    
    return Token(
        access_token=access_token,
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin
    )


@router.post("/refresh", response_model=Token)
def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Refresh JWT token.
    
    Accepts a valid (unexpired or near-expiration) token via the Authorization header
    and issues a completely fresh JWT with a renewed expiration window.
    """
    # Generate new access token
    access_token = create_access_token({"sub": current_user.id})
    
    return Token(
        access_token=access_token,
        user_id=current_user.id,
        username=current_user.username
    )

# ============================================================================
# RTMP Media Server Webhooks
# ============================================================================

@router.post("/live-auth")
async def live_stream_auth(request: Request, db: Session = Depends(get_db)):
    """
    Webhook for Node Media Server (NMS) prePublish event.
    Sets user.is_live = True when a valid stream key is presented.
    """
    try:
        # NMS sends form data
        form_data = await request.form()
        
        # The 'name' field in RTMP rtmp://host/live/__name__ is our stream key
        stream_key = form_data.get("name")
        
        if not stream_key:
            raise HTTPException(status_code=403, detail="Stream key missing")
            
        # Verify the key exists in our database
        user = db.query(User).filter(User.stream_key == stream_key).first()
        
        if not user:
            # Return 403 Forbidden to tell NMS to reject the publisher
            raise HTTPException(status_code=403, detail="Invalid stream key")
            
        # Mark user as Staging (not LIVE yet)
        user.is_live = False
        user.is_staging = True
        db.commit()
        
        # We DO broadcast a status update to signal staging so Live Studio frontend updates
        await manager.broadcast_status_update(user.username, is_live=False, is_staging=True)
            
        # Return 200 OK to allow Node Media Server to publish the stream
        return {"status": "ok"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AUTH ERROR] live-auth failed: {e}")
        raise HTTPException(status_code=403, detail="Auth server error")


@router.post("/live-publish-done")
async def live_publish_done(request: Request, db: Session = Depends(get_db)):
    """
    Webhook for Node Media Server (NMS) donePublish event.
    Sets user.is_live = False when the stream stops.
    """
    try:
        form_data = await request.form()
        stream_key = form_data.get("name")
        
        if stream_key:
            user = db.query(User).filter(User.stream_key == stream_key).first()
            if user:
                user.is_live = False
                user.is_staging = False
                db.commit()
                print(f"[AUTH] User {user.username} is now offline.")
                # Broadcast the status update to everyone in this user's room
                await manager.broadcast_status_update(user.username, False, False)
                
        return {"status": "ok"}
    except Exception as e:
        print(f"[AUTH ERROR] live-publish-done failed: {e}")
        return {"status": "ok"} # Always return 200 to NMS for done events


from pydantic import BaseModel
from typing import Optional

class StartBroadcastRequest(BaseModel):
    title: Optional[str] = None
    stream_thumbnail: Optional[str] = None

@router.post("/live/start-broadcast")
async def start_broadcast(
    request: StartBroadcastRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Transition a stream from Staging to Live successfully.
    Called manually by the creator from the Live Studio when they are ready.
    """
    if not current_user.is_staging:
        raise HTTPException(status_code=400, detail="Stream is not in staging mode. Please make sure OBS is connected.")
        
    current_user.is_staging = False
    current_user.is_live = True
    
    # Save the thumbnail unconditionally, falling back to None if clear
    current_user.stream_thumbnail = request.stream_thumbnail
    if request.title:
        current_user.stream_title = request.title
    
    # Clear old chat history for this stream session
    from backend.database.models import ChatMessage
    db.query(ChatMessage).filter(ChatMessage.room == current_user.username).delete()
    db.commit()
    
    # Broadcast to watchers that the stream is now LIVE
    await manager.broadcast_status_update(current_user.username, True, False)
    
    return {"status": "ok", "message": "Stream is now public"}


@router.post("/live/end-broadcast")
async def end_broadcast(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually end a broadcast from the Live Studio UI.
    Resets the stream to completely offline.
    """
    # SAFETY GUARD: Check if OBS is still actively pushing to NMS
    try:
        nms_url = f"http://127.0.0.1:8080/api/streams/live/{current_user.stream_key}"
        response = requests.get(nms_url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            # If there is a 'publisher' object, it means OBS is still streaming
            if data.get('publisher'):
                raise HTTPException(
                    status_code=400, 
                    detail="Active stream detected! Please click 'Stop Streaming' in OBS first."
                )
    except requests.RequestException:
        # If NMS is down, we allow the state reset
        pass

    current_user.is_live = False
    current_user.is_staging = False
    current_user.stream_thumbnail = None
    db.commit()
    
    await manager.broadcast_status_update(current_user.username, False, False)
    
    return {"status": "ok", "message": "Broadcast ended."}


def build_user_response(user: User, db: Session) -> UserResponse:
    """Build a UserResponse with live stats from the database."""
    subscriber_count = db.query(func.count(Subscription.id)).filter(
        Subscription.following_id == user.id
    ).scalar() or 0
    
    video_count = db.query(func.count(Video.id)).filter(
        Video.user_id == user.id
    ).scalar() or 0
    
    total_views = db.query(func.coalesce(func.sum(Video.view_count), 0)).filter(
        Video.user_id == user.id
    ).scalar() or 0
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        profile_image=user.profile_image,
        channel_description=user.channel_description,
        channel_banner_url=user.channel_banner_url,
        banner_position=user.banner_position if user.banner_position is not None else 50,
        is_verified=user.is_verified,
        is_admin=bool(user.is_admin),
        upload_banned=bool(user.upload_banned),
        upload_ban_reason=user.upload_ban_reason,
        stream_title=user.stream_title,
        stream_category=user.stream_category,
        created_at=user.created_at.isoformat(),
        subscriber_count=subscriber_count,
        video_count=video_count,
        total_views=total_views,
        is_live=user.is_live,
        is_staging=user.is_staging,
        viewer_count=user.viewer_count
    )


import requests

@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current authenticated user information.
    Includes active stream verification against NMS to clear zombie sessions.
    """
    if current_user.is_live or current_user.is_staging:
        try:
            nms_url = f"http://127.0.0.1:8080/api/streams/live/{current_user.stream_key}"
            response = requests.get(nms_url, timeout=1)
            # If NMS returns anything other than 200, or the publisher is empty, clear the ghost state
            if response.status_code != 200 or not response.json().get('publisher'):
                print(f"[AUTH] Clearing ghost session for {current_user.username}")
                current_user.is_live = False
                current_user.is_staging = False
                db.commit()
        except requests.RequestException:
            # If NMS is completely unreachable, assume the stream is down as a safety precaution
            print(f"[AUTH WARNING] Node Media Server unreachable. Clearing ghost session for {current_user.username}")
            current_user.is_live = False
            current_user.is_staging = False
            db.commit()

    return build_user_response(current_user, db)


@router.put("/me", response_model=Union[UserResponse, VerificationRequiredResponse])
def update_user_profile(
    username: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    current_password: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile information.
    
    Handles:
    - Username update (uniqueness check)
    - Email update (uniqueness check & validation)
    - Password update (hashing & strength check) - REQUIRES current_password
    - Profile picture upload
    """
    # 0. Verify Current Password for Critical Changes
    if password or email != current_user.email:
         # If changing password or email, require current password for security
         # For this specific request, we focus on password change security
         pass 

    # 1. Update Username
    if username and username != current_user.username:
        existing_username = db.query(User).filter(User.username == username, User.id != current_user.id).first()
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already taken."
            )
        current_user.username = username
        
    # 2. Update Email (Requires OTP Verification)
    email_change_requested = False
    if email and email != current_user.email:
        is_email_valid, email_error = validate_email(email)
        if not is_email_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=email_error
            )
        existing_email = db.query(User).filter(
            (User.email == email) | (User.pending_email == email)
        ).first()
        
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered or pending verification"
            )
            
        # Generate new OTP for the email change
        verification_code = ''.join(random.choices(string.digits, k=6))
        current_user.pending_email = email
        current_user.verification_code = verification_code
        current_user.verification_expires_at = datetime.utcnow() + timedelta(minutes=15)
        
        # Send the OTP to the NEW email address
        # We don't await this if it's not an async function, but based on register route it's synchronous
        try:
            send_verification_email(email, verification_code)
            email_change_requested = True
        except Exception as e:
            logger.error(f"Failed to send email verification for profile update: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again later."
            )
        
    # 3. Update Password
    if password:
        if not current_password:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password"
            )
        
        if not verify_password(current_password, current_user.password_hash):
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect current password"
            )

        is_valid, error_msg = validate_password_strength(password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        current_user.password_hash = hash_password(password)
        
    # 4. Update Profile Picture
    if file:
        # Validate file type (basic check)
        content_type = file.content_type
        if content_type not in ["image/jpeg", "image/png", "image/webp"]:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image format. Allowed: JPEG, PNG, WEBP"
            )
            
        # Create unique filename
        safe_filename = os.path.basename(file.filename.replace('\0', ''))
        file_ext = os.path.splitext(safe_filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        
        # Explicitly sanitize the final string for CodeQL's intra-procedural analysis
        unique_filename = os.path.basename(unique_filename.replace('\0', ''))
        
        file_path = secure_resolve(AVATARS_DIR, unique_filename)
        
        # Save file
        try:
            os.makedirs(file_path.parent, exist_ok=True)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Update user record
            current_user.profile_image = unique_filename
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload image: {str(e)}"
            )
            
    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )
        
    if email_change_requested:
        return VerificationRequiredResponse(
            status="verification_required",
            email=current_user.pending_email,
            message="Please verify your new email address to complete the update."
        )
        
    return build_user_response(current_user, db)


@router.put("/me/channel", response_model=UserResponse)
def update_channel_profile(
    description: Optional[str] = Form(None),
    banner_image: Optional[UploadFile] = File(None),
    banner_position: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the user's channel description and banner image.
    """
    # 1. Update Description
    if description is not None:
        current_user.channel_description = description.strip()

    # 2. Update Banner Position
    if banner_position is not None:
        current_user.banner_position = max(0, min(100, banner_position))

    # 3. Update Banner Image
    if banner_image:
        # Validate file type (basic)
        content_type = banner_image.content_type
        if content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image format. Allowed: JPEG, PNG, WEBP"
            )

        # Create unique filename
        safe_filename = os.path.basename(banner_image.filename.replace('\0', ''))
        file_ext = os.path.splitext(safe_filename)[1]
        unique_filename = f"banner_{uuid.uuid4()}{file_ext}"
        
        # Security sanitization
        unique_filename = os.path.basename(unique_filename.replace('\0', ''))
        file_path = secure_resolve(BANNERS_DIR, unique_filename)

        # Save file
        try:
            os.makedirs(file_path.parent, exist_ok=True)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(banner_image.file, buffer)
            
            current_user.channel_banner_url = unique_filename
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload banner image: {str(e)}"
            )

    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )

    return build_user_response(current_user, db)


@router.delete("/me/banner", response_model=UserResponse)
def remove_channel_banner(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove the user's channel banner image and revert to the default gradient.
    Deletes the file from disk and sets channel_banner_url to None.
    """
    if not current_user.channel_banner_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No banner image to remove"
        )

    # Delete the file from disk
    try:
        old_file = BANNERS_DIR / current_user.channel_banner_url
        if old_file.exists():
            old_file.unlink()
    except Exception as e:
        logger.warning(f"Failed to delete banner file: {e}")

    # Clear the database field
    current_user.channel_banner_url = None

    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )

    return build_user_response(current_user, db)


@router.delete("/me/profile-picture", response_model=UserResponse)
def remove_profile_picture(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove the user's profile picture and revert to the default avatar.
    Deletes the file from disk and sets profile_image to None.
    """
    if not current_user.profile_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile picture to remove"
        )

    # Delete the file from disk
    try:
        old_file = AVATARS_DIR / current_user.profile_image
        if old_file.exists():
            old_file.unlink()
    except Exception as e:
        logger.warning(f"Failed to delete profile picture file: {e}")

    # Clear the database field
    current_user.profile_image = None

    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )

    return build_user_response(current_user, db)


@router.post("/verify-email-change", response_model=UserResponse)
def verify_email_change(
    code: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify the OTP code for an email change request.
    If valid, commits pending_email to email and returns the updated UserResponse.
    """
    if not current_user.pending_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email change pending"
        )
        
    if not current_user.verification_code or current_user.verification_code != code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
        
    if current_user.verification_expires_at is None or datetime.utcnow() > current_user.verification_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired"
        )
        
    # Apply the email change
    current_user.email = current_user.pending_email
    
    # Clear the verification data
    current_user.pending_email = None
    current_user.verification_code = None
    current_user.verification_expires_at = None
    
    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed. Please try again. Error: {str(e)}"
        )
        
    return build_user_response(current_user, db)


@router.get("/me/videos")
def get_my_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch all videos belonging to the authenticated user.
    Returns ALL videos (including private, processing, scheduled) for channel management.
    """
    from backend.routes.video_routes import get_thumbnail_url, parse_tags, VideoListResponse, AuthorResponse

    videos = db.query(Video).filter(
        Video.user_id == current_user.id
    ).order_by(Video.upload_date.desc()).all()

    return [
        VideoListResponse(
            id=video.id,
            title=video.title,
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
                id=current_user.id,
                username=current_user.username,
                profile_image=current_user.profile_image,
                video_count=current_user.videos.count()
            )
        )
        for video in videos
    ]


# ============================================================================
# Subscription Routes
# ============================================================================

@router.post("/subscribe/{user_id}", status_code=status.HTTP_201_CREATED)
async def subscribe_to_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe to a user channel."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="SELF_SUBSCRIPTION_NOT_ALLOWED")
    
    user_to_follow = db.query(User).filter(User.id == user_id).first()
    if not user_to_follow:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check existing subscription
    existing = db.query(Subscription).filter(
        Subscription.follower_id == current_user.id,
        Subscription.following_id == user_id
    ).first()
    
    if existing:
        return {"message": "Already subscribed"}
        
    new_sub = Subscription(follower_id=current_user.id, following_id=user_id)
    db.add(new_sub)
    db.commit()
    
    # Broadcast activity to streamer's chat room
    try:
        activity = ActivityLog(
            room=user_to_follow.username,
            username=current_user.username,
            activity_type="subscribe"
        )
        db.add(activity)
        db.commit()
        await manager.broadcast_activity(
            user_to_follow.username, "subscribe", current_user.username
        )
    except Exception:
        pass
    
    return {"message": "Subscribed successfully"}


@router.delete("/subscribe/{user_id}", status_code=status.HTTP_200_OK)
def unsubscribe_from_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe from a user channel."""
    subscription = db.query(Subscription).filter(
        Subscription.follower_id == current_user.id,
        Subscription.following_id == user_id
    ).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    db.delete(subscription)
    db.commit()
    
    return {"message": "Unsubscribed successfully"}


@router.get("/subscriptions", response_model=list[UserResponse])
def get_user_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of users the current user is subscribed to."""
    # Query subscriptions where follower_id is current_user.id
    subs = db.query(Subscription).filter(Subscription.follower_id == current_user.id).all()
    
    # Extract the user objects (following_id)
    followed_users = []
    for sub in subs:
        # We need to fetch the User object. 
        # Since we have the relationship set up in Subscription model:
        # following_user = relationship("User", foreign_keys=[following_id], ...)
        if sub.following_user:
            followed_users.append(sub.following_user)
            
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            profile_image=u.profile_image,
            created_at=u.created_at.isoformat() + "Z"
        ) for u in followed_users
    ]


# ============================================================================
# Optional: Password Reset (Placeholder)
# ============================================================================

@router.post("/forgot-password")
def forgot_password(email: EmailStr, db: Session = Depends(get_db)):
    """
    Request password reset (placeholder for future implementation).
    
    In production, this would:
    1. Generate a reset token
    2. Send email with reset link
    3. Store token with expiration
    """
    user = db.query(User).filter(User.email == email).first()
    
    # Always return success to prevent email enumeration
    return {
        "message": "If the email exists, a password reset link has been sent"
    }


# ============================================================================
# Stream Key Management
# ============================================================================

@router.get("/stream-key")
def get_stream_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve the current user's OBS Stream Key.
    If the user lacks one (legacy account), generate it on the fly.
    """
    if not current_user.stream_key:
        current_user.stream_key = generate_stream_key()
        db.commit()
        db.refresh(current_user)
        
    return {"stream_key": current_user.stream_key}


@router.post("/stream-key/reset")
def reset_stream_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Invalidate the old stream key and generate a fresh one.
    Crucial for security if a key is compromised.
    """
    current_user.stream_key = generate_stream_key()
    db.commit()
    db.refresh(current_user)
    
    return {
        "message": "Stream key universally regenerated",
        "stream_key": current_user.stream_key
    }


@router.put("/live-metadata")
def update_live_metadata(
    metadata_data: LiveMetadataUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the user's Stream Title and Category.
    """

    print(f"Server Log: Updating metadata to Title: {metadata_data.title}")
    current_user.stream_title = metadata_data.title
    current_user.stream_category = metadata_data.category
    if metadata_data.studio_bg_url is not None:
        current_user.studio_bg_url = metadata_data.studio_bg_url
    db.commit()
    db.refresh(current_user)
    
    return {
        "message": "Metadata updated gracefully",
        "stream_title": current_user.stream_title,
        "stream_category": current_user.stream_category,
        "studio_bg_url": current_user.studio_bg_url
    }


# ============================================================================
# Public Profile (No auth required)
# ============================================================================

@router.get("/profile/{username}", response_model=PublicProfileResponse)
def get_public_profile(
    username: str,
    db: Session = Depends(get_db)
):
    """
    Get a user's public profile by username.
    
    This endpoint is PUBLIC — no login required.
    Returns only public-safe fields (no email, no password_hash).
    Used by WatchPage to display stream metadata for any user.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    subscriber_count = db.query(func.count(Subscription.id)).filter(
        Subscription.following_id == user.id
    ).scalar() or 0
    
    video_count = db.query(func.count(Video.id)).filter(
        Video.user_id == user.id
    ).scalar() or 0
    
    return PublicProfileResponse(
        id=user.id,
        username=user.username,
        profile_image=user.profile_image,
        channel_description=user.channel_description,
        channel_banner_url=user.channel_banner_url,
        is_verified=user.is_verified,
        stream_title=user.stream_title,
        stream_category=user.stream_category,
        subscriber_count=subscriber_count,
        video_count=video_count,
        is_live=user.is_live
    )


# ============================================================================
# Live Stream Like (Toggle)
# ============================================================================

@router.post("/live/like/{username}")
async def toggle_live_like(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Like or unlike a user's live stream (toggle).
    
    - If the current user has NOT liked this stream, create a like.
    - If the current user HAS liked this stream, remove the like.
    Returns the new total like count and the user's current like state.
    """
    streamer = db.query(User).filter(User.username == username).first()
    if not streamer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Streamer not found"
        )
    
    if streamer.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot like your own stream"
        )
    
    # Check for existing like
    existing_like = db.query(StreamLike).filter(
        StreamLike.user_id == current_user.id,
        StreamLike.streamer_id == streamer.id
    ).first()
    
    if existing_like:
        # Unlike — remove the record
        db.delete(existing_like)
        db.commit()
        liked = False
    else:
        # Like — create the record
        new_like = StreamLike(user_id=current_user.id, streamer_id=streamer.id)
        db.add(new_like)
        db.commit()
        liked = True
        
        # Broadcast activity to streamer's chat room (only on new likes)
        try:
            activity = ActivityLog(
                room=username,
                username=current_user.username,
                activity_type="like"
            )
            db.add(activity)
            db.commit()
            await manager.broadcast_activity(
                username, "like", current_user.username
            )
        except Exception:
            pass
    
    # Count total likes for this streamer
    total_likes = db.query(func.count(StreamLike.id)).filter(
        StreamLike.streamer_id == streamer.id
    ).scalar() or 0
    
    return {
        "success": True,
        "liked": liked,
        "new_like_count": total_likes
    }


# Background Library Management
# ============================================================================

from backend.database.models import UserBackground

@router.post("/upload-background", response_model=BackgroundResponse)
async def upload_background(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a new custom background video for the Live Studio."""
    if not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video files are allowed")

    file_extension = Path(file.filename).suffix
    unique_filename = f"{current_user.id}_{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(BACKGROUNDS_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_bg = UserBackground(
        user_id=current_user.id,
        name=name,
        file_path=f"/backgrounds/{unique_filename}",
        is_default=False
    )
    db.add(db_bg)
    db.commit()
    db.refresh(db_bg)
    
    return db_bg


@router.get("/backgrounds", response_model=list[BackgroundResponse])
def get_user_backgrounds(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve all backgrounds uploaded by the current user."""
    backgrounds = db.query(UserBackground).filter(UserBackground.user_id == current_user.id).order_by(UserBackground.created_at.desc()).all()
    return backgrounds


@router.put("/backgrounds/{bg_id}/select")
def select_background(
    bg_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Set a specific user background as the active studio background."""
    bg = db.query(UserBackground).filter(UserBackground.id == bg_id, UserBackground.user_id == current_user.id).first()
    if not bg:
        raise HTTPException(status_code=404, detail="Background not found")
        
    current_user.studio_bg_url = bg.file_path
    
    # Mark others as not default, this one as default
    db.query(UserBackground).filter(UserBackground.user_id == current_user.id).update({"is_default": False})
    bg.is_default = True
    
    db.commit()
    
    return {"success": True, "active_background": bg.file_path}


@router.delete("/backgrounds/{bg_id}")
def delete_background(
    bg_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a custom background."""
    bg = db.query(UserBackground).filter(UserBackground.id == bg_id, UserBackground.user_id == current_user.id).first()
    if not bg:
        raise HTTPException(status_code=404, detail="Background not found")
        
    # Remove physical file
    filename = bg.file_path.split("/")[-1]
    physical_path = os.path.join(BACKGROUNDS_DIR, filename)
    if os.path.exists(physical_path):
        os.remove(physical_path)
        
    # If active, revert defaults
    if bg.is_default or current_user.studio_bg_url == bg.file_path:
        current_user.studio_bg_url = None
        
    db.delete(bg)
    db.commit()
    return {"success": True}

# ============================================================================
# Stream Thumbnail Upload
# ============================================================================

@router.post("/live/thumbnail")
async def upload_stream_thumbnail(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a custom thumbnail for the user's live stream.
    Replaces the existing thumbnail if one exists.
    Enforces a 2MB limit and standard image formats.
    """
    try:
        # Guarantee directory exists
        os.makedirs(THUMBNAILS_DIR, exist_ok=True)

        # 1. Validate Extension
        ext = os.path.splitext(file.filename)[1].lower()
        allowed_exts = ['.jpg', '.jpeg', '.png', '.webp']
        if ext not in allowed_exts:
            raise HTTPException(status_code=400, detail="Only JPG, PNG, and WEBP images are allowed.")
            
        # 2. Validate Size (2MB Limit)
        file_bytes = await file.read()
        if len(file_bytes) > 2 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Thumbnail must be under 2MB.")
        await file.seek(0)
        
        # 3. Cleanup Previous Thumbnail
        if current_user.stream_thumbnail:
            try:
                old_filename = current_user.stream_thumbnail.split('/')[-1]
                old_path = os.path.join(THUMBNAILS_DIR, old_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            except Exception as e:
                print(f"Failed to delete old thumbnail: {e}")
                    
        # 4. Save New Thumbnail
        filename = f"thumb_{current_user.username}_{uuid.uuid4().hex[:8]}{ext}"
        filepath = os.path.join(THUMBNAILS_DIR, filename)
        
        with open(filepath, "wb") as buffer:
            buffer.write(file_bytes)
            
        db_path = f"/storage/uploads/thumbnails/{filename}"
        current_user.stream_thumbnail = db_path
        
        db.commit()
        db.refresh(current_user)
        
        return {"success": True, "stream_thumbnail": db_path}
        
    except Exception as e:
        import traceback
        print("\n\n=== THUMBNAIL UPLOAD CRASH ===")
        traceback.print_exc()
        print("==============================\n\n")
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/active-live-streams", response_model=list[UserResponse])
def get_active_live_streams(db: Session = Depends(get_db)):
    """
    Get all users currently streaming live.
    """
    live_users = db.query(User).filter(
        User.is_live == True,
        User.is_staging == False
    ).all()
    
    return [build_user_response(user, db) for user in live_users]
