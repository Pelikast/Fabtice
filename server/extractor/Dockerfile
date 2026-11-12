FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg iproute2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp needs a JavaScript runtime to solve YouTube's player challenges.
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

# Changing this value (the deploy script passes today's date) reinstalls the
# newest yt-dlp, which is how the server keeps up with YouTube changes.
ARG YTDLP_REFRESH=0
RUN pip install --no-cache-dir -U "yt-dlp[default]" aiohttp

RUN useradd --create-home fabtice
USER fabtice
WORKDIR /app
COPY app.py ytdlp_args.json ./

ENV PYTHONUNBUFFERED=1
CMD ["python", "app.py"]
