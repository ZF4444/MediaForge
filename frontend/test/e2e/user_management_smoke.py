"""User directory interactions with mocked APIs, including rollback and partial failures."""
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('MEDIAFORGE_E2E_URL', 'http://127.0.0.1:5183/static/user-management.html')

def main():
    users = [{'user_id': 'alice', 'username': 'Alice', 'org_id': 'design'}, {'user_id': 'bob', 'username': 'Bob', 'org_id': None}, {'user_id': 'carol', 'username': 'Carol', 'org_id': 'design'}]
    orgs = [{'id': 'design', 'name': '设计团队'}]
    types = {'new-user': {'name': '默认用户'}, 'creator': {'name': '创作用户'}, 'sys-admin': {'name': '系统管理员'}}
    assignments = {'alice': 'creator'}
    failures = set()
    requests = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({'executable_path': os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']} if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.add_init_script("localStorage.setItem('studio_theme', 'light')")
        page.on('pageerror', lambda e: errors.append(str(e)))
        def api(route):
            request = route.request
            path = urlparse(request.url).path
            method = request.method
            if method != 'GET': requests.append((path, request.post_data_json if method != 'DELETE' else None))
            if method == 'GET' and path == '/api/access-control/users':
                route.fulfill(json={'users': users, 'types': types, 'user_types': assignments})
            elif method == 'GET' and path == '/api/organizations': route.fulfill(json={'organizations': orgs})
            elif method == 'PUT' and path.endswith('/type'):
                uid = path.split('/')[-2]
                if uid in failures: route.fulfill(status=500, json={'detail': '模拟保存失败'})
                else:
                    assignments[uid] = request.post_data_json['type_id']
                    route.fulfill(json={'user_type': assignments[uid]})
            elif method == 'PUT' and path.endswith('/org'):
                uid = path.split('/')[-2]
                next(u for u in users if u['user_id'] == uid)['org_id'] = request.post_data_json['org_id']
                route.fulfill(json={'ok': True})
            elif method == 'POST' and path == '/api/organizations':
                org = {'id': 'new-org', 'name': request.post_data_json['name']}; orgs.append(org)
                route.fulfill(json={'organization': org})
            elif method == 'PUT' and path.startswith('/api/organizations/'):
                next(o for o in orgs if o['id'] == path.split('/')[-1])['name'] = request.post_data_json['name']; route.fulfill(json={'ok': True})
            elif method == 'DELETE' and path.startswith('/api/organizations/'):
                oid = path.split('/')[-1]; orgs[:] = [o for o in orgs if o['id'] != oid]
                for u in users:
                    if u['org_id'] == oid: u['org_id'] = None
                route.fulfill(json={'ok': True})
            elif method == 'DELETE' and path.startswith('/api/access-control/users/'):
                users[:] = [u for u in users if u['user_id'] != path.split('/')[-1]]; route.fulfill(json={'ok': True})
            elif path == '/api/settings/new-user-budget':
                route.fulfill(json={'monthly_budget_usd': 7, 'enabled': True} if method == 'GET' else {'ok': True})
            elif path.startswith('/api/usage/'):
                route.fulfill(json={'organizations': [], 'user_budgets': [], 'records': []})
            else: route.fulfill(status=404, json={'detail': f'unexpected request: {method} {path}'})
        page.route('**/api/**', api)
        page.goto(BASE_URL); page.wait_for_load_state('networkidle')
        expect(page.locator('#directoryRows tr')).to_have_count(3)
        page.screenshot(path='/tmp/mediaforge-users-desktop.png', full_page=True)
        page.locator('#directorySearch').fill('bob')
        expect(page.locator('#directoryRows [data-user-type]')).to_have_count(1)
        page.locator('#directorySearch').fill('')
        page.locator('#directoryTypeFilter').select_option('creator')
        expect(page.locator('#directoryRows [data-user-type]')).to_have_count(1)
        page.locator('#directoryTypeFilter').select_option('')
        page.locator('#directoryOrgs button').filter(has_text='设计团队').click()
        expect(page.locator('#directoryRows [data-user-type]')).to_have_count(2)
        page.locator('#directoryOrgs button').filter(has_text='全部用户').click()
        failures.add('bob')
        page.locator('[data-user-type="bob"]').select_option('creator')
        expect(page.locator('#directoryStatus')).to_contain_text('已恢复原设置')
        expect(page.locator('[data-user-type="bob"]')).to_have_value('new-user')
        failures.clear()
        page.locator('[data-user-type="bob"]').select_option('creator')
        expect(page.locator('#directoryStatus')).to_contain_text('Bob 的用户类型已更新')
        page.locator('[data-user-org="bob"]').select_option('design')
        expect(page.locator('#directoryStatus')).to_contain_text('Bob 的组织归属已更新')
        page.locator('#selectVisibleUsers').check()
        page.locator('#directoryBulkType').select_option('new-user')
        failures.add('carol')
        page.locator('#applyBulkType').click()
        expect(page.locator('#directoryStatus')).to_contain_text('1 位失败')
        expect(page.locator('#directorySelection')).to_have_text('已选择 1 位用户')
        failures.clear(); page.locator('#applyBulkType').click()
        expect(page.locator('#directoryBulk')).to_be_hidden()
        page.locator('#manageOrgs').click(); page.locator('#directoryOrgName').fill('研究团队')
        page.locator('#createDirectoryOrg').click()
        expect(page.locator('#directoryOrgStatus')).to_have_text('组织已创建')
        page.get_by_role('button', name='重命名组织 研究团队', exact=True).click()
        page.locator('#directoryRenameInput').fill('研发团队'); page.locator('#confirmDirectoryAction').click()
        expect(page.locator('#directoryActionDialog')).not_to_be_visible()
        page.get_by_role('button', name='删除组织 研发团队', exact=True).click()
        page.locator('#confirmDirectoryAction').click()
        expect(page.locator('#directoryActionDialog')).not_to_be_visible()
        expect(page.locator('#directoryOrgList')).not_to_contain_text('研发团队')
        page.locator('#closeOrganizations').click()
        page.get_by_role('button', name='删除用户 Carol', exact=True).click()
        page.locator('#cancelDirectoryAction').click()
        expect(page.locator('#directoryRows [data-user-type]')).to_have_count(3)
        page.get_by_role('button', name='删除用户 Carol', exact=True).click(); page.locator('#confirmDirectoryAction').click()
        expect(page.locator('#directoryRows [data-user-type]')).to_have_count(2)
        page.locator('[data-tab="budgets"]').click()
        expect(page.locator('#newUserBudgetInput')).to_have_value('7')
        page.locator('#newUserBudgetInput').fill('9'); page.locator('#newUserBudgetSave').click()
        expect(page.locator('#budgetStatus')).to_have_text('新用户默认预算已保存')
        page.locator('[data-tab="users"]').click()
        expect(page.locator('#directoryStatus')).to_have_text('列表已更新')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        expect(page.locator('[data-user-org="bob"]')).to_be_visible()
        page.screenshot(path='/tmp/mediaforge-users-mobile.png', full_page=True)
        page.evaluate("postMessage({type:'studio-theme',theme:'dark'}, '*')")
        page.set_viewport_size({'width': 1440, 'height': 1000}); page.wait_for_timeout(200)
        page.screenshot(path='/tmp/mediaforge-users-dark.png', full_page=True)
        assert not errors, errors
        assert ('/api/settings/new-user-budget', {'monthly_budget_usd': 9, 'enabled': True}) in requests
        browser.close()
    print('PASS: search, filters, type/organization assignment, failure rollback, partial bulk retry, organization create/rename/delete, delete confirmation, budgets, mobile, dark mode')

if __name__ == '__main__': main()
