# The backing track fetcher, packaged so it needs nothing installed on the host.
#
# It has to run on your own machine rather than a server: YouTube refuses
# datacenter addresses. Docker Desktop routes the container's traffic out
# through your home connection, so from YouTube's side this looks like you.

FROM node:22-slim

# yt-dlp is Python, and ffmpeg does the audio extraction
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

# Only the Supabase client is needed, not the whole app
COPY docker/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY scripts/song-fetcher.mjs ./scripts/song-fetcher.mjs
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
