# tv

中国电视台聚合网站 - tv.cq.je

基于 Vue3 + Vite + hls.js 的简单直播播放器。

## 开发

```bash
npm install
cp .env.example .env   # 填入你的私有 M3U（含 token）
npm run dev
```

打开 http://localhost:3000

### 私有 / 付费 M3U

在 `.env` 中配置（勿提交真实 token）：

```bash
M3U_PRIVATE_URL=http://z.zzr.cc/live.php?token=你的TOKEN&s=1&c=m
```

前端优先请求同源 `/api/playlist`（由开发服务器 / `npm start` 代理），token 不会打进前端包。  
若私有源因 IP 限制或过期失败，会自动回退到 `best.m3u` 等公开源。

## 构建

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 生成最优 M3U（多源测速）

```bash
npm run generate
# 或
node server/generate.js
```

会拉取多个公开 M3U 源，对频道测速（可控并发 + 重试），去重清理频道名后输出 `best.m3u`。

### 自动更新

GitHub Actions（`.github/workflows/generate-m3u.yml`）：

- 每天自动运行；也可在 Actions 页手动触发
- 生成失败会给出明确错误
- **仅在 `best.m3u` 内容有实际变化时才提交**

前端默认优先加载：

```text
https://raw.githubusercontent.com/1004cq/tv/main/best.m3u
```

加载失败时自动回退到备用源，页头会显示当前使用的源。

## 生产启动（含流媒体代理）

纯静态托管无法绕过直播源 CORS / HTTPS 混合内容限制，请用：

```bash
npm run build
npm start
```

开发时 `npm run dev` / `npm run preview` 已内置 `/api/proxy` 代理。

## 注意

- 多数公开直播源无 CORS 头，需经同源代理播放
- 公开 M3U 源时效性差，依赖 Actions 定期刷新 `best.m3u`
