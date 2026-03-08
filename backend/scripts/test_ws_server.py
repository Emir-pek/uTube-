"""Isolated WebSocket test server — no middleware, no DB, no auth."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

app = FastAPI()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("[TEST] Connection attempt received!")
    await websocket.accept()
    print("[TEST] ✅ WebSocket accepted!")
    await websocket.send_json({"message": "Hello from isolated test server!"})
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[TEST] Received: {data}")
            await websocket.send_json({"echo": data})
    except WebSocketDisconnect:
        print("[TEST] Client disconnected")

@app.get("/")
def root():
    return {"status": "Test server running"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
