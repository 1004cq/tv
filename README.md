# tv

中国电视台聚合网站 - tv.cq.je

基于 Vue3 + Vite + hls.js 的简单直播播放器。

## 开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 构建

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 生成最优 M3U（多源测速）

```bash
node server/generate.js
```

会拉取多个 M3U 源，对每个频道测速，输出 `best.m3u`（每个频道只保留最快的源）。

前端可将 `src/App.vue` 中的 `M3U_URL` 改为本地的 `best.m3u`，或上传到自己的服务器。

## 说明

- 默认从 [cs3306/IPTV-Sources](https://github.com/cs3306/IPTV-Sources) 拉取 M3U 播放列表
- 使用 hls.js 播放 `.m3u8` 流
- 可在 `src/App.vue` 中修改 `M3U_URL` 换源

## 注意

- 部分直播源可能有 CORS 限制，需要后端代理
- 公开 M3U 源失效较快，建议定期更新
