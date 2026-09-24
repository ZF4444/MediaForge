"""Browser smoke test for workflow settings loading and enable-state updates."""

import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get(
    "MEDIAFORGE_E2E_URL", "http://127.0.0.1:5177/static/workflow-settings.html"
)


def main():
    workflow = {"name": "folder/demo flow.json", "title": "Workflow Smoke", "enabled": True}
    configuration = {"resources": [
        {
            "id": "rh-resource",
            "kind": "runninghub_app",
            "name": "RH Smoke",
            "enabled": True,
            "settings": {"app_id": "rh-smoke", "title": "RH Smoke"},
        },
        {
            "id": "cloud-workflow",
            "kind": "comfyui_workflow",
            "name": "Cloud Smoke",
            "enabled": True,
            "settings": {"title": "Cloud Smoke"},
        },
    ]}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors = []
        console_errors = []
        responses = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("response", lambda response: responses.append(f"{response.status} {response.url}"))

        def mock_api(route):
            request = route.request
            path = urlparse(request.url).path
            if request.method == "GET" and path == "/api/workflows":
                route.fulfill(json={"workflows": [workflow.copy()]})
            elif request.method == "GET" and path == "/api/ai/configuration":
                route.fulfill(json=configuration)
            elif request.method == "GET" and path.startswith("/api/workflows/"):
                route.fulfill(json={"workflow": {}, "config": {"title": workflow["title"], "fields": [], "enabled": workflow["enabled"]}})
            elif request.method == "PUT" and path.endswith("/config"):
                workflow.update(request.post_data_json)
                route.fulfill(json={"config": request.post_data_json})
            elif request.method == "PUT" and path == "/api/ai/configuration":
                configuration.clear()
                configuration.update(request.post_data_json)
                route.fulfill(json=configuration)
            else:
                route.fulfill(status=404, json={"detail": f"unexpected request: {request.method} {path}"})

        page.route("**/api/**", mock_api)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        try:
            page.locator(".workflow-row").first.wait_for(timeout=10000)
        except Exception as error:
            raise AssertionError(
                f"workflow list did not render; title={page.title()}; "
                f"body={page.locator('body').inner_text()}; page_errors={page_errors}; "
                f"console_errors={console_errors}; responses={responses}"
            ) from error
        page.get_by_text("Workflow Smoke", exact=True).wait_for()
        page.get_by_text("RH Smoke", exact=True).wait_for()
        page.get_by_text("Cloud Smoke", exact=True).wait_for()
        assert page.locator(".workflow-switch").count() == 3

        first_toggle = page.locator(".workflow-switch").first
        assert first_toggle.get_attribute("aria-checked") == "true"
        first_toggle.click()
        page.wait_for_function(
            "() => document.querySelector('.workflow-switch')?.getAttribute('aria-checked') === 'false'"
        )
        assert workflow["enabled"] is False
        cloud_toggle = page.locator(
            '.workflow-row[data-source="comfyui_resource"] .workflow-switch'
        )
        assert cloud_toggle.get_attribute("aria-checked") == "true"
        cloud_toggle.click()
        page.wait_for_function(
            "() => document.querySelector('.workflow-row[data-source=\"comfyui_resource\"] .workflow-switch')?.getAttribute('aria-checked') === 'false'"
        )
        assert configuration["resources"][1]["enabled"] is False
        if page_errors:
            raise AssertionError("uncaught browser errors: " + "; ".join(page_errors))
        if console_errors:
            raise AssertionError("browser console errors: " + "; ".join(console_errors))
        browser.close()


if __name__ == "__main__":
    main()
