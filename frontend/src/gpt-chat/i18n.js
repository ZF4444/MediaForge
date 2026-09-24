const messages = {
  'chat.agentWorking': '正在处理...',
  'chat.deleteConfirm': '确定删除此对话吗？',
  'chat.deleteTitle': '删除对话',
  'chat.generated': '已生成',
  'chat.generatingImage': '正在生成图片...',
  'chat.history': '历史',
  'chat.historyTitle': '对话记录',
  'chat.inputPlaceholder': '输入消息，Enter 发送...',
  'chat.new': '新建',
  'chat.newConversation': '新对话',
  'chat.noHistory': '暂无历史对话',
  'chat.ready': '就绪',
  'chat.requestFailed': '请求失败',
  'chat.send': '发送',
  'chat.title': 'GPT 对话',
};

export function t(key) {
  return messages[key] || key;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(element => {
    element.setAttribute('title', t(element.dataset.i18nTitle));
  });
  root.documentElement?.setAttribute('lang', 'zh-CN');
}
