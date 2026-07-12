
import sys
import os
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

try:
    from backend.main import app
    print("Backend import successful")
except Exception as e:
    print(f"Backend import failed: {e}")
    import traceback
    traceback.print_exc()
