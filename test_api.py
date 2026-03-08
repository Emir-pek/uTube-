import urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:8000/api/v1/videos/trending?limit=5") as f:
        print(f.read().decode())
except Exception as e:
    print("REST ERROR:")
    print(e.read().decode())
