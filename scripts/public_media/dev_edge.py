"""Development HTTPS only: ephemeral self-signed certificate, no host configuration."""

import os
import subprocess
from pathlib import Path

root = Path("/tmp/media-edge")
root.mkdir(mode=0o700, exist_ok=True)
cert, key = root / "cert.pem", root / "key.pem"
subprocess.run(
    [
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        str(key),
        "-out",
        str(cert),
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
        "-days",
        "7",
    ],
    check=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
key.chmod(0o600)
config = Path("/opt/media/nginx.conf.template").read_text()
for name, value in {
    "LISTEN": "18443",
    "HOST": "localhost",
    "CERT": str(cert),
    "KEY": str(key),
    "UPSTREAM": "media-gateway:8000",
    "ACCESS_LOG": "/dev/stdout",
}.items():
    config = config.replace(f"@{name}@", value)
temps = "\n".join(f"{kind}_temp_path {root}/{kind};" for kind in ("client_body", "proxy", "fastcgi", "uwsgi", "scgi"))
path = root / "nginx.conf"
path.write_text(
    f"pid {root}/nginx.pid;\nerror_log /dev/null crit;\nevents {{ worker_connections 128; }}\nhttp {{\n{temps}\n{config}\n}}"
)
os.execvp("nginx", ["nginx", "-p", str(root), "-c", str(path), "-g", "daemon off;"])
