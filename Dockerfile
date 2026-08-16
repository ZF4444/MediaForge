FROM node:20-bookworm-slim AS frontend

WORKDIR /src
COPY . ./
WORKDIR /src/frontend
RUN npm ci && npm run build

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . ./
COPY --from=frontend /src/static/dist ./static/dist

RUN useradd --create-home --uid 10001 mediaforge \
    && mkdir -p /app/logs /app/data \
    && chown -R mediaforge:mediaforge /app

USER mediaforge

EXPOSE 3000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1"]
