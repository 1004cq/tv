/** CCSH/IPTV 台标：https://github.com/CCSH/IPTV */
export const LOGO_BASE =
  'https://cdn.jsdelivr.net/gh/CCSH/IPTV@main/logo/'

const CGTN_MAP = {
  arabic: 'CGTN-Arabic',
  阿语: 'CGTN-阿拉伯语',
  阿拉伯: 'CGTN-阿拉伯语',
  french: 'CGTN-法语',
  法语: 'CGTN-法语',
  espanol: 'CGTN-Espanol',
  西语: 'CGTN西语',
  西班牙语: 'CGTN-西班牙语',
  russian: 'CGTN-Russian',
  俄语: 'CGTN-俄语',
  doc: 'CGTN-纪录',
  纪录: 'CGTN-纪录'
}

/** 英文/别名 → CCSH 台标文件名 */
const ALIAS_MAP = [
  [/culture\s*of\s*quality|文化精品/i, ['文化精品', 'CCTV15']],
  [/health|卫生健康|健康/i, ['卫生健康', 'CCTV卫生健康']],
  [/nostalgia|怀旧剧场/i, ['怀旧剧场']],
  [/storm\s*music|风云音乐/i, ['风云音乐']],
  [/storm\s*theater|风云剧场/i, ['风云剧场']],
  [/first\s*theater|第一剧场/i, ['第一剧场']],
  [/weapon|兵器科技/i, ['兵器科技']],
  [/women.?s?\s*fashion|女性时尚/i, ['女性时尚']],
  [/world\s*geography|世界地理/i, ['世界地理']],
  [/人间卫视/i, ['人间卫视', '華藏卫视', '华藏卫视']]
]

function unique(list) {
  const out = []
  const seen = new Set()
  for (const item of list) {
    const v = (item || '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** 根据频道名生成可能的台标文件名（不含 .png） */
export function logoCandidates(name = '') {
  const raw = String(name).trim()
  if (!raw) return []

  const cands = [raw]
  const noQuality = raw.replace(/\s*\([^)]*\)\s*$/g, '').trim()
  if (noQuality && noQuality !== raw) cands.push(noQuality)

  const compact = noQuality.replace(/\s+/g, '')
  if (compact !== noQuality) cands.push(compact)

  // CCTV-1 综合 / CCTV1综合 → CCTV1
  const cctv = noQuality.match(/^CCTV[-\s]?(\d+[K+]?)(.*)$/i)
  if (cctv) {
    const num = cctv[1].toUpperCase()
    cands.push(`CCTV${num}`, `CCTV-${num}`, `-CCTV${num}`)
  }

  // CETV-1 → CETV1 / CETV-1
  const cetv = noQuality.match(/^CETV[-\s]?(\d+)(.*)$/i)
  if (cetv) {
    cands.push(`CETV${cetv[1]}`, `CETV-${cetv[1]}`, 'CETV')
  }

  // CGTN French / CGTN法语
  const cgtn = noQuality.match(/^CGTN[-\s]*(.*)$/i)
  if (cgtn) {
    cands.push('CGTN')
    const rest = cgtn[1].trim()
    if (rest) {
      const key = rest.toLowerCase()
      for (const [k, v] of Object.entries(CGTN_MAP)) {
        if (key.includes(k) || rest.includes(k)) cands.push(v)
      }
      cands.push(`CGTN-${rest}`, `CGTN${rest}`, `CGTN ${rest}`)
    }
  }

  // 卫视：去掉多余空格
  if (noQuality.includes('卫视')) {
    cands.push(compact)
  }

  for (const [re, names] of ALIAS_MAP) {
    if (re.test(raw) || re.test(noQuality)) {
      cands.push(...names)
    }
  }

  // 地方台「XX新闻综合」等保持原名尝试
  return unique(cands)
}

export function logoUrlFor(name, index = 0) {
  const list = logoCandidates(name)
  const key = list[index]
  if (!key) return ''
  return LOGO_BASE + encodeURIComponent(`${key}.png`)
}
