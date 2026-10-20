import fs from 'fs'
import https from 'https'

const SOURCES = [
  'https://raw.githubusercontent.com/cs3306/IPTV-Sources/main/data/output/iptv_collection.m3u',
  'https://raw.githubusercontent.com/CCSH/IPTV/main/IPTV.m3u',
  'https://raw.githubusercontent.com/Hawaiine/Oasisic-IPTV/main/cn.m3u'
]

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function parseM3U(content) {
  const lines = content.split('\n')
  const channels = []
  let name = ''
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('#EXTINF:')) {
      name = t.match(/,(.+)$/)?.[1]?.trim() || '未知'
    } else if (t && !t.startsWith('#') && t.includes('.m3u8')) {
      channels.push({ name, url: t })
      name = ''
    }
  }
  return channels
}

function testSpeed(url) {
  return new Promise(resolve => {
    const start = Date.now()
    const req = https.get(url, { timeout: 5000 }, res => {
      const time = Date.now() - start
      res.destroy()
      resolve({ url, time, ok: res.statusCode < 400 })
    })
    req.on('error', () => resolve({ url, time: 9999, ok: false }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ url, time: 9999, ok: false })
    })
  })
}

async function main() {
  console.log('拉取源...')
  const all = []
  for (const src of SOURCES) {
    try {
      const text = await fetchText(src)
      all.push(...parseM3U(text))
      console.log('已获取:', src)
    } catch (e) {
      console.log('失败:', src)
    }
  }

  const groups = new Map()
  for (const ch of all) {
    if (!groups.has(ch.name)) groups.set(ch.name, [])
    groups.get(ch.name).push(ch.url)
  }

  console.log(`共 ${groups.size} 个频道，开始测速...`)
  const best = []

  for (const [name, urls] of groups) {
    const results = await Promise.all(urls.map(testSpeed))
    const valid = results.filter(r => r.ok).sort((a, b) => a.time - b.time)
    if (valid.length) {
      best.push({ name, url: valid[0].url, time: valid[0].time })
    }
  }

  let m3u = '#EXTM3U\n'
  for (const ch of best) {
    m3u += `#EXTINF:-1,${ch.name}\n${ch.url}\n`
  }

  fs.writeFileSync('best.m3u', m3u)
  console.log(`完成，输出 ${best.length} 个频道 → best.m3u`)
}

main()
