FROM python:3.11-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11.15 /uv /usr/local/bin/uv
WORKDIR /gateway
COPY config/deploy/public-media/pyproject.toml config/deploy/public-media/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app/public_media ./app/public_media
RUN groupadd -g 10001 gateway && useradd -r -u 10001 -g gateway gateway
ENV PATH="/gateway/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.public_media.gateway:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-proxy-headers", "--limit-concurrency", "64", "--timeout-keep-alive", "5"]
