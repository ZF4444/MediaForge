"""Compose credential boundaries, checked with synthetic values and no containers."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_development_compose_injects_only_per_service_credentials(tmp_path):
    if not shutil.which("docker"):
        pytest.skip("Compose contract check requires the host Docker CLI")
    config = tmp_path / "single.env"
    config.write_text(
        (ROOT / "config/dev/.env.example").read_text()
        + """
PUBLIC_VIDEO_ENABLED=true
POSTGRES_PASSWORD=sentinel_postgres_admin
MINIO_ROOT_PASSWORD=sentinel_storage_admin
APP_SECRET_KEY=sentinel_application_secret
PUBLIC_VIDEO_WRITER_DSN=postgresql://media_writer:sentinel_writer@postgres:5432/media_auth
PUBLIC_VIDEO_VALIDATOR_DSN=postgresql://media_validator:sentinel_validator@postgres:5432/media_auth
PUBLIC_VIDEO_MINIO_SECRET_KEY=sentinel_read_only_storage
PUBLIC_VIDEO_ADMIN_DSN=sentinel_untrusted_admin_override
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
            str(ROOT / "config/dev/compose.yml"),
            "-f",
            str(ROOT / "config/dev/public-media.yml"),
            "--profile",
            "public-media",
            "--profile",
            "media-tools",
            "--profile",
            "init",
            "--profile",
            "media-https",
            "config",
            "--format",
            "json",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, "Compose configuration must parse without additional env files"
    rendered = json.loads(result.stdout)
    services = rendered["services"]
    for name in ("media_auth", "media_storage", "media_download"):
        assert rendered["networks"][name]["internal"] is True
    ingress = rendered["networks"]["media_ingress"]
    assert not ingress.get("internal", False)
    assert ingress["driver_opts"]["com.docker.network.bridge.enable_ip_masquerade"] == "false"
    for name in ("media-gateway", "media-edge"):
        assert "media_ingress" in services[name]["networks"]
        assert all(port["host_ip"] == "127.0.0.1" for port in services[name]["ports"])
    for name in ("postgres", "minio"):
        assert "media_ingress" not in services[name]["networks"]
    for service in services.values():
        assert not service.get("env_file")
        assert "UNEXPECTED_SECRET" not in service.get("environment", {})
    for name in ("api", "worker"):
        values = services[name]["environment"]
        assert "sentinel_writer" in values["PUBLIC_VIDEO_WRITER_DSN"]
        assert values["APP_SECRET_KEY"] == "sentinel_application_secret"
        assert values["CANVAS_TASK_WORKER_CONCURRENCY"] == "53"
        assert values["VIDEO_POLL_TIMEOUT"] == "555"
        assert values["LOAD_BOOTSTRAP_ENV"] == "false"
        assert "PUBLIC_VIDEO_VALIDATOR_DSN" not in values
        assert "PUBLIC_VIDEO_ADMIN_DSN" not in values
        assert "POSTGRES_PASSWORD" not in values
    gateway = services["media-gateway"]["environment"]
    assert "sentinel_validator" in gateway["PUBLIC_VIDEO_VALIDATOR_DSN"]
    assert gateway["PUBLIC_VIDEO_MINIO_SECRET_KEY"] == "sentinel_read_only_storage"
    assert not services["media-gateway"].get("volumes")
    for key in (
        "PUBLIC_VIDEO_WRITER_DSN",
        "PUBLIC_VIDEO_ADMIN_DSN",
        "DATABASE_URL",
        "REDIS_URL",
        "APP_SECRET_KEY",
        "POSTGRES_PASSWORD",
        "MINIO_ROOT_PASSWORD",
    ):
        assert key not in gateway
    initializer = services["media-init"]["environment"]
    assert "sentinel_writer" in initializer["PUBLIC_VIDEO_WRITER_DSN"]
    assert "sentinel_validator" in initializer["PUBLIC_VIDEO_VALIDATOR_DSN"]
    assert "sentinel_postgres_admin" in initializer["PUBLIC_VIDEO_ADMIN_DSN"]
    assert initializer["PUBLIC_VIDEO_ADMIN_DSN"] != "sentinel_untrusted_admin_override"
    assert "PUBLIC_VIDEO_ADMIN_DSN" not in services["project-init"]["environment"]
    for name in ("project-init", "media-init"):
        assert services[name]["environment"]["LOG_DIR"] == "/app/logs/init"
        mounts = {mount["target"]: mount for mount in services[name]["volumes"]}
        assert mounts["/app"]["read_only"] is True
        assert mounts["/app/logs"]["type"] == "volume"
        assert mounts["/app/logs"]["source"] == "app-logs"
        assert not mounts["/app/logs"].get("read_only", False)
    assert services["media-recover"]["environment"] == {
        "PUBLIC_VIDEO_WRITER_DSN": services["api"]["environment"]["PUBLIC_VIDEO_WRITER_DSN"]
    }


@pytest.mark.parametrize(
    "file_value, exported, enabled",
    [
        ("true", None, "true"),
        ("false", None, "false"),
        ('"true" # comment', None, "true"),
        ("'false' # comment", None, "false"),
        ("true", "false", "false"),
    ],
)
def test_development_launcher_uses_shared_switch_without_loading_env_as_shell(tmp_path, file_value, exported, enabled):
    project = tmp_path / "project"
    (project / "scripts").mkdir(parents=True)
    (project / "scripts/dev.sh").write_text((ROOT / "scripts/dev.sh").read_text())
    (project / "config/dev").mkdir(parents=True)
    marker = tmp_path / "must-not-execute"
    (project / "config/dev/.env").write_text(f"PUBLIC_VIDEO_ENABLED={file_value}\nOTHER_SETTING=$(touch {marker})\n")
    log = tmp_path / "commands"
    docker = tmp_path / "docker"
    docker.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$MEDIAFORGE_COMMAND_LOG"\n')
    docker.chmod(0o755)
    env = {
        **os.environ,
        "PATH": str(tmp_path) + os.pathsep + os.environ["PATH"],
        "MEDIAFORGE_COMMAND_LOG": str(log),
    }
    env.pop("PUBLIC_VIDEO_ENABLED", None)
    if exported is not None:
        env["PUBLIC_VIDEO_ENABLED"] = exported
    subprocess.run(["bash", str(project / "scripts/dev.sh"), "up"], env=env, check=True, capture_output=True)
    assert not marker.exists()
    commands = log.read_text().splitlines()
    assert all("--env-file config/dev/.env" in command for command in commands)
    assert all("-f config/dev/public-media.yml" in command for command in commands)
    assert commands[-1].endswith("up -d --build")
    if enabled == "true":
        assert len(commands) == 1 and "--profile public-media" in commands[0]
    else:
        assert len(commands) == 2
        assert commands[0].endswith("stop media-edge media-gateway")
        assert "--profile public-media" not in commands[-1]
