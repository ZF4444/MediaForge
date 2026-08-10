const workflowSettingsFrame = document.getElementById('workflowSettingsFrame');
const workflowSettingsPages = {
    comfyui: '/static/comfyui-settings.html?embedded=1',
    runninghub: '/static/api-settings.html?mode=runninghub-apps&embedded=1',
};

function showWorkflowSettingsPage(page){
    const next = workflowSettingsPages[page] ? page : 'comfyui';
    document.querySelectorAll('[data-workflow-page]').forEach(button => {
        button.classList.toggle('active', button.dataset.workflowPage === next);
    });
    if(workflowSettingsFrame && workflowSettingsFrame.dataset.page !== next){
        workflowSettingsFrame.dataset.page = next;
        workflowSettingsFrame.src = workflowSettingsPages[next];
    }
    localStorage.setItem('workflow_settings_subpage', next);
}

document.querySelectorAll('[data-workflow-page]').forEach(button => {
    button.addEventListener('click', () => showWorkflowSettingsPage(button.dataset.workflowPage));
});

if(window.StudioTheme) window.StudioTheme.apply();
showWorkflowSettingsPage(localStorage.getItem('workflow_settings_subpage') || 'comfyui');
