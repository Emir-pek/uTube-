import urllib.request
import urllib.error
import json

def fetch(url):
    print(f"Fetching {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            print(f"Status: {response.getcode()}")
            print(f"Content: {response.read().decode()[:100]}...")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
    except Exception as e:
        print(f"Error: {e}")

fetch("http://localhost:8000/api/v1/videos/1")
fetch("http://localhost:8000/api/v1/videos/1/")
