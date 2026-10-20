/**
 * 生产环境静态站点 + HLS 代理
 * 用法：npm run build && npm start
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPrivateM3uUrl } from './server/load-env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 3000

function isPlaylist(contentType = '', url = '') {
  const t = contentType.toLowerCase()
  return (
    t.includes('mpegurl') ||
    t.includes('m3u8') ||
    t.includes('text/plain') ||
    /\.m3u8(\?|$)/i.test(url)
  )
}

function rewritePlaylist(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          try {
            const abs = new URL(uri, baseUrl).href
            return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
          } catch {
            return `URI="${uri}"`
          }
        })
      }
      try {
        const abs = new URL(trimmed, baseUrl).href
        return `/api/proxy?url=${encodeURIComponent(abs)}`
      } catch {
        return line
      }
    })
    .join('\n')
}

async function handleProxy(req, res) {
  try {
    const incoming = new URL(req.url || '', `http://127.0.0.1:${PORT}`)
    const target = incoming.searchParams.get('url')
    if (!target) {
      res.writeHead(400)
      res.end('Missing url')
      return
    }

    const parsed = new URL(target)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.writeHead(400)
      res.end('Unsupported protocol')
      return
    }

    const upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        Referer: parsed.origin + '/'
      },
      redirect: 'follow'
    })

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }

    if (
      isPlaylist(contentType, target) &&
      (buffer.toString('utf8', 0, 16).includes('#EXTM3U') || /\.m3u8(\?|$)/i.test(target))
    ) {
      const text = buffer.toString('utf8')
      const rewritten = rewritePlaylist(text, upstream.url || target)
      headers['Content-Type'] = 'application/vnd.apple.mpegurl'
      res.writeHead(upstream.status, headers)
      res.end(rewritten)
      return
    }

    headers['Content-Type'] = contentType
    res.writeHead(upstream.status, headers)
    res.end(buffer)
  } catch (err) {
    res.writeHead(502, { 'Access-Control-Allow-Origin': '*' })
    res.end('Proxy error: ' + (err?.message || 'unknown'))
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.json': 'application/json'
    }[ext] || 'application/octet-stream'
  )
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1`).pathname)
  let filePath = path.join(DIST, urlPath === '/' ? '/index.html' : urlPath)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) })
  fs.createReadStream(filePath).pipe(res)
}

async function handlePrivatePlaylist(_req, res) {
  const target = getPrivateM3uUrl()
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('未配置 M3U_PRIVATE_URL（请复制 .env.example 为 .env）')
    return
  }
  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'tv-playlist/1.0',
        Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*'
      }
    })
    const text = await upstream.text()
    if (!text.includes('#EXTINF') || /^\s*<!DOCTYPE|^\s*<html/i.test(text)) {
      res.writeHead(502, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(
        '私有源未返回有效 M3U（可能已过期、IP 超限，或被重定向到网页）。请在允许的网络环境重试。'
      )
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    })
    res.end(text)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('拉取私有 M3U 失败: ' + (err?.message || 'unknown'))
  }
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0]

  if (pathname === '/api/playlist') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': '*'
      })
      res.end()
      return
    }
    handlePrivatePlaylist(req, res)
    return
  }

  if ((req.url || '').startsWith('/api/proxy')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': '*'
      })
      res.end()
      return
    }
    handleProxy(req, res)
    return
  }
  serveStatic(req, res)
})

server.listen(PORT, () => {
  const privateConfigured = !!getPrivateM3uUrl()
  console.log(`TV server running at http://localhost:${PORT}`)
  console.log(
    privateConfigured
      ? '私有 M3U: 已配置 → /api/playlist'
      : '私有 M3U: 未配置（设置 .env 中 M3U_PRIVATE_URL）'
  )
})
