FROM debian:bookworm-slim
ARG DEBIAN_MIRROR=deb.debian.org
RUN sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends nginx openssl python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home edge
COPY config/deploy/public-media/nginx.conf.template /opt/media/nginx.conf.template
COPY scripts/public_media/dev_edge.py /opt/media/dev_edge.py
USER 10001:10001
ENTRYPOINT ["python3", "/opt/media/dev_edge.py"]
