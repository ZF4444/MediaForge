"""Compatibility entry; use python -m app.initialize --public-media for new deployments."""

import argparse
import os

from app.public_media.bootstrap import migrate

__all__ = ["migrate"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rotate-passwords", action="store_true")
    args = parser.parse_args()
    try:
        migrate(
            os.environ["PUBLIC_VIDEO_MIGRATION_DSN"],
            os.environ["PUBLIC_VIDEO_WRITER_PASSWORD"],
            os.environ["PUBLIC_VIDEO_VALIDATOR_PASSWORD"],
            rotate_passwords=args.rotate_passwords,
        )
    except Exception:
        raise SystemExit("Media initialization failed; check dedicated database, privileges and credentials") from None
    print("Media authorization schema ready; existing policies and passwords preserved")
