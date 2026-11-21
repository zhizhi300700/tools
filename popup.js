document.addEventListener("DOMContentLoaded", async () => {
  const countBadge = document.getElementById("countBadge");
  const countAll = document.getElementById("countAll");
  const countXhs = document.getElementById("countXhs");
  const countTb = document.getElementById("countTb");
  const productList = document.getElementById("productList");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const searchInput = document.getElementById("searchInput");
  const copyUrlsBtn = document.getElementById("copyUrlsBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const clearBtn = document.getElementById("clearBtn");
  const webhookInput = document.getElementById("webhookInput");
  const sendWebhookBtn = document.getElementById("sendWebhookBtn");
  const webhookStatus = document.getElementById("webhookStatus");

  let allProducts = [];
  let currentFilter = "all";
  let searchQuery = "";

  async function loadData() {
    const data = await chrome.storage.local.get({
      collectedProducts: [],
      savedWebhookUrl: "http://localhost:8000/collect"
    });
    allProducts = data.collectedProducts || [];
    webhookInput.value = data.savedWebhookUrl;
    updateCounts();
    render();
  }

  function updateCounts() {
    const total = allProducts.length;
    const xhsCount = allProducts.filter(p => p.platform === "xiaohongshu").length;
    const tbCount = allProducts.filter(p => p.platform === "taobao").length;
    countBadge.textContent = total;
    countAll.textContent = total;
    countXhs.textContent = xhsCount;
    countTb.textContent = tbCount;
  }

  function getFilteredProducts() {
    return allProducts.filter(p => {
      const matchFilter = currentFilter === "all" || p.platform === currentFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchSearch = !query ||
        (p.title && p.title.toLowerCase().includes(query)) ||
        (p.url && p.url.toLowerCase().includes(query));
      return matchFilter && matchSearch;
    });
  }

  function render() {
    const items = getFilteredProducts();
    productList.innerHTML = "";

    if (items.length === 0) {
      productList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:24px;margin-bottom:6px;">📭</div>
          暂无选品数据<br/>
          <span style="font-size:11px;color:#aaa;">在小红书或淘宝页面悬浮并点击【选品】即可添加</span>
        </div>
      `;
      return;
    }

    items.forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      const isXhs = p.platform === "xiaohongshu";
      const tagClass = isXhs ? "tag-platform tag-xhs" : "tag-platform tag-tb";
      const tagLabel = isXhs ? "小红书" : "淘宝";
      const defaultImg = "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"48\" height=\"48\"><rect width=\"48\" height=\"48\" fill=\"%23eee\"/></svg>";
      const imgSrc = p.coverImage || defaultImg;
      const dateStr = (p.createdAt || "").slice(0, 10);

      card.innerHTML = `
        <img class="product-img" src="${imgSrc}" onerror="this.src='${defaultImg}'" />
        <div class="product-details">
          <a class="product-title" href="${p.url}" target="_blank" title="${p.title}">${p.title}</a>
          <div class="product-meta">
            <span class="${tagClass}">${tagLabel}</span>
            ${p.price ? `<span class="product-price">${p.price}</span>` : ""}
            <span>${dateStr}</span>
          </div>
        </div>
        <button class="card-del-btn" data-id="${p.id}" title="移出选品库">✕</button>
      `;
      productList.appendChild(card);
    });

    productList.querySelectorAll(".card-del-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        allProducts = allProducts.filter(p => p.id !== id);
        await chrome.storage.local.set({ collectedProducts: allProducts });
        chrome.runtime.sendMessage({ action: "UPDATE_BADGE", count: allProducts.length });
        updateCounts();
        render();
      });
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      render();
    });
  });

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  // 1. 复制纯 URL (每行一个)
  copyUrlsBtn.addEventListener("click", async () => {
    const items = getFilteredProducts();
    if (items.length === 0) return alert("当前列表中没有选品链接");
    const urls = items.map(p => p.url).join("\n");
    await navigator.clipboard.writeText(urls);
    const orig = copyUrlsBtn.innerHTML;
    copyUrlsBtn.innerHTML = "✅ 已复制剪贴板!";
    setTimeout(() => { copyUrlsBtn.innerHTML = orig; }, 1600);
  });

  // 2. 导出 JSON (供下游 Agent / Codex 解析)
  exportJsonBtn.addEventListener("click", () => {
    const items = getFilteredProducts();
    if (items.length === 0) return alert("列表为空");
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 3. 导出 CSV
  exportCsvBtn.addEventListener("click", () => {
    const items = getFilteredProducts();
    if (items.length === 0) return alert("列表为空");
    let csv = "\uFEFF平台,商品ID,商品URL,标题,价格,采集时间\n";
    items.forEach(p => {
      const cleanTitle = (p.title || "").replace(/"/g, '""');
      csv += `"${p.platform}","${p.id}","${p.url}","${cleanTitle}","${p.price || ""}","${p.createdAt}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 4. 清空
  clearBtn.addEventListener("click", async () => {
    if (allProducts.length === 0) return;
    if (confirm("确定清空选品库吗？建议导出后再清空。")) {
      allProducts = [];
      await chrome.storage.local.set({ collectedProducts: [] });
      chrome.runtime.sendMessage({ action: "UPDATE_BADGE", count: 0 });
      updateCounts();
      render();
    }
  });

  // 5. 推送至 Webhook
  sendWebhookBtn.addEventListener("click", async () => {
    const targetUrl = webhookInput.value.trim();
    if (!targetUrl) return alert("请填写 Webhook 接收地址");
    await chrome.storage.local.set({ savedWebhookUrl: targetUrl });

    const items = getFilteredProducts();
    if (items.length === 0) return alert("列表为空，无需推送");

    webhookStatus.style.display = "block";
    webhookStatus.style.color = "#6b7280";
    webhookStatus.textContent = "正在向 Agent 发送...";

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          total: items.length,
          products: items
        })
      });
      if (res.ok) {
        webhookStatus.style.color = "#10b981";
        webhookStatus.textContent = `✅ 成功推送 ${items.length} 条数据至 Agent 服务！`;
      } else {
        webhookStatus.style.color = "#ef4444";
        webhookStatus.textContent = `❌ Agent 返回异常: HTTP ${res.status}`;
      }
    } catch (err) {
      webhookStatus.style.color = "#ef4444";
      webhookStatus.textContent = `❌ 连接失败: 请确保本地 Agent 服务已启动 (${err.message})`;
    }
  });

  loadData();
});
