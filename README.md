# 小红书 & 淘宝选品采集 Chrome 扩展

专为保持个人选品审美、加速下游自动化上架设计的 Chrome 浏览器插件（Manifest V3 架构）。

---

## 目录结构

```text
product-collector-extension/
├── manifest.json       # 扩展配置文件 (V3)
├── content.js          # 注入脚本 (智能识别卡片/详情页、规范化URL、一键选品)
├── content.css         # 页面悬浮按钮、角标及轻提示样式
├── background.js       # 后台服务 (实时同步角标数量、持久化存储)
├── popup.html          # 选品清单看板界面
├── popup.css           # 看板样式
├── popup.js            # 筛选、去重、导出 JSON/CSV/纯URL、Webhook推送
├── agent_pipeline.py   # 下游 Python Agent 接收与消费脚本 (支持 Webhook 与文件读取)
└── icons/              # 16x16, 48x48, 128x128 扩展高清图标
```

---

## 一、 如何安装到 Chrome 浏览器

1. 打开 Chrome 浏览器，在地址栏输入：`chrome://extensions/` 并按回车。
2. 在右上角打开 **「开发者模式」 (Developer mode)** 开关。
3. 点击左上角的 **「加载已解压的扩展程序」 (Load unpacked)**。
4. 在弹出的文件选择器中，选择本工程文件夹：
   `/Users/forest/.gemini/users/user1/product-collector-extension`
5. 安装完成！点击浏览器右上角的拼图图标（扩展管理），将「📌 选品清单」固定到浏览器工具栏。

---

## 二、 如何使用

### 1. 浏览页面时一键选品
- **小红书**：登录并浏览推荐流、搜索结果或发现页，鼠标悬停到任何卡片上，右上角会自动出现 **【📌 选品】** 胶囊按钮，点击即可保存。点进笔记详情页，右下角也会常驻 **【📌 采集此商品】** 按钮。
- **淘宝 / 天猫**：浏览搜索列表或商品卡片，悬停时点击右上角的 **【📌 选品】** 即可加入选品库。
- **状态同步**：已收藏的商品按钮会自动变为绿色的 **【✅ 已选】**，防止重复点击。

### 2. 导出与对接 Codex / AI Agent
点击浏览器工具栏的插件图标，即可打开选品管理看板：
- **📋 复制纯 URL**：一行一个清洗后的规范 URL（自动剥离 `spm`, `scm`, `share_id` 等反爬追踪参数），可直接粘贴给 ChatGPT / Claude / Codex 编写抓取指令。
- **📦 导出 JSON**：包含唯一商品 ID、规范化链接、标题预览、封面图片、所属平台和采集时间的完整结构化数据。
- **📊 导出 CSV**：适合导入 Excel 或表格工具做二次人工初审。
- **🚀 Webhook 实时推送**：配合下游 Agent 服务，点击一键投递。

---

## 三、 运行下游 Agent 接收服务

项目已内置完整的下游示例脚本 `agent_pipeline.py`：

### 方式 1：启动本地实时 Webhook 监听
```bash
python3 /Users/forest/.gemini/users/user1/product-collector-extension/agent_pipeline.py --server --port 8000
```
启动后在插件 Popup 界面中点击 **【🚀 推送】**，终端会立即接收并批量处理选品数据。

### 方式 2：批处理导出的 JSON 文件
```bash
python3 /Users/forest/.gemini/users/user1/product-collector-extension/agent_pipeline.py --file products_export_2026-11-20.json
```
