"""Run against built static files served at http://127.0.0.1:8766."""

import json
import os

from playwright.sync_api import expect, sync_playwright


def main():
    configuration = {
        "connections": [{"id": "cloud", "name": "Cloudwise", "protocol": "openai", "enabled": True}],
        "models": [{
            "id": "video", "connection_id": "cloud", "kind": "video", "upstream_model": "seedance",
            "protocol": "openai", "enabled": True, "settings": {"output_per_million": 99},
        }],
        "resources": [], "version": 1,
    }
    saved = []

    def configuration_route(route):
        if route.request.method == "PUT":
            configuration.update(route.request.post_data_json)
            saved.append(route.request.post_data_json)
            route.fulfill(json={"ok": True})
        else:
            route.fulfill(json=configuration)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"))
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("**/api/ai/configuration", configuration_route)
        page.route("**/api/canvas/parameter-schema/definitions", lambda route: route.fulfill(json={"schemas": {}}))
        page.goto("http://127.0.0.1:8766/static/ai-connections.html")
        page.wait_for_load_state("networkidle")
        page.get_by_role("tab", name="Models").click()
        inputs = page.locator("[data-video-resolution]")
        expect(inputs).to_have_count(8)
        expect(page.locator('[data-setting="output_per_million"]')).to_have_count(0)
        for index in range(8):
            inputs.nth(index).fill(str(index))
        with page.expect_response(lambda response: response.url.endswith('/api/ai/configuration') and response.request.method == 'GET'):
            page.get_by_role("button", name="保存配置").click()
        expect(page.locator('#status')).to_contain_text('已加载')
        expect(inputs.nth(7)).to_have_value("7")
        assert saved[-1]["models"][0]["settings"]["video_token_prices"] == {
            "480p": {"without_video": 0, "with_video": 1},
            "720p": {"without_video": 2, "with_video": 3},
            "1080p": {"without_video": 4, "with_video": 5},
            "4k": {"without_video": 6, "with_video": 7},
        }
        inputs.nth(0).fill("")
        inputs.nth(1).fill("-1")
        page.get_by_role("button", name="保存配置").click()
        expect(page.locator('#status')).to_contain_text('请填写有效')
        assert len(saved) == 1  # Invalid inputs cannot silently overwrite a price.
        inputs.nth(1).fill("1")
        with page.expect_response(lambda response: response.url.endswith('/api/ai/configuration') and response.request.method == 'GET'):
            page.get_by_role("button", name="保存配置").click()
        expect(page.locator('#status')).to_contain_text('已加载')
        expect(inputs.nth(0)).to_have_value("")
        assert "without_video" not in saved[-1]["models"][0]["settings"]["video_token_prices"]["480p"]
        page.locator('[data-field="kind"]').select_option("chat")
        expect(page.locator('[data-setting="output_per_million"]')).to_have_value("99")
        expect(inputs).to_have_count(0)
        page.locator('[data-field="kind"]').select_option("video")
        expect(inputs).to_have_count(8)
        expect(inputs.nth(7)).to_have_value("7")
        page.locator('.video-token-prices').screenshot(path="/tmp/mediaforge-video-pricing.png")
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.locator('.video-token-prices table').evaluate(
            '(el) => el.getBoundingClientRect().right <= window.innerWidth'
        )
        assert not errors, errors
        browser.close()
    print(json.dumps({"price_fields": 8, "save_reload": "passed", "type_switch": "passed", "mobile": "passed"}))


if __name__ == "__main__":
    main()
