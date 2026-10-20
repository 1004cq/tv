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

## 说明

- 默认从 [cs3306/IPTV-Sources](https://github.com/cs3306/IPTV-Sources) 拉取 M3U 播放列表
- 使用 hls.js 播放 `.m3u8` 流
- 可在 `src/App.vue` 中修改 `M3U_URL` 换源

## 生产启动（含流媒体代理）

纯静态托管（如 GitHub Pages）无法绕过直播源 CORS / HTTPS 混合内容限制。请用：

```bash
npm run build
npm start
```

开发时 `npm run dev` / `npm run preview` 已内置 `/api/proxy` 代理。

## 注意

- 多数公开直播源无 CORS 头，浏览器直连会被拦截；本项目通过同源代理解决
- 若站点为 HTTPS，直连 HTTP 源还会被混合内容策略拦截，同样需要代理
- 公开 M3U 源失效较快，建议定期更新
