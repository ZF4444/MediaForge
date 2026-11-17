import re

import pytest

from scripts.public_media.render_nginx import render


def values(host):
    return dict(
        LISTEN="18443",
        HOST=host,
        CERT="/etc/cert.pem",
        KEY="/etc/key.pem",
        UPSTREAM="127.0.0.1:13001",
        ACCESS_LOG="/var/log/nginx/video.log",
    )


@pytest.mark.parametrize("host,pattern", [("203.0.113.10", r"203\.0\.113\.10"), ("2001:db8::1", r"\[2001:db8::1\]")])
def test_ip_render_preserves_security_rules(host, pattern):
    result = render(values(host))
    assert pattern in result
    assert "$ssl_server_name" not in result
    assert "ssl default_server" in result
    assert "if ($media_ip_host_ok = 0) { return 444; }" in result
    assert not re.search(r"@[A-Z_]+@", result)
    for rule in (
        "limit_req zone=media_req burst=16 nodelay",
        "limit_conn media_conn 4",
        "return 405",
        "location / { return 404; }",
        "proxy_buffering off",
        'proxy_set_header Cookie ""',
        "proxy_max_temp_file_size 0",
        "ssl_protocols TLSv1.2 TLSv1.3",
        'Cache-Control "no-store"',
    ):
        assert rule in result


def test_domain_mode_still_requires_sni():
    result = render(values("download.example.com"))
    assert 'if ($ssl_server_name != "download.example.com")' in result
    assert "server_name _;" in result


@pytest.mark.parametrize(
    "host,mode", [("evil.test", "ip"), ("203.0.113.1", "domain"), ("evil/test", "auto"), ("host;return", "auto")]
)
def test_invalid_hosts_are_rejected(host, mode):
    with pytest.raises(ValueError):
        render(values(host), mode)
