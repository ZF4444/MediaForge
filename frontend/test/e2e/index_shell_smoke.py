"""Browser smoke test for the Vite-served workbench shell.

Run against the development server with:
    python frontend/test/e2e/index_shell_smoke.py
"""

import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get(
    "MEDIAFORGE_E2E_URL", "http://127.0.0.1:5173/static/index.html"
)
PAGE_IDS = [
    "angle",
    "gaussian",
    "pose-studio",
    "gpt-chat",
    "canvas",
    "asset-manager",
    "storage-manager",
    "my-account",
    "api-settings",
    "comfyui-settings",
    "user-management",
    "user-data-migration",
    "feedback-admin",
    "broadcast-admin",
]


def mock_api(route):
    path = urlparse(route.request.url).path
    if path == "/api/access-control/me":
        route.fulfill(json={"pages": PAGE_IDS})
    elif path == "/api/announcement/latest":
        route.fulfill(json={"announcement": None})
    elif path == "/api/version":
        route.fulfill(body="1.0.0", content_type="text/plain")
    elif path == "/api/help":
        route.fulfill(json={"content": "# Browser smoke test"})
    else:
        route.fulfill(json={})


def mock_iframe_pages(route):
    path = urlparse(route.request.url).path
    if path == "/static/index.html":
        route.continue_()
        return
    route.fulfill(
        status=200,
        content_type="text/html",
        body="<!doctype html><html><body>mock iframe page</body></html>",
    )


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors = []
        console_errors = []
        failed_requests = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed_requests.append(f"{request.url}: {request.failure}"))
        page.route("**/api/**", mock_api)
        page.route("**/static/*.html", mock_iframe_pages)

        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        try:
            page.wait_for_function(
                "!document.documentElement.classList.contains('studio-route-booting')",
                timeout=10000,
            )
        except Exception as error:
            raise AssertionError(
                f"workbench did not initialize; url={page.url}; "
                f"booting={page.locator('html').get_attribute('class')}; "
                f"page_errors={page_errors}; console_errors={console_errors}; "
                f"failed_requests={failed_requests}"
            ) from error
        assert page.locator("#frame-canvas").evaluate(
            "frame => frame.classList.contains('active')"
        )

        page.locator('[data-page-id="gpt-chat"]').click()
        page.wait_for_function(
            "document.querySelector('#frame-gpt-chat').classList.contains('active')"
        )
        assert page.evaluate("localStorage.getItem('studio_active_page')") == "gpt-chat"

        initial_theme = page.locator("html").evaluate(
            "element => element.classList.contains('studio-theme-dark')"
        )
        page.locator('[data-studio-action="toggle-theme"]').click()
        page.wait_for_function(
            "document.documentElement.classList.contains('studio-theme-dark') !== "
            + str(initial_theme).lower()
        )

        page.locator("#helpOpenBtn").click()
        assert page.locator("#helpDrawer").get_attribute("aria-hidden") == "false"
        page.locator("#helpCloseBtn").click()
        assert page.locator("#helpDrawer").get_attribute("aria-hidden") == "true"

        if page_errors:
            raise AssertionError("uncaught browser errors: " + "; ".join(page_errors))

        browser.close()


if __name__ == "__main__":
    main()
