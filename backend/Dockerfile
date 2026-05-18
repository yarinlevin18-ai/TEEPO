FROM python:3.11-slim

# Install Chrome (modern GPG key method — apt-key is removed in Debian 13+)
# ffmpeg is needed by the lesson-recording pipeline: it converts any input
# (mp3/mp4/m4a/wav/webm/ogg) to chunked 10-minute mp3s that fit under
# Whisper's 25 MB per-request cap, so we can transcribe 90-minute classes.
RUN apt-get update && apt-get install -y \
    wget gnupg unzip curl ca-certificates ffmpeg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

COPY . .

# Render assigns the listen port via $PORT (default 10000 on free tier).
# Fall back to 5000 for local `docker run` so existing tooling keeps working.
ENV PORT=10000
EXPOSE 10000

# Use gunicorn instead of the Flask dev server. The dev server's debug
# reloader spawns a subprocess on file changes — Render's process tracker
# then loses the original PID and marks the container unhealthy
# (returns x-render-routing: no-server on every request).
#
# gthread worker + Flask-SocketIO's async_mode="threading" keeps REST
# endpoints responsive and falls back to long-polling for socket.io
# clients. Native ws upgrade would need an eventlet/gevent worker, but
# the sync + chat features that matter today work fine over polling.
#
# --timeout 120 because Moodle scrapes can take ~60s in the wild.
# --workers 1 because the free tier only has 512MB RAM and Chrome
# (used by the moodle scraper) is itself memory-hungry.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-10000} --worker-class gthread --workers 1 --threads 8 --timeout 120 --access-logfile - --error-logfile - app:app"]
