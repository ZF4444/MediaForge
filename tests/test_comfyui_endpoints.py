import pytest

from app.core.comfyui import comfyui_url, normalize_comfyui_endpoint


def test_legacy_host_port_defaults_to_http():
    assert normalize_comfyui_endpoint("127.0.0.1:8188") == "http://127.0.0.1:8188"


def test_bare_gateway_hostname_defaults_to_https():
    endpoint = "c6fc4e1f29a54123912d7bd086de9b77.region1.waas.aigate.cc"
    assert normalize_comfyui_endpoint(endpoint) == f"https://{endpoint}"


def test_explicit_https_and_gateway_path_are_preserved():
    endpoint = normalize_comfyui_endpoint("https://gateway.example.com/comfy/")
    assert endpoint == "https://gateway.example.com/comfy"
    assert comfyui_url(endpoint, "/queue") == "https://gateway.example.com/comfy/queue"


@pytest.mark.parametrize("value", ["ftp://gateway.example.com", "https://gateway.example.com:bad", "https://"])
def test_invalid_comfyui_endpoint_is_rejected(value):
    with pytest.raises(ValueError):
        normalize_comfyui_endpoint(value)
