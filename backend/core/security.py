"""
Security and Authentication Utilities
--------------------------------------
Handles password hashing, JWT token generation, and user authentication.

Features:
- Password hashing with bcrypt
- JWT token generation and validation
- User authentication helpers
"""

from datetime import datetime, timedelta
from typing import Optional, Union
import bcrypt
import secrets
from jose import JWTError, jwt
from fastapi import HTTPException, status
from pathlib import Path
from email_validator import validate_email as validate_email_lib, EmailNotValidError

from backend.core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

import os

def secure_resolve(base_dir: Path, sub_path: Union[str, Path]) -> Path:
    """
    Resolve a user-provided path and ensure it stays within the base directory.
    Prevents Path Traversal vulnerabilities (CodeQL compliant).
    """
    try:
        # Prevent absolute path injection by stripping leading slashes
        sub_path_str = str(sub_path).lstrip("/\\")
        
        # Determine the absolute base directory
        base_dir_str = os.path.abspath(str(base_dir))
        
        # Construct the final absolute target path
        target_path_str = os.path.abspath(os.path.normpath(os.path.join(base_dir_str, sub_path_str)))
        
        # Ensure correct trailing slash on the prefix to prevent partial matches 
        # (e.g., base_dir="/safe", target_path="/safe_hacked" -> would normally pass without trailing slash)
        prefix = base_dir_str if base_dir_str.endswith(os.sep) else base_dir_str + os.sep
        
        # Validate that the target path is strictly within the base directory
        # Allowing target_path_str == base_dir_str in case the root directory itself is being referenced.
        if target_path_str != base_dir_str and not target_path_str.startswith(prefix):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Invalid file path."
            )
            
        return Path(target_path_str)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Invalid file path.")

def generate_stream_key() -> str:
    """Generate a secure, random stream key for OBS RTMP."""
    return f"live_{secrets.token_hex(16)}"

# Password hashing configuration
# We use direct bcrypt for better compatibility with Python 3.13


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Hashed password string
    """
    # bcrypt expects bytes
    password_bytes = password.encode('utf-8')
    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    # Return as string for database storage
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password from database
        
    Returns:
        True if password matches, False otherwise
    """
    try:
        # Encode both to bytes
        password_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        # Verify
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    # Build payload carefully to ensure all values are standard serializable strings/ints
    to_encode = {}
    for key, value in data.items():
        to_encode[key] = str(value) if key == "sub" else value
    
    # Set expiration time
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode["exp"] = expire
    
    # Encode the JWT
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT access token.
    
    Args:
        token: JWT token string to decode
        
    Returns:
        Decoded token payload if valid
        
    Raises:
        JWTError: If token is invalid or expired
    """
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password strength.
    
    Requirements:
    - At least 8 characters
    - Contains at least one uppercase letter
    - Contains at least one lowercase letter
    - Contains at least one digit
    
    Args:
        password: Password to validate
        
    Returns:
        Tuple of (is_valid, error_message)
        
    Example:
        >>> validate_password_strength("weak")
        (False, "Password must be at least 8 characters long")
        >>> validate_password_strength("StrongPass123")
        (True, "")
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit"
    
    return True, ""


# Common disposable email domains
DISPOSABLE_DOMAINS = {
    'mailinator.com', '10minutemail.com', 'temp-mail.org', 'guerrillamail.com', 
    'yopmail.com', 'throwawaymail.com', 'tempmail.com', 'getnada.com', 
    'sharklasers.com', 'maildrop.cc'
}

def validate_email(email: str) -> tuple[bool, str]:
    """
    Robust email validation using email-validator library and a disposable domain check.
    
    Args:
        email: Email address to validate
        
    Returns:
        Tuple of (is_valid, error_message)
        
    Example:
        >>> validate_email("user@example.com")
        (True, "")
        >>> validate_email("invalid-email")
        (False, "The email address is not valid. It must have exactly one @-sign.")
        >>> validate_email("user@mailinator.com")
        (False, "Disposable email providers are not allowed.")
    """
    try:
        # Check that the email address is valid. Turn on check_deliverability
        # for first-time validations to ensure the domain has MX records.
        valid = validate_email_lib(email, check_deliverability=True)
        
        # Extract the normalized domain
        domain = valid.domain.lower()
        
        # Check against blacklist
        if domain in DISPOSABLE_DOMAINS:
            return False, "Disposable email providers are not allowed."
            
        return True, ""
        
    except EmailNotValidError as e:
        # The exception message is human-readable and specific to the exact problem
        return False, str(e)


# Test the security functions
if __name__ == "__main__":
    print("Testing Security Functions")
    print("=" * 60)
    
    # Test password hashing
    password = "TestPassword123"
    hashed = hash_password(password)
    print("\n1. Password Hashing:")
    print(f"   Original: {password}")
    print(f"   Hashed: {hashed[:50]}...")
    print(f"   Verify correct: {verify_password(password, hashed)}")
    print(f"   Verify wrong: {verify_password('WrongPassword', hashed)}")
    
    # Test JWT token
    print("\n2. JWT Token:")
    token = create_access_token({"sub": "user123", "username": "john_doe"})
    print(f"   Token: {token[:50]}...")
    decoded = decode_access_token(token)
    print(f"   Decoded: {decoded}")
    
    # Test password validation
    print("\n3. Password Validation:")
    test_passwords = ["weak", "WeakPass", "weakpass123", "StrongPass123"]
    for pwd in test_passwords:
        valid, msg = validate_password_strength(pwd)
        status = "✓" if valid else "✗"
        print(f"   {status} '{pwd}': {msg if msg else 'Valid'}")
    
    # Test email validation
    print("\n4. Email Validation:")
    test_emails = ["user@example.com", "invalid", "test@test", "valid.email@domain.co.uk"]
    for email in test_emails:
        valid = validate_email(email)
        status = "✓" if valid else "✗"
        print(f"   {status} {email}")
    
    print("\n" + "=" * 60)
