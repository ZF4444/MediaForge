"""Self-contained local UI server runner used by CI and developers."""

import socket
import subprocess
import sys
import time
from contextlib import suppress

from browser_test import run

if __name__ == "__main__":
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        listen_port = sock.getsockname()[1]
    process = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(listen_port), "--strictPort"],
        cwd="frontend",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", listen_port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            sys.exit("Local frontend server did not start")
        run(f"http://127.0.0.1:{listen_port}")
    finally:
        import os
        import signal

        with suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
