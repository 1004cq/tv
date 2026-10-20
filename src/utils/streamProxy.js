/** 同源代理前缀，解决直播源 CORS / HTTPS 混合内容问题 */
export const PROXY_PREFIX = '/api/proxy?url='

export function toProxyUrl(url) {
  if (!url) return url
  // 已是代理地址则不重复包装
  if (url.startsWith('/api/proxy?') || url.includes('/api/proxy?url=')) {
    return url
  }
  return PROXY_PREFIX + encodeURIComponent(url)
}

export function unwrapProxyUrl(url) {
  try {
    const u = new URL(url, 'http://localhost')
    if (u.pathname === '/api/proxy') {
      return u.searchParams.get('url') || url
    }
  } catch {
    /* ignore */
  }
  return url
}
