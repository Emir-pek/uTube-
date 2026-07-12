import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core.security import secure_resolve
from fastapi import HTTPException

def test_secure_resolve():
    base = Path("/tmp/safe_dir")
    
    # Valid paths
    try:
        res = secure_resolve(base, "file.txt")
        print(f"[OK] Valid file: {res}")
    except HTTPException:
        print("[FAIL] Valid file rejected.")
        
    try:
        res = secure_resolve(base, "nested/file.txt")
        print(f"[OK] Nested file: {res}")
    except HTTPException:
        print("[FAIL] Nested file rejected.")
        
    # Invalid paths (traversal)
    try:
        res = secure_resolve(base, "../etc/passwd")
        print(f"[FAIL] Traversal allowed! {res}")
    except HTTPException as e:
        print(f"[OK] Traversal blocked: {e.detail}")
        
    try:
        res = secure_resolve(base, "/etc/passwd")
        print(f"[FAIL] Absolute path allowed! {res}")
    except HTTPException as e:
        print(f"[OK] Absolute path blocked: {e.detail}")
        
if __name__ == "__main__":
    test_secure_resolve()
