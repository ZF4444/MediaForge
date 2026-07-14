import main


def test_runninghub_app_headers_do_not_override_request_host(monkeypatch):
    monkeypatch.setattr(main, "runninghub_provider", lambda: {"id": "runninghub"})
    monkeypatch.setenv("RUNNINGHUB_API_KEY", "test-key")

    headers = main.runninghub_app_headers(True)

    assert "Host" not in headers
    assert headers["Authorization"] == "Bearer test-key"
    assert headers["Content-Type"] == "application/json"


def test_runninghub_extract_outputs_nested_urls():
    payload = {
        "outputs": [
            {"fileUrl": "https://example.com/a.png"},
            {"result": {"imageUrl": ["https://example.com/b.webp"]}},
            {"data": {"download_url": "https://example.com/c.mp4"}},
        ]
    }

    assert main.runninghub_extract_outputs(payload) == [
        "https://example.com/a.png",
        "https://example.com/b.webp",
        "https://example.com/c.mp4",
    ]


def test_runninghub_extract_outputs_node_map_and_filename():
    payload = {
        "data": {
            "123": {
                "outputs": {
                    "images": [
                        {"fieldValue": "ignore-this-input.png"},
                        {"fileName": "generated-image.png"},
                    ]
                }
            }
        }
    }

    assert main.runninghub_extract_outputs(payload) == ["generated-image.png"]


def test_runninghub_code_zero_without_urls_stays_running():
    assert main.runninghub_normalized_status({"code": 0, "data": {}}, 0, []) == "RUNNING"
    assert main.runninghub_normalized_status({"code": 0, "data": {}}, 0, ["https://example.com/a.png"]) == "SUCCESS"


def test_runninghub_output_kind_uses_media_extension():
    assert main.runninghub_output_kind("mp4") == "video"
    assert main.runninghub_output_kind("wav") == "audio"
    assert main.runninghub_output_kind("zip") == "file"
    assert main.runninghub_output_kind("webp") == "image"
