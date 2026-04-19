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

EXPOSE 5000
CMD ["python", "app.py"]
