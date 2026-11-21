// background.js - 选品助手后台脚本
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get({ collectedProducts: [] });
  updateBadge((data.collectedProducts || []).length);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'UPDATE_BADGE') {
    updateBadge(request.count || 0);
    sendResponse({ status: 'ok' });
  }
});

function updateBadge(count) {
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#ff2442' });
}
