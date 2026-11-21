/**
 * 选品采集助手 - Content Script (v1.0.3 支持 RedNote & 小红书 & 淘宝)
 */

(function () {
  'use strict';

  const PLATFORMS = {
    XHS: 'xiaohongshu',
    TB: 'taobao'
  };

  const hostname = window.location.hostname;
  const isXhsOrRedNote = hostname.includes('xiaohongshu.com') || hostname.includes('rednote.com');
  const currentPlatform = isXhsOrRedNote ? PLATFORMS.XHS : PLATFORMS.TB;

  let collectedIdSet = new Set();
  let statusBadgeEl = null;

  async function syncCollectedCache() {
    try {
      const data = await chrome.storage.local.get({ collectedProducts: [] });
      collectedIdSet = new Set((data.collectedProducts || []).map(item => item.id));
      updateAllButtonStates();
    } catch (e) {
      console.warn('[选品助手] 同步本地存储失败', e);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.collectedProducts) {
      const newItems = changes.collectedProducts.newValue || [];
      collectedIdSet = new Set(newItems.map(item => item.id));
      updateAllButtonStates();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'FORCE_RESCAN') {
      const count = scanCards();
      sendResponse({ count });
    }
  });

  let toastEl = null;
  let toastTimer = null;
  function showToast(message, icon = '🎉') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'product-collector-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastEl.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.classList.remove('show');
    }, 2200);
  }

  function updatePageStatusBadge(count) {
    if (!statusBadgeEl) {
      statusBadgeEl = document.createElement('div');
      statusBadgeEl.className = 'product-collector-status-pill';
      document.body.appendChild(statusBadgeEl);
    }
    const platformLabel = isXhsOrRedNote ? (hostname.includes('rednote.com') ? 'RedNote' : '小红书') : '淘宝';
    statusBadgeEl.innerHTML = `
      <span class="status-dot"></span>
      <span>📌 选品助手 [${platformLabel}] (已识别 ${count} 个商品)</span>
      <span class="rescan-link" id="rescanPillBtn">刷新标记</span>
    `;

    const rescanBtn = document.getElementById('rescanPillBtn');
    if (rescanBtn) {
      rescanBtn.onclick = (e) => {
        e.stopPropagation();
        const found = scanCards();
        showToast(`已重新标记 ${found} 个商品`, '🔍');
      };
    }
  }

  function cleanProductUrl(platform, rawUrl, itemId) {
    try {
      if (platform === PLATFORMS.XHS) {
        const targetHost = hostname.includes('rednote.com') ? 'www.rednote.com' : 'www.xiaohongshu.com';
        if (itemId) return `https://${targetHost}/explore/${itemId}`;
        if (!rawUrl) return window.location.href.split('?')[0];
        const url = new URL(rawUrl, window.location.origin);
        const match = url.pathname.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/);
        if (match) return `https://${targetHost}/explore/${match[2]}`;
        return url.origin + url.pathname;
      } else {
        if (itemId) return `https://item.taobao.com/item.htm?id=${itemId}`;
        if (!rawUrl) rawUrl = window.location.href;
        if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
        const url = new URL(rawUrl, window.location.origin);
        const id = url.searchParams.get('id') || url.searchParams.get('item_id');
        if (id) return `https://item.taobao.com/item.htm?id=${id}`;
        return url.origin + url.pathname;
      }
    } catch (e) {
      return rawUrl || window.location.href;
    }
  }

  function normalizeImageUrl(raw) {
    if (!raw) return '';
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw;
  }

  async function saveProduct(product) {
    const data = await chrome.storage.local.get({ collectedProducts: [] });
    const list = data.collectedProducts || [];

    const exists = list.some(item => item.id === product.id || item.url === product.url);
    if (exists) {
      return { success: false, message: '已在选品库中' };
    }

    list.unshift(product);
    await chrome.storage.local.set({ collectedProducts: list });
    collectedIdSet.add(product.id);

    try {
      chrome.runtime.sendMessage({ action: 'UPDATE_BADGE', count: list.length });
    } catch (e) {}

    return { success: true };
  }

  function updateAllButtonStates() {
    document.querySelectorAll('.product-collector-btn').forEach(btn => {
      const itemId = btn.dataset.itemId;
      if (itemId && collectedIdSet.has(itemId)) {
        btn.classList.add('is-collected');
        btn.innerHTML = '<span>✅</span> 已选';
      } else {
        btn.classList.remove('is-collected');
        btn.innerHTML = '<span>📌</span> 选品';
      }
    });
  }

  function mountCollectButton(cardContainer, productInfo) {
    if (!cardContainer) return;

    const existingBtn = cardContainer.querySelector(':scope > .product-collector-btn');
    if (existingBtn) {
      if (collectedIdSet.has(productInfo.id)) {
        existingBtn.classList.add('is-collected');
        existingBtn.innerHTML = '<span>✅</span> 已选';
      }
      return;
    }

    const style = window.getComputedStyle(cardContainer);
    if (style.position === 'static') {
      cardContainer.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'product-collector-btn';
    btn.dataset.itemId = productInfo.id;
    btn.title = `点击一键选品：${productInfo.title}`;

    if (collectedIdSet.has(productInfo.id)) {
      btn.classList.add('is-collected');
      btn.innerHTML = '<span>✅</span> 已选';
    } else {
      btn.innerHTML = '<span>📌</span> 选品';
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (collectedIdSet.has(productInfo.id)) {
        showToast('该商品已在选品库中', 'ℹ️');
        return;
      }

      btn.innerHTML = '<span>⏳</span> 记录中...';
      const res = await saveProduct(productInfo);

      if (res.success) {
        btn.classList.add('is-collected');
        btn.innerHTML = '<span>✅</span> 已选';
        showToast(`已收藏: ${productInfo.title.slice(0, 16)}...`, '🎉');
      } else {
        btn.classList.add('is-collected');
        btn.innerHTML = '<span>✅</span> 已选';
        showToast(res.message, 'ℹ️');
      }
    });

    cardContainer.appendChild(btn);
  }

  function scanTaobaoCards() {
    const allLinks = document.querySelectorAll(
      'a[href*="item.htm"], a[href*="detail.tmall.com"], a[href*="item.taobao.com"], a[href*="click.simba.taobao.com"]'
    );

    let count = 0;
    const handledIds = new Set();

    allLinks.forEach(link => {
      let rawHref = link.getAttribute('href') || link.href;
      if (!rawHref) return;
      if (rawHref.startsWith('//')) rawHref = 'https:' + rawHref;

      let itemId = '';
      try {
        const u = new URL(rawHref, window.location.origin);
        itemId = u.searchParams.get('id') || u.searchParams.get('item_id') || '';
      } catch (e) {}

      if (!itemId || handledIds.has(itemId)) return;

      let cardRoot = link;
      let curr = link.parentElement;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.querySelector('img') && curr.offsetHeight >= 120) {
          cardRoot = curr;
          if (curr.parentElement && curr.parentElement.children.length === 1 && curr.parentElement.offsetHeight >= 120) {
            cardRoot = curr.parentElement;
          }
          break;
        }
        curr = curr.parentElement;
      }

      const imgEl = cardRoot.querySelector('img') || link.querySelector('img');
      const titleCandidate = cardRoot.querySelector('[class*="title"], [class*="desc"], h3, h4, span') || link;
      let title = (titleCandidate ? titleCandidate.textContent : '').trim();
      if (!title && imgEl) title = (imgEl.alt || imgEl.title || '淘宝商品').trim();

      const priceCandidate = cardRoot.querySelector('[class*="price"], [class*="Price"]');
      let price = '';
      if (priceCandidate) {
        price = priceCandidate.textContent.trim().replace(/[^\d.]/g, '');
      }

      const coverImage = imgEl ? normalizeImageUrl(imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('image-src')) : '';

      const productInfo = {
        platform: PLATFORMS.TB,
        id: itemId,
        url: cleanProductUrl(PLATFORMS.TB, rawHref, itemId),
        title: title.slice(0, 100) || '淘宝推荐好物',
        coverImage: coverImage,
        price: price ? `¥${price}` : '',
        createdAt: new Date().toISOString()
      };

      mountCollectButton(cardRoot, productInfo);
      handledIds.add(itemId);
      count++;
    });

    return count;
  }

  function scanXhsCards() {
    const allItems = document.querySelectorAll(
      'section.note-item, div.note-item, div[data-note-id], a[href*="/explore/"], a[href*="/discovery/item/"], [class*="note-item"], [class*="feed-item"]'
    );

    let count = 0;
    const handledIds = new Set();

    allItems.forEach(el => {
      let link = el.tagName === 'A' ? el : el.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"]');
      let noteId = el.getAttribute('data-note-id') || el.getAttribute('data-id') || '';

      let rawHref = link ? (link.getAttribute('href') || link.href) : '';
      if (!noteId && rawHref) {
        const match = rawHref.match(/\/(explore|discovery\/item)\/([a-zA-Z0-9]+)/);
        if (match) noteId = match[2];
      }

      if (!noteId && window.location.pathname.includes('/explore/')) {
        const match = window.location.pathname.match(/\/explore\/([a-zA-Z0-9]+)/);
        if (match) noteId = match[1];
      }

      if (!noteId || handledIds.has(noteId)) return;

      let cardRoot = el;
      if (el.tagName === 'A' && el.parentElement && el.parentElement.offsetHeight >= 150) {
        cardRoot = el.parentElement;
      }

      const imgEl = cardRoot.querySelector('img');
      const titleEl = cardRoot.querySelector('.title, .desc, .author, h1, span');
      const title = (titleEl ? titleEl.textContent : '').trim() || (imgEl ? imgEl.alt : '精选笔记');
      const coverImage = imgEl ? normalizeImageUrl(imgEl.src || imgEl.getAttribute('data-src')) : '';

      const productInfo = {
        platform: PLATFORMS.XHS,
        id: noteId,
        url: cleanProductUrl(PLATFORMS.XHS, rawHref, noteId),
        title: title.slice(0, 100),
        coverImage: coverImage,
        price: '',
        createdAt: new Date().toISOString()
      };

      mountCollectButton(cardRoot, productInfo);
      handledIds.add(noteId);
      count++;
    });

    return count;
  }

  function scanCards() {
    let found = 0;
    if (isXhsOrRedNote) {
      found = scanXhsCards();
    } else {
      found = scanTaobaoCards();
    }
    updatePageStatusBadge(found);
    return found;
  }

  syncCollectedCache();

  let debounceTimer = null;
  const debouncedScan = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanCards, 200);
  };

  const observer = new MutationObserver(debouncedScan);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', debouncedScan, { passive: true });

  scanCards();
  setTimeout(scanCards, 500);
  setTimeout(scanCards, 1200);
  setTimeout(scanCards, 2500);
  setTimeout(scanCards, 4000);

  setInterval(() => {
    scanCards();
  }, 3000);

  console.log('[选品采集助手 v1.0.3] RedNote & 小红书 & 淘宝支持就绪！平台:', currentPlatform);
})();
