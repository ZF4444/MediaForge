"""Browser smoke test for the feedback admin page module."""

import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get(
    "MEDIAFORGE_E2E_URL", "http://127.0.0.1:5177/static/feedback-admin.html"
)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors = []
        console_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.add_init_script("localStorage.setItem('studio_theme', 'light')")

        def mock_api(route):
            request = route.request
            path = urlparse(request.url).path
            if request.method == "GET" and path == "/api/feedback/admin":
                route.fulfill(json={"total": 1, "items": [{
                    "id": "feedback-1",
                    "username": "Casey",
                    "user_id": "user-1",
                    "content": "The export button is hard to find.",
                    "status": "open",
                    "type": "idea",
                    "page": "canvas",
                    "created_at": 1,
                    "updated_at": 2,
                    "admin_note": "",
                    "user_agent": "Playwright",
                }]})
            elif request.method == "PATCH" and path == "/api/feedback/admin/feedback-1":
                route.fulfill(json={"item": {
                    "id": "feedback-1",
                    "username": "Casey",
                    "user_id": "user-1",
                    "content": "The export button is hard to find.",
                    "status": "resolved",
                    "type": "idea",
                    "page": "canvas",
                    "created_at": 1,
                    "updated_at": 3,
                    "admin_note": "Fixed in the next release.",
                    "user_agent": "Playwright",
                }})
            else:
                route.fulfill(json={})

        page.route("**/api/feedback/admin**", mock_api)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        try:
            page.locator("#fbList").get_by_text("The export button is hard to find.").wait_for(timeout=10000)
        except Exception as error:
            status = page.locator("#fbStatus")
            status_text = status.inner_text() if status.count() else "<missing>"
            raise AssertionError(
                f"feedback list did not render; title={page.title()}; status={status_text}; "
                f"body={page.locator('body').inner_text()}; page_errors={page_errors}; "
                f"console_errors={console_errors}"
            ) from error
        assert page.locator("#fbStatus").inner_text() == "共 1 条。"

        page.locator('[data-status="resolved"]').click()
        page.get_by_text("已保存。", exact=True).wait_for()
        assert page.locator("#fbAdminNote").input_value() == "Fixed in the next release."

        if page_errors:
            raise AssertionError("uncaught browser errors: " + "; ".join(page_errors))
        browser.close()


if __name__ == "__main__":
    main()
