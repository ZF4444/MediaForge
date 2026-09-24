const translations = {
    'nav.angle': '视角',
    'studio.cameraControl': '相机控制',
    'studio.cameraPerspective': '视角粗调',
    'studio.canvasReady': '画布就绪',
    'studio.change': '更换',
    'studio.distance': '距离',
    'studio.dropImage': '拖放图片到这里',
    'studio.generateAngle': '生成新视角',
    'studio.inputSource': '输入图片',
    'studio.parameters': '参数',
    'studio.pitch': '俯仰',
    'studio.processing': '处理中...',
    'studio.resultPreview': '结果预览',
    'studio.rotation': '旋转',
    'studio.uploading': '上传中...'
};

export function t(key) {
    return translations[key] || key;
}

export function applyAngleLanguage(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = t(element.dataset.i18n);
    });
    root.documentElement?.setAttribute('lang', 'zh-CN');
}
