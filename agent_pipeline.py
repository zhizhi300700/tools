#!/usr/bin/env python3
"""
选品自动化下游处理管道 (Downstream Agent Pipeline)
功能：
1. 既支持作为本地 Webhook 服务接收 Chrome 插件一键推送的数据
2. 也支持直接读取导出的 JSON / CSV 文件
3. 对接 Codex / 爬虫提取完整图文并模拟上架
"""

import sys
import json
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

def process_product_item(item):
    """
    单品处理逻辑：
    由下游 Agent / Codex 根据平台 URL 解析更深层数据（SKU、高清图、规格），并格式化上传
    """
    platform = item.get("platform", "unknown")
    title = item.get("title", "")
    url = item.get("url", "")
    price = item.get("price", "")

    print(f"  👉 [处理中] [{platform.upper()}] {title[:20]}... | 价格: {price or '暂无'} | 链接: {url}")
    
    # 模拟耗时任务或调用上架接口
    # requests.post("https://your-store.com/api/products", json=...)
    return {
        "status": "success",
        "platform": platform,
        "url": url,
        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

class CollectorWebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode("utf-8"))
            products = payload.get("products", [])
            print(f"\n[Webhook 接收] 收到来自 Chrome 插件推送的 {len(products)} 个选品！")
            
            results = []
            for p in products:
                res = process_product_item(p)
                results.append(res)
                
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            
            response = {"code": 200, "message": "Success", "processed_count": len(results)}
            self.wfile.write(json.dumps(response).encode("utf-8"))
        except Exception as e:
            print(f"[Webhook 错误] 解析失败: {e}")
            self.send_response(500)
            self.end_headers()

    def do_OPTIONS(self):
        # 处理 CORS 预检请求
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def run_webhook_server(port=8000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, CollectorWebhookHandler)
    print(f"==================================================")
    print(f"🚀 Agent 本地接收服务已启动: http://localhost:{port}/collect")
    print(f"💡 在 Chrome 插件的 Popup 界面中点击【🚀 推送】即可实时接收选品！")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")

def process_local_file(filepath):
    print(f"📂 读取本地选品文件: {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        items = json.load(f)
    print(f"共发现 {len(items)} 条选品记录，开始执行自动化任务...")
    for item in items:
        process_product_item(item)
    print("✅ 全部处理完成！")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="选品自动化 Agent 处理器")
    parser.add_argument("--server", action="store_true", help="启动本地 Webhook 接收服务")
    parser.add_argument("--file", type=str, help="处理本地导出的 JSON 文件路径")
    parser.add_argument("--port", type=int, default=8000, help="Webhook 端口 (默认 8000)")

    args = parser.parse_args()

    if args.file:
        process_local_file(args.file)
    else:
        # 默认或指定 --server 启动本地服务
        run_webhook_server(args.port)
