import os
from playwright.sync_api import sync_playwright, expect

config = {'all_pages': [{'id': 'canvas', 'label': '无限画布'}, {'id': 'gpt-chat', 'label': 'GPT 对话'}, {'id': 'api-settings', 'label': 'API 设置'}], 'all_models': [{'id': 'm1', 'label': 'GPT Image · OpenAI', 'upstream_model': 'gpt-image-1', 'connection_id': 'openai'}, {'id': 'm2', 'label': '视频模型 · 视频连接', 'upstream_model': 'video-v2', 'connection_id': 'video'}], 'types': {'new-user': {'name': '默认用户', 'pages': ['canvas'], 'models': []}, 'sys-admin': {'name': '系统管理员', 'pages': ['canvas', 'gpt-chat', 'api-settings'], 'models': None}, 'designer': {'name': '设计团队', 'pages': ['canvas', 'gpt-chat'], 'models': ['m1']}}, 'users': [{'user_id': 'alice', 'username': 'Alice'}, {'user_id': 'bob', 'username': 'Bob'}], 'user_types': {'alice': 'designer'}}
saves = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({'executable_path': os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']} if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') else {}))
    page = browser.new_page(viewport={'width': 1440, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script("localStorage.setItem('studio_theme', 'light')")
    def api(route):
        if route.request.method == 'PUT':
            data = route.request.post_data_json
            saves.append(data)
            route.fulfill(json={'ok': True, **data})
        elif route.request.url.endswith('/models'):
            route.fulfill(json={'all_models': config['all_models']})
        else:
            route.fulfill(json=config)
    page.route('**/api/access-control/**', api)
    page.goto(os.environ.get('ACCESS_CONTROL_TEST_URL', 'http://127.0.0.1:5183/static/access-control.html'))
    page.wait_for_load_state('networkidle')
    expect(page.locator('#typeTitle')).to_have_text('默认用户')
    expect(page.locator('#saveButton')).to_be_disabled()
    page.get_by_role('button', name='设计团队').click()
    expect(page.locator('#modelCount')).to_have_text('1 / 2')
    page.screenshot(path='/tmp/mediaforge-access-desktop.png', full_page=True)
    page.locator('#modelList input').nth(1).check()
    page.locator('#typeName').fill('创作团队')
    page.get_by_role('button', name='默认用户').click()
    page.get_by_role('button', name='创作团队').click()
    expect(page.locator('#typeName')).to_have_value('创作团队')
    page.locator('#saveButton').click()
    expect(page.locator('#saveButton')).to_be_disabled()
    assert saves[-1]['types']['designer']['models'] == ['m1', 'm2']
    assert 'user_types' not in saves[-1]
    assert page.get_by_role('button', name='用户分配').count() == 0
    page.locator('#deleteType').click()
    expect(page.locator('#typeTitle')).to_have_text('默认用户')
    page.locator('#resetButton').click()
    page.get_by_role('button', name='创作团队').click()
    # Reproduce plain HTTP deployment, where randomUUID is not exposed.
    page.evaluate("Object.defineProperty(crypto, 'randomUUID', {value: undefined, configurable: true})")
    page.locator('#addType').click()
    page.locator('#newTypeName').fill('试用用户')
    page.get_by_role('button', name='创建类型', exact=True).click()
    expect(page.locator('#typeTitle')).to_have_text('试用用户')
    expect(page.locator('#pageCount')).to_have_text('1 / 3')
    expect(page.locator('#typeDialog')).not_to_be_visible()
    page.locator('#saveButton').click()
    expect(page.locator('#saveButton')).to_be_disabled()
    created = [item for item in saves[-1]['types'].values() if item['name'] == '试用用户']
    assert len(created) == 1 and created[0]['models'] == []
    assert created[0]['pages'] == ['canvas']
    # Editing the copy must not change the default type.
    page.locator('#pageList input').nth(1).check()
    page.get_by_role('button', name='默认用户').click()
    expect(page.locator('#pageCount')).to_have_text('1 / 3')
    page.get_by_role('button', name='试用用户').click()
    page.locator('#typeName').fill('待撤销名称')
    page.locator('#resetButton').click()
    page.get_by_role('button', name='系统管理员').click()
    expect(page.locator('#allModels')).to_be_disabled()
    page.get_by_role('button', name='默认用户').click()
    page.locator('#allModels').check()
    config['all_models'].append({'id': 'm3', 'label': '新模型 · 新连接', 'upstream_model': 'new', 'connection_id': 'new'})
    page.locator('#refreshModels').click()
    expect(page.locator('#modelList input')).to_have_count(3)
    expect(page.locator('#modelList input').nth(2)).to_be_checked()
    page.locator('#resetButton').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path='/tmp/mediaforge-access-mobile.png', full_page=True)
    page.evaluate("window.postMessage({type:'studio-theme', theme:'dark'}, '*')")
    expect(page.locator('html')).to_have_class('studio-theme-dark theme-dark')
    page.set_viewport_size({'width': 1440, 'height': 1080})
    page.wait_for_timeout(250)
    assert page.locator('.workspace').evaluate("el => getComputedStyle(el).backgroundColor") == 'rgb(37, 37, 39)'
    page.screenshot(path='/tmp/mediaforge-access-dark.png', full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: permissions editing, saving, reset, deletion, creation, admin, model sync, mobile and dark mode')
