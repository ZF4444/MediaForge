import main


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
