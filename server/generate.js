/**
 * 多源拉取 → 测速 → 输出 best.m3u
 * 用法：node server/generate.js
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'best.m3u')

const SOURCES = [
  {
    name: 'cs3306/IPTV-Sources',
    url: 'https://raw.githubusercontent.com/cs3306/IPTV-Sources/main/data/output/iptv_collection.m3u'
  },
  {
    name: 'CCSH/IPTV live',
    url: 'https://raw.githubusercontent.com/CCSH/IPTV/main/live.m3u'
  },
  {
    name: 'CCSH/IPTV lite',
    url: 'https://raw.githubusercontent.com/CCSH/IPTV/main/live_lite.m3u'
  },
  {
    name: 'fanmingming/live ipv6',
    url: 'https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u'
  },
  {
    name: 'YanG-1989/Gather',
    url: 'https://raw.githubusercontent.com/YanG-1989/m3u/main/Gather.m3u'
  },
  {
    name: 'iptv-org/cn',
    url: 'https://iptv-org.github.io/iptv/countries/cn.m3u'
  }
]

const UA =
  'Mozilla/5.0 (compatible; tv-best-m3u/1.0; +https://github.com/1004cq/tv)'
const FETCH_TIMEOUT_MS = 20000
const SPEED_TIMEOUT_MS = 5000
const SPEED_RETRIES = 2
const CONCURRENCY = Number(process.env.CONCURRENCY) || 8
const MAX_URLS_PER_CHANNEL = Number(process.env.MAX_URLS_PER_CHANNEL) || 4
const MAX_CHANNELS = Number(process.env.MAX_CHANNELS) || 200

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}]`, ...args)
}

function cleanName(name = '') {
  const quality =
    'FHD|UHD|HD|SD|4K|8K|1080[pP]|720[pP]|576[iIpP]|480[pPiI]|超清|高清|标清|蓝光'
  let n = String(name)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`\\s*[(\\uff08]\\s*(${quality})\\s*[)\\uff09]\\s*`, 'gi'), ' ')
    .replace(new RegExp(`\\s+(${quality})$`, 'i'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // CCTV-1 综合 / CCTV01HD → CCTV1
  const cctv = n.match(/^CCTV[\s\-–—_]*0*(\d+[K+]?)/i)
  if (cctv) return `CCTV${String(cctv[1]).toUpperCase()}`

  return n
}

function dedupeKey(name) {
  return cleanName(name).toLowerCase().replace(/[\s\-_.]/g, '')
}

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: '*/*' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function parseM3U(content, sourceName) {
  const lines = content.split(/\r?\n/)
  const channels = []
  let name = ''
  let group = ''

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('#EXTINF:')) {
      name = t.match(/,(.+)$/)?.[1]?.trim() || '未知'
      group = t.match(/group-title="([^"]*)"/i)?.[1]?.trim() || ''
    } else if (t && !t.startsWith('#') && /\.m3u8(\?|$)/i.test(t)) {
      const cleaned = cleanName(name)
      const isMeta =
        /更新时间|update\s*time/i.test(`${group} ${name}`) ||
        /^\d{8}([_\s-]?\d{2}:\d{2})?$/.test(String(name).trim())
      if (cleaned && !isMeta) {
        channels.push({
          name: cleaned,
          key: dedupeKey(cleaned),
          url: t,
          group,
          source: sourceName
        })
      }
      name = ''
      group = ''
    }
  }
  return channels
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  const n = Math.min(concurrency, Math.max(items.length, 1))
  await Promise.all(Array.from({ length: n }, () => run()))
  return results
}

async function testSpeed(url) {
  let lastTime = 99999

  for (let attempt = 0; attempt <= SPEED_RETRIES; attempt++) {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SPEED_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: '*/*' }
      })
      // 读一点内容，确认不是空响应 / 假 200
      if (res.body) {
        const reader = res.body.getReader()
        await reader.read()
        await reader.cancel().catch(() => {})
      }
      clearTimeout(timer)
      lastTime = Date.now() - start
      if (res.ok) {
        return { url, time: lastTime, ok: true, attempts: attempt + 1 }
      }
    } catch {
      clearTimeout(timer)
      lastTime = Date.now() - start
    }
  }

  return { url, time: lastTime, ok: false, attempts: SPEED_RETRIES + 1 }
}

async function main() {
  log('开始生成 best.m3u')
  log(`源数量: ${SOURCES.length} | 并发: ${CONCURRENCY} | 超时: ${SPEED_TIMEOUT_MS}ms | 重试: ${SPEED_RETRIES}`)

  const all = []
  let sourceOk = 0
  let sourceFail = 0

  for (const src of SOURCES) {
    try {
      const text = await fetchText(src.url)
      const parsed = parseM3U(text, src.name)
      all.push(...parsed)
      sourceOk += 1
      log(`✓ 拉取成功 [${src.name}] ${parsed.length} 条`)
    } catch (e) {
      sourceFail += 1
      log(`✗ 拉取失败 [${src.name}] ${e.message || e}`)
    }
  }

  if (!all.length) {
    console.error('错误：没有从任何源解析到频道，终止。')
    process.exit(1)
  }

  // 按清理后的频道名聚合，URL 去重
  const groups = new Map()
  for (const ch of all) {
    if (!groups.has(ch.key)) {
      groups.set(ch.key, {
        name: ch.name,
        group: ch.group,
        urls: new Set(),
        sources: new Set()
      })
    }
    const g = groups.get(ch.key)
    if (!g.group && ch.group) g.group = ch.group
    // 优先保留更短更干净的展示名
    if (ch.name.length < g.name.length) g.name = ch.name
    g.urls.add(ch.url)
    g.sources.add(ch.source)
  }

  // 限制测速规模：优先央视/卫视，其余按名称排序截断
  let entries = [...groups.entries()].map(([key, value]) => ({
    key,
    ...value,
    urls: [...value.urls].slice(0, MAX_URLS_PER_CHANNEL)
  }))

  entries.sort((a, b) => {
    const score = (name) => {
      if (/^CCTV\d/i.test(name) || /CGTN/i.test(name)) return 0
      if (/卫视/.test(name)) return 1
      return 2
    }
    const d = score(a.name) - score(b.name)
    return d !== 0 ? d : a.name.localeCompare(b.name, 'zh')
  })

  if (entries.length > MAX_CHANNELS) {
    log(`频道过多，截断至前 ${MAX_CHANNELS} 个（共 ${entries.length}）`)
    entries = entries.slice(0, MAX_CHANNELS)
  }

  const jobs = []
  for (const entry of entries) {
    for (const url of entry.urls) {
      jobs.push({ key: entry.key, name: entry.name, group: entry.group, url })
    }
  }

  log(`待测速: ${entries.length} 频道 / ${jobs.length} 个 URL`)

  const speedStart = Date.now()
  let okCount = 0
  let failCount = 0
  let done = 0
  const times = []

  const jobResults = await mapPool(jobs, CONCURRENCY, async (job) => {
    const result = await testSpeed(job.url)
    done += 1
    if (result.ok) {
      okCount += 1
      times.push(result.time)
    } else {
      failCount += 1
    }
    if (done % 25 === 0 || done === jobs.length) {
      log(`测速进度 ${done}/${jobs.length}（成功 ${okCount} / 失败 ${failCount}）`)
    }
    return { ...job, ...result }
  })

  const byChannel = new Map()
  for (const r of jobResults) {
    if (!byChannel.has(r.key)) byChannel.set(r.key, [])
    byChannel.get(r.key).push(r)
  }

  const best = []
  for (const entry of entries) {
    const results = (byChannel.get(entry.key) || [])
      .filter((r) => r.ok)
      .sort((a, b) => a.time - b.time)
    if (!results.length) continue
    best.push({
      name: entry.name,
      group: entry.group || '',
      url: results[0].url,
      backups: results.slice(1, 3).map((r) => r.url),
      time: results[0].time
    })
  }

  const elapsed = ((Date.now() - speedStart) / 1000).toFixed(1)
  const avg =
    times.length > 0
      ? Math.round(times.reduce((s, t) => s + t, 0) / times.length)
      : 0

  if (!best.length) {
    console.error('错误：测速后没有可用频道，不写入 best.m3u')
    process.exit(1)
  }

  // 不写入时间戳，避免每天内容实质相同却触发无意义提交
  let m3u = `#EXTM3U\n#EXT-X-TV-CHANNELS: ${best.length}\n`

  for (const ch of best) {
    const groupAttr = ch.group ? ` group-title="${ch.group.replace(/"/g, '')}"` : ''
    m3u += `#EXTINF:-1 tvg-name="${ch.name}"${groupAttr},${ch.name}\n`
    m3u += `${ch.url}\n`
    for (const b of ch.backups) {
      m3u += `#EXTBURL:${b}\n`
    }
  }

  fs.writeFileSync(OUTPUT, m3u, 'utf8')

  log('======== 汇总 ========')
  log(`源拉取: 成功 ${sourceOk} / 失败 ${sourceFail}`)
  log(`测速 URL: 成功 ${okCount} / 失败 ${failCount}`)
  log(`平均响应: ${avg} ms | 耗时 ${elapsed}s`)
  log(`输出频道: ${best.length} → ${path.relative(ROOT, OUTPUT)}`)
  log(
    '最快示例:',
    best
      .slice()
      .sort((a, b) => a.time - b.time)
      .slice(0, 5)
      .map((c) => `${c.name}(${c.time}ms)`)
      .join(', ')
  )
}

main().catch((err) => {
  console.error('生成失败:', err)
  process.exit(1)
})
