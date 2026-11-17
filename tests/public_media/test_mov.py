from fastapi.testclient import TestClient

from app.public_media.contracts import new_token
from app.public_media.gateway import create_app


def test_real_mov_mime_and_suffix_bytes(real):
    snapshot = real["reader"].snapshot(
        {
            "bucket": "media-test-versioned",
            "object_key": "allowed/input.mov",
            "size": len(real["mov_content"]),
            "ext": "mov",
            "content_type": "video/quicktime",
        }
    )
    source = real["writer"].create_source(
        dict(snapshot, owner_id="alice", file_id="mov-a", task_id="task-a", provider_id="supplier")
    )
    token, digest = new_token()
    grant = real["writer"].issue(source["id"], "alice", digest, "mov-test-123", 1800)
    path = f"/fetch/v1/{grant['id']}/video.mov?token={token}"
    with TestClient(create_app(real["settings"], real["validator"], real["reader"])) as client:
        response = client.get(path, headers={"Range": "bytes=-17"})
        assert response.status_code == 206 and response.content == real["mov_content"][-17:]
        assert response.headers["content-type"] == "video/quicktime"
        assert response.headers["content-length"] == "17"
        assert client.get(path + "&token=" + token).status_code == 404
