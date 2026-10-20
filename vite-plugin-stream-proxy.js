/**
 * 开发 / preview 用的 HLS 流代理：
 * - 绕过浏览器 CORS
 * - 把 HTTP 源转到同源，避免 HTTPS 站点混合内容拦截
 * - 重写 m3u8 内的相对 / 绝对地址，让分片也走代理
 */
function isPlaylist(contentType = '', url = '') {
  const t = contentType.toLowerCase()
  return (
    t.includes('mpegurl') ||
    t.includes('m3u8') ||
    t.includes('text/plain') ||
    /\.m3u8(\?|$)/i.test(url)
  )
}

function rewritePlaylist(body, baseUrl, proxyPath) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          try {
            const abs = new URL(uri, baseUrl).href
            return `URI="${proxyPath}${encodeURIComponent(abs)}"`
          } catch {
            return `URI="${uri}"`
          }
        })
      }

      try {
        const abs = new URL(trimmed, baseUrl).href
        return `${proxyPath}${encodeURIComponent(abs)}`
      } catch {
        return line
      }
    })
    .join('\n')
}

async function handleProxy(req, res) {
  try {
    const incoming = new URL(req.url || '', 'http://localhost')
    const target = incoming.searchParams.get('url')

    if (!target) {
      res.statusCode = 400
      res.end('Missing url')
      return
    }

    let parsed
    try {
      parsed = new URL(target)
    } catch {
      res.statusCode = 400
      res.end('Invalid url')
      return
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.statusCode = 400
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

    res.statusCode = upstream.status
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Cache-Control', 'no-cache')

    if (isPlaylist(contentType, target)) {
      const text = buffer.toString('utf8')
      // 粗判是否为播放列表
      if (text.includes('#EXTM3U') || /\.m3u8(\?|$)/i.test(target)) {
        const finalUrl = upstream.url || target
        const rewritten = rewritePlaylist(text, finalUrl, '/api/proxy?url=')
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
        res.end(rewritten)
        return
      }
    }

    res.setHeader('Content-Type', contentType)
    res.end(buffer)
  } catch (err) {
    res.statusCode = 502
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end('Proxy error: ' + (err?.message || 'unknown'))
  }
}

function attach(middlewares) {
  middlewares.use((req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/proxy')) return next()

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.end()
      return
    }

    handleProxy(req, res)
  })
}

export default function streamProxyPlugin() {
  return {
    name: 'stream-proxy',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    }
  }
}
