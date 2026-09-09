#!/bin/sh
set -e

# YouTube changes often enough that a pinned yt-dlp goes stale within weeks,
# so refresh it on start unless asked not to
if [ "$SKIP_YTDLP_UPDATE" != "1" ]; then
  echo "Updating yt-dlp…"
  pip3 install --break-system-packages --quiet --upgrade yt-dlp \
    || echo "Could not update yt-dlp; carrying on with the version in the image"
fi

yt-dlp --version | sed 's/^/yt-dlp /'
exec node /app/scripts/song-fetcher.mjs "$@"
