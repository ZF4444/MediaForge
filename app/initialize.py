"""One-off project initialization. Admin credentials belong only to this process."""

import argparse
import asyncio
import os


class InitializationError(RuntimeError):
    pass


def step(name, function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except Exception as exc:
        detail = getattr(exc, "safe_message", type(exc).__name__)
        raise InitializationError(f"{name} failed ({detail})") from None


def initialize(*, public_media=False):
    from app.core.database import close_database_pool, open_database_pool

    async def run():
        await open_database_pool()
        try:
            await asyncio.to_thread(prepare_schemas, public_media=public_media)
        finally:
            await close_database_pool()

    asyncio.run(run())


def prepare_schemas(*, public_media=False):
    from app.services.business_metadata import initialize_business_metadata
    from app.services.connection_secrets import initialize_connection_secrets
    from app.services.storage import verify_storage_startup

    step("Business storage", verify_storage_startup)
    step("Business metadata", initialize_business_metadata)
    if os.getenv("APP_SECRET_KEY"):
        step("Business secret schema", initialize_connection_secrets)
    if public_media:
        from app.public_media.bootstrap import initialize_authorizations, initialize_storage_reader
        from app.public_media.config import load_settings

        step(
            "Media authorization database",
            initialize_authorizations,
            os.environ["PUBLIC_VIDEO_ADMIN_DSN"],
            os.environ["PUBLIC_VIDEO_WRITER_DSN"],
            os.environ["PUBLIC_VIDEO_VALIDATOR_DSN"],
        )
        step(
            "MinIO reader",
            initialize_storage_reader,
            load_settings(),
            os.environ["MINIO_ENDPOINT"],
            os.environ["MINIO_ACCESS_KEY"],
            os.environ["MINIO_SECRET_KEY"],
            secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-media", action="store_true")
    args = parser.parse_args()
    try:
        initialize(public_media=args.public_media)
    except InitializationError as exc:
        raise SystemExit(f"Project initialization failed: {exc}") from None
    except Exception:
        raise SystemExit(
            "Project initialization failed; check configuration, connectivity and database permissions"
        ) from None
    print("Project initialization complete; outward delivery policies unchanged")
