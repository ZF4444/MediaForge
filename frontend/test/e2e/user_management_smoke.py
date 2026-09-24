"""Browser smoke test for user-management service wiring and core actions."""

import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get(
    "MEDIAFORGE_E2E_URL", "http://127.0.0.1:5177/static/user-management.html"
)


def main():
    users = [{"user_id": "user-7", "username": "Alice", "org_id": None}]
    organizations = [{"id": "org-1", "name": "Research", "member_count": 1}]
    page_errors = []
    console_errors = []
    responses = []
    requests = []
    saved_payloads = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("request", lambda request: requests.append(f"{request.method} {request.url}"))
        page.on("response", lambda response: responses.append(f"{response.status} {response.url}"))

        def mock_api(route):
            request = route.request
            path = urlparse(request.url).path
            if request.method == "GET" and path == "/api/organizations":
                route.fulfill(json={"organizations": organizations})
            elif request.method == "GET" and path == "/api/access-control/users":
                route.fulfill(json={
                    "users": users,
                    "types": {"new-user": {"name": "新用户"}, "member": {"name": "成员"}},
                    "user_types": {"user-7": "new-user"},
                })
            elif request.method == "PUT" and path == "/api/access-control/users/user-7/type":
                saved_payloads.append((path, request.post_data_json))
                route.fulfill(json={"user_type": request.post_data_json["type_id"]})
            elif request.method == "POST" and path == "/api/organizations":
                saved_payloads.append((path, request.post_data_json))
                organizations.append({"id": "org-2", "name": request.post_data_json["name"], "member_count": 0})
                route.fulfill(json={"organization": organizations[-1]})
            elif request.method == "GET" and path == "/api/usage/runninghub":
                route.fulfill(json={"organizations": [], "user_budgets": [], "records": []})
            elif request.method == "GET" and path == "/api/usage/omnilojo":
                route.fulfill(json={"records": []})
            elif request.method == "GET" and path == "/api/settings/new-user-budget":
                route.fulfill(json={"monthly_budget_usd": 7, "enabled": True})
            elif request.method == "PUT" and path == "/api/settings/new-user-budget":
                saved_payloads.append((path, request.post_data_json))
                route.fulfill(json={"ok": True})
            else:
                route.fulfill(status=404, json={"detail": f"unexpected request: {request.method} {path}"})

        page.route("**/api/**", mock_api)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        try:
            page.locator('[data-user-type="user-7"]').wait_for(timeout=10000)
        except Exception as error:
            raise AssertionError(
                f"user list did not render; body={page.locator('body').inner_text()}; "
                f"page_errors={page_errors}; console_errors={console_errors}; "
                f"requests={requests}; responses={responses}"
            ) from error
        page.locator('[data-user-type="user-7"]').select_option("member")
        page.get_by_text("用户类型已更新", exact=True).wait_for()

        page.locator("#orgNameInput").fill("Design")
        page.locator('#orgForm button[type="submit"]').click()
        page.get_by_text("已创建", exact=True).wait_for()
        page.locator("#orgList").get_by_text("Design", exact=True).wait_for()

        page.locator('[data-tab="budgets"]').click()
        page.wait_for_function("document.querySelector('#newUserBudgetInput').value === '7'")
        page.locator("#newUserBudgetInput").fill("9")
        page.locator("#newUserBudgetSave").click()
        page.get_by_text("新用户默认预算已保存", exact=True).wait_for()

        assert saved_payloads == [
            ("/api/access-control/users/user-7/type", {"type_id": "member"}),
            ("/api/organizations", {"name": "Design"}),
            ("/api/settings/new-user-budget", {"monthly_budget_usd": 9, "enabled": True}),
        ]
        if page_errors:
            raise AssertionError("uncaught browser errors: " + "; ".join(page_errors))
        browser.close()


if __name__ == "__main__":
    main()
