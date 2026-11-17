ARG APP_IMAGE=mediaforge:dev
ARG MINIO_IMAGE=mediaforge-minio:2025-10-15
FROM ${APP_IMAGE} AS app
FROM ${MINIO_IMAGE} AS objects
FROM postgres:16-bookworm
ARG DEBIAN_MIRROR=deb.debian.org
USER root
COPY --from=app /usr/local/ /usr/local/
COPY --from=app /opt/venv/ /opt/venv/
COPY --from=objects /usr/local/bin/minio /usr/local/bin/minio
RUN sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends ffmpeg nginx openssl curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home tester
WORKDIR /app
COPY --chown=10001:10001 . /app/
ENV PATH="/opt/venv/bin:/usr/lib/postgresql/16/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PUBLIC_VIDEO_INTEGRATION=1
RUN mkdir -p /app/.runtime /app/data /app/logs && chown -R tester:tester /app/.runtime /app/data /app/logs
USER 10001:10001
ENTRYPOINT ["python", "-m", "pytest"]
CMD ["tests/public_media", "-q", "-o", "cache_dir=/tmp/pytest-cache"]
