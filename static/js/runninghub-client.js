window.RunningHubClient = (function () {
    async function readJson(response) {
        return await response.json();
    }

    async function uploadFile(fileOrBlob, name) {
        const fd = new FormData();
        fd.append('file', fileOrBlob, name || 'upload.bin');
        const response = await fetch('/api/runninghub/upload-asset-file', {
            method: 'POST',
            body: fd
        });
        const data = await readJson(response);
        if (!response.ok || data.success === false) {
            throw new Error(data.detail || 'RunningHub 上传失败');
        }
        const fileName = (data.data || data).fileName;
        if (!fileName) {
            throw new Error('RunningHub 上传未返回 fileName');
        }
        return fileName;
    }

    async function submitTask(payload) {
        const response = await fetch('/api/runninghub/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await readJson(response);
        if (!response.ok || data.success === false) {
            throw new Error(data.detail || 'RunningHub 提交失败');
        }
        const taskId = (data.data || data).taskId;
        if (!taskId) {
            throw new Error('RunningHub 未返回 taskId');
        }
        return taskId;
    }

    async function queryTask(taskId, options) {
        const { persistOutputs = true } = options || {};
        const params = new URLSearchParams({ taskId: String(taskId || '') });
        if (!persistOutputs) params.set('persistOutputs', 'false');
        const response = await fetch(`/api/runninghub/query?${params.toString()}`);
        const data = await readJson(response);
        if (!response.ok || data.success === false) {
            throw new Error(data.detail || 'RunningHub 查询失败');
        }
        return data.data || data;
    }

    async function pollTask(taskId, options) {
        const { maxAttempts = 720, intervalMs = 2500, onUpdate = null, persistOutputs = true } = options || {};
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            const data = await queryTask(taskId, { persistOutputs });
            if (typeof onUpdate === 'function') {
                onUpdate(data, i);
            }
            if (data.status === 'SUCCESS') {
                return data;
            }
            if (data.status === 'FAILED') {
                throw new Error(data.failReason || 'RunningHub 任务失败');
            }
        }
        throw new Error('RunningHub 任务超时');
    }

    return {
        uploadFile,
        submitTask,
        queryTask,
        pollTask,
    };
})();
