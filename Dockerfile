FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY frontend/ ./frontend/
COPY static/ ./static/
WORKDIR /src/frontend
RUN npm ci && npm run build

FROM python:3.11-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . ./
COPY --from=frontend /src/static/ ./static/
RUN useradd --create-home --uid 10001 mediaforge \
    && mkdir -p /app/logs /app/data /app/workflows \
    && chown -R mediaforge:mediaforge /app
USER mediaforge
EXPOSE 3000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
