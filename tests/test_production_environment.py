"""Production single-file configuration and credential boundaries (no daemon writes)."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("enabled", ["false", "true"])
def test_production_compose_injects_only_service_configuration(tmp_path, enabled):
    if not shutil.which("docker"):
        pytest.skip("Compose contract check requires the host Docker CLI")
    config = tmp_path / "single.env"
    config.write_text(
        (ROOT / "config/deploy/.env.example").read_text()
        + f"\nPUBLIC_VIDEO_ENABLED={enabled}\n"
        + """
POSTGRES_PASSWORD=sentinel_postgres_admin
MINIO_ROOT_PASSWORD=sentinel_storage_admin
APP_SECRET_KEY=sentinel_application_secret
PUBLIC_VIDEO_WRITER_DSN=postgresql://media_writer:sentinel_writer@postgres:5432/media_auth
PUBLIC_VIDEO_VALIDATOR_DSN=postgresql://media_validator:sentinel_validator@postgres:5432/media_auth
PUBLIC_VIDEO_MINIO_SECRET_KEY=sentinel_read_only_storage
PUBLIC_VIDEO_ADMIN_DSN=sentinel_untrusted_override
UNEXPECTED_SECRET=sentinel_must_never_be_injected
CANVAS_TASK_WORKER_CONCURRENCY=53
VIDEO_POLL_TIMEOUT=555
"""
    )
    env = {
        key: value
        for key, value in os.environ.items()
        if key in {"PATH", "HOME", "XDG_RUNTIME_DIR"} or key.startswith("DOCKER_")
    }
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(config),
            "-f",
            str(ROOT / "config/deploy/compose.yml"),
            "-f",
            str(ROOT / "config/deploy/public-media/compose.override.yml"),
            "--profile",
            "public-media",
            "--profile",
            "media-tools",
            "--profile",
            "init",
            "config",
            "--format",
            "json",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, "Production Compose must parse from one configuration file"
    rendered = json.loads(result.stdout)
    services = rendered["services"]
    assert "media-edge" not in services
    for service in services.values():
        assert not service.get("env_file")
        assert "UNEXPECTED_SECRET" not in service.get("environment", {})
    for name in ("api", "worker"):
        values = services[name]["environment"]
        assert values["PUBLIC_VIDEO_ENABLED"] == enabled
        assert "sentinel_writer" in values["PUBLIC_VIDEO_WRITER_DSN"]
        assert values["APP_SECRET_KEY"] == "sentinel_application_secret"
        assert values["CANVAS_TASK_WORKER_CONCURRENCY"] == "53"
        assert values["VIDEO_POLL_TIMEOUT"] == "555"
        assert values["LOAD_BOOTSTRAP_ENV"] == "false"
        for key in ("PUBLIC_VIDEO_VALIDATOR_DSN", "PUBLIC_VIDEO_ADMIN_DSN", "POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD"):
            assert key not in values
    postgres = services["postgres"]
    assert postgres["command"] == ["postgres", "-c", "hba_file=/etc/postgresql/media-pg_hba.conf"]
    mounts = {v["target"]: v for v in postgres["volumes"]}
    hba = mounts["/etc/postgresql/media-pg_hba.conf"]
    assert Path(hba["source"]) == ROOT / "config/deploy/public-media/pg_hba.conf"
    assert hba["read_only"] is True
    assert hba["bind"]["create_host_path"] is False
    assert "/var/lib/postgresql/data" in mounts
    assert not postgres.get("ports")
    gateway = services["media-gateway"]
    values = gateway["environment"]
    assert values["PUBLIC_VIDEO_ENABLED"] == enabled
    assert "sentinel_validator" in values["PUBLIC_VIDEO_VALIDATOR_DSN"]
    assert values["PUBLIC_VIDEO_MINIO_SECRET_KEY"] == "sentinel_read_only_storage"
    for key in (
        "PUBLIC_VIDEO_WRITER_DSN",
        "PUBLIC_VIDEO_ADMIN_DSN",
        "DATABASE_URL",
        "REDIS_URL",
        "APP_SECRET_KEY",
        "MINIO_ACCESS_KEY",
    ):
        assert key not in values
    assert not gateway.get("volumes")
    assert gateway["read_only"] is True
    assert gateway["user"] == "10001:10001"
    assert gateway["ports"][0]["host_ip"] == "127.0.0.1"
    assert "media_ingress" in gateway["networks"]
    assert (
        rendered["networks"]["media_ingress"]["driver_opts"]["com.docker.network.bridge.enable_ip_masquerade"]
        == "false"
    )
    for name in ("postgres", "minio"):
        assert "media_ingress" not in services[name]["networks"]
    for name in ("media_auth", "media_storage"):
        assert rendered["networks"][name]["internal"] is True
    initializer = services["media-init"]["environment"]
    assert "sentinel_postgres_admin" in initializer["PUBLIC_VIDEO_ADMIN_DSN"]
    assert initializer["PUBLIC_VIDEO_ADMIN_DSN"] != "sentinel_untrusted_override"
    assert "sentinel_writer" in initializer["PUBLIC_VIDEO_WRITER_DSN"]
    assert "sentinel_validator" in initializer["PUBLIC_VIDEO_VALIDATOR_DSN"]
    assert initializer["MINIO_SECRET_KEY"] == "sentinel_storage_admin"
    assert "PUBLIC_VIDEO_ADMIN_DSN" not in services["project-init"]["environment"]
    for name in ("project-init", "media-init"):
        service = services[name]
        assert service["user"] == "10001:10001"
        assert service["restart"] == "no"
        assert service["environment"]["LOG_DIR"] == "/app/logs/init"
        assert service["environment"]["LOAD_BOOTSTRAP_ENV"] == "false"
        mounts = {v["target"]: v for v in service["volumes"]}
        assert not mounts["/app/logs"].get("read_only", False)
        assert "/app/config" not in mounts
    recovery = services["media-recover"]
    assert recovery["environment"] == {"PUBLIC_VIDEO_WRITER_DSN": initializer["PUBLIC_VIDEO_WRITER_DSN"]}
    assert recovery["read_only"] is True
    assert not recovery.get("volumes")


def test_production_templates_have_one_configuration_source():
    assert not (ROOT / "config/deploy/public-media/writer.env.example").exists()
    assert not (ROOT / "config/deploy/public-media/gateway.env.example").exists()

    # Keep business allowlists aligned so moving between environments does not
    # silently drop an explicitly configured business setting.
    def keys(path):
        text = path.read_text().split("x-business-environment: &business-environment\n", 1)[1]
        return {line.strip().rstrip(":") for line in text.split("\n\n", 1)[0].splitlines()}

    assert keys(ROOT / "config/deploy/compose.yml") == keys(ROOT / "config/dev/compose.yml")
