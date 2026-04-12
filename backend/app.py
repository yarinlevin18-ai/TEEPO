"""
אפליקציית הלמידה - שרת Flask עם WebSocket
מפעיל את כל ה-API routes ואת הצ'אט בזמן אמת.
"""
import os
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

from config import FLASK_SECRET_KEY, FLASK_ENV
from routes.api import api
from routes.bgu import bgu
from routes.websocket import register_socket_events

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

# Allow Next.js frontend (dev: 3000, prod: Vercel domain)
CORS(app, origins=["http://localhost:3000", "https://*.vercel.app"], supports_credentials=True)

socketio = SocketIO(
    app,
    cors_allowed_origins=["http://localhost:3000", "https://*.vercel.app"],
    async_mode="threading",
    logger=FLASK_ENV == "development",
    engineio_logger=False,
)

# Register REST routes
app.register_blueprint(api)
app.register_blueprint(bgu)

# Register WebSocket events
register_socket_events(socketio)


@app.get("/health")
def health():
    return {"status": "ok", "message": "שרת הלמידה פעיל"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"🚀 מפעיל שרת לימודים על פורט {port}...")
    socketio.run(app, host="0.0.0.0", port=port, debug=FLASK_ENV == "development")
