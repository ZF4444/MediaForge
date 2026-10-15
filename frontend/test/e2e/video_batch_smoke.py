"""Count=2: real submission, polling, finalization and video candidate renderers.

Uses mocked API responses; does not submit billable provider requests.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[3]


def functions(path, names):
    source = (ROOT / path).read_text()
    starts = list(re.finditer(r'^(?:async )?function (\w+)\(', source, re.M))
    return '\n'.join(source[m.start():starts[i + 1].start() if i + 1 < len(starts) else len(source)]
                     for i, m in enumerate(starts) if m[1] in names)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'))
        page = browser.new_page()
        page.set_content('<div id="main"></div><div id="controls"></div><div id="grid"></div>')
        page.wait_for_load_state('networkidle')
        page.add_script_tag(content='''
var settings={engine:'api',apiKind:'video',count:2,videoConnectionId:'conn',videoModelId:'model',videoAspect:'16:9'};
var node={id:'video-node',type:'smart-image',genKind:'video',images:[]};
var expandedCandidateNodeIds=new Set(['video-node']), candidatePanelNodeId='',candidatePanelAttentionNodeId='',candidatePanelIndex=0;
var activeSmartTaskPolls=new Map(), calls=[], messages=[], saved=[];
var smartLoopContext=null,undoSuppressed=false,runBtn={disabled:false},activeSettingsSubject=()=>node;
var tr=k=>k, nowMs=()=>Date.now(),cloneSmartSettings=s=>({...s}),settingsForStorage=s=>({...s});
var selectedNode=()=>node,smartSettingsForNode=()=>({...settings}),isApiLikeEngine=e=>e==='api';
var buildPromptRequest=()=>({prompt:'test video',refs:[]}),smartPromptInputEnabledForSettings=()=>true;
var applySourceRatioToSettings=()=>{},snapshotRunMeta=()=>({}),smartRunSnapshot=()=>({}),rememberRecentSmartSettings=()=>{};
var pushUndo=()=>{},attachRunMeta=()=>{},pendingBoxSize=()=>({w:320,h:180}),isGeneratedResultNode=()=>true;
var smartImageUsesWorkflowInput=()=>false,clearPromptInput=()=>{},addSmartGenerationLog=()=>{};
var scheduleSave=()=>{},saveCanvas=async()=>saved.push(JSON.parse(JSON.stringify(node)));
var isSmartImageNode=n=>n.type==='smart-image',isHistoryGroupNode=()=>false,mediaNodeDefaultScale=()=>1;
var cascadeOutputTitle=()=> 'Video', checkQuotaWarningFromResult=()=>{},toast=m=>messages.push(m), handleTaskLimitSignal=()=>false;
var budgetDataFromPayload=()=>null,isRunningHubPendingTask=()=>false,isComfyPendingTask=()=>false;
var stripImageGenerationMeta=x=>x,canonicalRunSettings=s=>({...s,n:s.count});
var escapeHtml=s=>String(s),escapeAttr=escapeHtml;
function render(){
 document.getElementById('main').innerHTML=node.images.length?singleMediaHtml(node.images[0],320,180):'';
 document.getElementById('controls').innerHTML=candidateControlHtml(node);
 document.getElementById('grid').innerHTML=expandedCandidateGridHtml(node);
}
var canvasApiJson=async(url,options)=>{
 calls.push({url,payload:JSON.parse(options.body)});
 return {child_task_ids:['child-a','child-b'],task_id:'parent',status:'queued'};
};
var polls={};
globalThis.__MediaForgeRuntimeServices={apiJson:async (url,options)=>{
 if(options?.method==='POST'){
 calls.push({url,payload:JSON.parse(options.body)});
 return {child_task_ids:['child-a','child-b'],task_id:'parent',status:'queued'};
 }

 const id=url.split('/').pop();polls[id]=(polls[id]||0)+1;
 // Stagger completion; exercise a queued response as well as successes.
 if(id==='child-b' && polls[id]===1)return {status:'queued'};
 return {status:'succeeded',result:{videos:['/api/files/'+id+'/content'],video_items:[{url:'/api/files/'+id+'/content',file_id:id,kind:'video',natural_w:1280,natural_h:720}]}};
}};
''')
        for name in ['media-display.js', 'candidate-pool.js', 'cascade-run.js']:
            page.add_script_tag(path=str(ROOT / 'frontend/src/canvas' / name))
        page.add_script_tag(content=functions('frontend/src/canvas/main.js', {
            'smartPendingTasks', 'pollCanvasTask', 'pollSmartPendingTask',
            'finalizeSmartPendingTask', 'resumeSmartPendingNode'}))
        page.evaluate('runGeneration()')
        assert page.evaluate('messages') == [], page.evaluate('messages')
        assert page.evaluate('calls[0].payload.run_settings.count') == 2
        assert page.evaluate('node.candidateImages.length') == 2
        assert page.evaluate('node.images.length') == 1
        assert page.evaluate('node.outputKind') == 'video'
        assert page.evaluate('node.pending || 0') == 0
        assert not page.evaluate('Boolean(node.pendingTasks || node.running)')
        assert page.evaluate('messages') == []
        expect(page.locator('.candidate-count')).to_have_text('2')
        expect(page.locator('.candidate-grid-item')).to_have_count(2)
        expect(page.locator('.candidate-grid-item .video-thumb')).to_have_count(2)
        assert page.locator('#main [data-video-src]').get_attribute('data-video-src') == page.evaluate('filePreviewUrl(node.images[0])')
        # Switch both candidates and confirm the real renderer updates the main video.
        for index in [0, 1]:
            page.evaluate('(i)=>{setNodeMainCandidate(node,i);render()}', index)
            expected = page.evaluate('node.candidateImages[node.candidateIndex].url')
            assert page.locator('#main [data-original-src]').get_attribute('data-original-src') == expected
            expect(page.locator('.candidate-grid-item.is-main')).to_have_attribute('data-candidate-grid-item', str(index))
        # Persist/reload node state, then render both candidates again.
        page.evaluate('node=JSON.parse(JSON.stringify(node));render()')
        expect(page.locator('.candidate-count')).to_have_text('2')
        expect(page.locator('.candidate-grid-item .video-thumb')).to_have_count(2)
        print('PASS: Count=2 submission, staggered polling, two video candidates, switching, serialized state')
        browser.close()


if __name__ == '__main__':
    main()
