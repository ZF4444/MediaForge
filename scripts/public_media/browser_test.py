"""Native Playwright UI checks. Uses a simulated management API, no real users.

Run against the local Vite server; real backend/PG/MinIO checks are in pytest.
"""

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def run(base="http://127.0.0.1:5178"):
    token = "test-browser-secret-" + "x" * 30
    url = f"https://media.test/fetch/v1/{'a' * 32}/video.mp4?token={token}"
    state = {"admin": False, "revoked": False, "issued": False}
    requests = []

    def api(route):
        request = route.request
        requests.append((request.url, request.method, request.post_data))
        if request.method != "GET":
            assert request.headers.get("x-mediaforge-request") == "1"
        path = request.url.split("/api/")[1].split("?")[0]
        if path == "public-video-grants":
            data = {
                "items": [
                    {
                        "id": "a" * 32,
                        "source_id": "b" * 32,
                        "file_id": '<img src=x onerror="alert(1)">',
                        "task_id": "task-a",
                        "provider_id": "supplier",
                        "owner_id": "alice",
                        "state": "revoked" if state["revoked"] else "active",
                        "expires_at": "2030-01-01T00:00:00Z",
                        "reserved_bytes": 100000,
                        "bytes_sent": 50000,
                        "get_count": 1,
                        "head_count": 1,
                    }
                ],
                "total": 1,
                "offset": 0,
                "limit": 30,
                "viewer_id": "alice",
                "is_admin": state["admin"],
            }
        elif path == "public-video-sources":
            data = {"id": "b" * 32}
        elif path.endswith("/grants"):
            state["issued"] = True
            data = {"id": "a" * 32, "url": url}
        elif path.endswith("/revoke"):
            state["revoked"] = True
            data = {"ok": True}
        elif path == "admin/public-video-policy":
            data = {
                "items": [
                    {
                        "scope": "global",
                        "key": "*",
                        "enabled": True,
                        "daily_bytes": 1048576,
                        "active_bytes": 1048576,
                        "used_bytes": 0,
                        "window_date": "2030-01-01",
                    }
                ]
            }
        else:
            data = {"ok": True}
        route.fulfill(status=200, json=data)

    artifacts = Path(".runtime/public-media-browser")
    artifacts.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.getenv("PUBLIC_VIDEO_BROWSER_EXECUTABLE"))
        context = browser.new_context(
            permissions=["clipboard-read", "clipboard-write"], viewport={"width": 1360, "height": 1000}
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("**/api/**", api)
        page.goto(base + "/static/public-video-links.html")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="外发链接", exact=True)).to_be_visible()
        expect(page.locator("#admin-panel")).to_be_hidden()
        assert page.locator("#records img").count() == 0
        page.get_by_label("文件 ID", exact=True).fill("file-a")
        page.get_by_label("任务 ID", exact=True).fill("task-a")
        page.get_by_label("供应商连接 ID", exact=True).fill("supplier")
        page.get_by_role("button", name="签发链接", exact=True).click()
        expect(page.locator("#link-dialog")).to_be_visible()
        page.get_by_role("button", name="复制链接", exact=True).click()
        expect(page.locator("#copy-status")).to_have_text("已复制")
        assert page.evaluate("navigator.clipboard.readText()") == url
        page.get_by_role("button", name="关闭并清除").click()
        expect(page.locator("#one-time-url")).to_have_value("")
        assert token not in page.evaluate("JSON.stringify({...localStorage}) + JSON.stringify({...sessionStorage})")
        page.on("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="轮换", exact=True).click()
        expect(page.locator("#link-dialog")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator("#one-time-url")).to_have_value("")
        page.get_by_role("button", name="撤销", exact=True).click()
        expect(page.locator("#records")).to_contain_text("已撤销")
        state["admin"] = True
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.locator("#admin-panel")).to_be_visible()
        page.locator('#policy-form input[name="key"]').fill("alice")
        page.get_by_role("button", name="撤销此范围", exact=True).click()
        expect(page.locator("#status")).to_have_text("范围已撤销")
        page.screenshot(path=str(artifacts / "desktop.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        page.screenshot(path=str(artifacts / "mobile.png"), full_page=True)
        assert not errors, errors
        assert state["issued"]
        issue_requests = [
            json.loads(body) for path, method, body in requests if method == "POST" and path.endswith("/grants")
        ]
        assert any(item["rotate"] for item in issue_requests)
        assert len({item["idempotency_key"] for item in issue_requests}) == len(issue_requests)
        context.close()
        browser.close()
    print("Browser checks passed: issue/copy/clear/rotate/revoke/admin/mobile/XSS")


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5178")
