"""Exercise the real duration renderer and event handlers against a static server."""

import os

from playwright.sync_api import expect, sync_playwright

HTML = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/frontend/src/styles/theme.css">
<link rel="stylesheet" href="/frontend/src/styles/canvas.css">
<style>:root{--panel:#282828;--soft:#303030;--line:#444;--card:#494949;--text:#eee;--muted:#999;--faint:#999;--strong:#fff}body{background:#222;color:#eee;font-family:Arial}#dynamicParams{position:absolute;top:500px;left:60px}</style>
</head><body><div id="dynamicParams"></div>
<script>
var settings=JSON.parse(localStorage.getItem('duration-settings') || '{"engine":"api","videoDuration":5}');
var dynamicParams=document.getElementById('dynamicParams'), composerHeadParams=null, composerCountControl=null;
var tr=key=>({'smart.videoDuration':'生成时长','smart.videoAspect':'比例','smart.videoResolution':'分辨率'}[key] || key);
var escapeHtml=value=>String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
var escapeAttr=escapeHtml;
var persistActiveSmartSettings=()=>localStorage.setItem('duration-settings',JSON.stringify(settings));
var rememberRecentSmartSettings=()=>{}, scheduleSave=()=>{}, activeSettingsSubject=()=>({genKind:'video'});
</script><script src="/frontend/src/canvas/generation-settings.js"></script>
<script>bindWorkflowCoverFlyouts=()=>{};dynamicParams.innerHTML=renderVideoGenerationConfig();bindDynamicParams();</script>
</body></html>'''


def center_error(row):
    return row.evaluate('''row => {
        const selected=row.querySelector('.active').getBoundingClientRect(), rect=row.getBoundingClientRect();
        return Math.abs(selected.left+selected.width/2-rect.left-row.clientWidth/2);
    }''')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
        page = browser.new_page(viewport={'width':800, 'height':700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/duration-test', lambda route: route.fulfill(body=HTML, content_type='text/html'))
        page.goto('http://127.0.0.1:8766/duration-test')
        page.wait_for_load_state('networkidle')
        page.locator('.video-generation-summary').click()
        row = page.locator('.duration-grid')
        expect(row).to_be_visible()
        expect(row.locator('button')).to_have_count(12)
        expect(page.locator('input[data-param="videoDuration"]')).to_have_count(0)
        assert row.locator('button').all_text_contents() == [f'{value}s' for value in range(4,16)]
        assert row.evaluate('(el)=>el.scrollWidth>el.clientWidth')
        assert row.evaluate('(el)=>getComputedStyle(el).scrollbarWidth') == 'none'
        assert row.evaluate("(el)=>getComputedStyle(el, '::-webkit-scrollbar').display") == 'none'
        page.locator('[data-smart-value="8"][data-smart-param="videoDuration"]').click()
        page.wait_for_function('''() => {
            const row=document.querySelector('.duration-grid'), active=row.querySelector('.active').getBoundingClientRect(), rect=row.getBoundingClientRect();
            return Math.abs(active.left+active.width/2-rect.left-row.clientWidth/2)<3;
        }''')
        assert center_error(row) < 3
        # Step toward the right edge by selecting visible options.
        for value in [10, 12, 14, 15]:
            page.locator(f'[data-smart-value="{value}"][data-smart-param="videoDuration"]').click()
        page.wait_for_function('''() => {const row=document.querySelector('.duration-grid');return Math.abs(row.scrollLeft-(row.scrollWidth-row.clientWidth))<2;}''')
        assert page.evaluate('settings.videoDuration') == 15
        assert page.locator('.video-config-summary').inner_text().endswith('15s')
        page.reload()
        page.wait_for_load_state('networkidle')
        page.locator('.video-generation-summary').click()
        expect(row.locator('.active')).to_have_text('15s')
        page.wait_for_function('''() => {const row=document.querySelector('.duration-grid');return Math.abs(row.scrollLeft-(row.scrollWidth-row.clientWidth))<2;}''')
        page.emulate_media(reduced_motion='reduce')
        for value in [12, 9, 6, 4]:
            page.locator(f'[data-smart-value="{value}"][data-smart-param="videoDuration"]').click()
        assert row.evaluate('(el)=>el.scrollLeft') == 0
        expect(row.locator('.active')).to_have_text('4s')
        entry = page.locator('[data-video-duration-input]')
        expect(entry).to_have_value('4')
        entry.fill('11')
        expect(row.locator('.active')).to_have_text('11s')
        assert page.evaluate('settings.videoDuration') == 11
        assert center_error(row) < 3
        for invalid in ['16', '3', '7.5', '']:
            entry.fill(invalid)
            assert page.evaluate('settings.videoDuration') == 11
            entry.press('Enter')
            expect(entry).to_have_value('11')
        entry.fill('12')
        page.reload()
        page.wait_for_load_state('networkidle')
        page.locator('.video-generation-summary').click()
        expect(entry).to_have_value('12')
        expect(row.locator('.active')).to_have_text('12s')
        page.locator('[data-smart-value="10"][data-smart-param="videoDuration"]').click()
        expect(entry).to_have_value('10')
        entry.fill('1')
        entry.press('Tab')
        expect(entry).to_have_value('10')
        page.locator('.video-config-popover').screenshot(path='/tmp/mediaforge-video-duration.png')
        assert not errors, errors
        browser.close()
    print('Duration range, centering, boundaries, reload and reduced motion: passed')


if __name__ == '__main__':
    main()
