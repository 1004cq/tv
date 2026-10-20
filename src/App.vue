<template>
  <div class="app">
    <header class="header">
      <h1>中国电视台</h1>
      <p v-if="activeSourceLabel" class="source-info" :title="activeSourceUrl">
        源：{{ activeSourceLabel }}
        <span v-if="channels.length">· {{ channels.length }} 频道</span>
      </p>
    </header>

    <div class="main">
      <!-- 频道列表（桌面左侧 / 手机下方） -->
      <section v-if="!listLoading && !listError" class="channel-section">
        <div class="channel-toolbar">
          <div class="search-box">
            <input
              v-model.trim="searchQuery"
              type="search"
              class="search-input"
              placeholder="搜索频道..."
              enterkeyhint="search"
              autocomplete="off"
              aria-label="搜索频道"
            />
          </div>

          <div class="category-tabs" role="tablist" aria-label="频道分类">
            <button
              v-for="cat in categories"
              :key="cat.value"
              type="button"
              class="category-tab"
              :class="{ active: activeCategory === cat.value }"
              role="tab"
              :aria-selected="activeCategory === cat.value"
              @click="activeCategory = cat.value"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>

        <div v-if="filteredChannels.length" class="channel-list">
          <div
            v-for="channel in filteredChannels"
            :key="channel.name + channel.url"
            class="channel-item"
            :class="{ active: currentChannel?.url === channel.url }"
            @click="playChannel(channel)"
          >
            <ChannelLogo :name="channel.name" />
            <span class="channel-name">{{ channel.name }}</span>
          </div>
        </div>
        <div v-else class="empty-hint">没有找到匹配的频道</div>
      </section>

      <!-- 播放器 -->
      <section class="player-section">
        <div v-if="listLoading" class="status">加载频道列表中...</div>
        <div v-else-if="listError" class="status">{{ listError }}</div>
        <template v-else-if="currentChannel">
          <div class="now-playing">
            <ChannelLogo :name="currentChannel.name" class="now-logo" />
            <div class="now-text">
              <span class="now-label">正在播放</span>
              <span class="now-name">{{ currentChannel.name }}</span>
            </div>
          </div>
          <div class="player-container">
            <Player
              :url="currentChannel.url"
              :backups="currentChannel.backups || []"
              :key="currentChannel.url"
            />
          </div>
        </template>
        <div v-else class="status">请选择频道</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Player from './components/Player.vue'
import ChannelLogo from './components/ChannelLogo.vue'

const channels = ref([])
const currentChannel = ref(null)
const listLoading = ref(true)
const listError = ref('')
const searchQuery = ref('')
const activeCategory = ref('all')

const categories = [
  { label: '全部', value: 'all' },
  { label: '央视', value: 'cctv' },
  { label: '卫视', value: 'satellite' },
  { label: '地方台', value: 'local' }
]

const M3U_SOURCES = [
  {
    label: 'best.m3u（本仓库测速优选）',
    url: 'https://raw.githubusercontent.com/1004cq/tv/main/best.m3u'
  },
  {
    label: 'CCSH/IPTV live',
    url: 'https://raw.githubusercontent.com/CCSH/IPTV/main/live.m3u'
  },
  {
    label: 'cs3306/IPTV-Sources',
    url: 'https://raw.githubusercontent.com/cs3306/IPTV-Sources/main/data/output/iptv_collection.m3u'
  },
  {
    label: 'fanmingming/live ipv6',
    url: 'https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u'
  }
]

const activeSourceLabel = ref('')
const activeSourceUrl = ref('')

const MAX_CHANNELS = 120

async function loadPlaylist() {
  const errors = []

  for (const source of M3U_SOURCES) {
    try {
      const res = await fetch(source.url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.includes('#EXTINF')) throw new Error('不是有效的 M3U')
      const parsed = parseM3U(text)
      if (!parsed.length) throw new Error('频道列表为空')

      channels.value = parsed.slice(0, MAX_CHANNELS)
      activeSourceLabel.value = source.label
      activeSourceUrl.value = source.url
      currentChannel.value = channels.value[0] || null
      return
    } catch (e) {
      errors.push(`${source.label}: ${e.message || e}`)
      console.warn('加载源失败:', source.url, e)
    }
  }

  throw new Error(errors.join('；') || '所有源均加载失败')
}

function classifyChannel(name, groupTitle = '') {
  const text = `${groupTitle} ${name}`

  if (/央视|中央|cctv|cgtn/i.test(text)) {
    return 'cctv'
  }
  if (/卫视/.test(text)) {
    return 'satellite'
  }
  if (/地方/.test(groupTitle)) {
    return 'local'
  }
  // 名称含省市且非卫视，归为地方台
  if (
    /(北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|深圳|广州|杭州|南京|武汉|成都|苏州|青岛|大连|厦门|宁波)/.test(
      name
    )
  ) {
    return 'local'
  }
  return 'other'
}

function parseM3U(content) {
  const lines = content.split('\n')
  const result = []
  let currentName = ''
  let currentGroup = ''
  let backups = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,([^,]+)$/)
      currentName = nameMatch ? nameMatch[1].trim() : '未知频道'
      const groupMatch = trimmed.match(/group-title="([^"]*)"/i)
      currentGroup = groupMatch ? groupMatch[1].trim() : ''
      backups = []
    } else if (trimmed.startsWith('#EXTBURL:')) {
      const backup = trimmed.slice('#EXTBURL:'.length).trim()
      if (backup.includes('.m3u8')) backups.push(backup)
    } else if (trimmed && !trimmed.startsWith('#')) {
      if (currentName && trimmed.includes('.m3u8')) {
        const category = classifyChannel(currentName, currentGroup)
        result.push({
          name: currentName,
          url: trimmed,
          backups: [...backups],
          group: currentGroup,
          category
        })
      }
      currentName = ''
      currentGroup = ''
      backups = []
    }
  }
  return result
}

const filteredChannels = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return channels.value.filter((ch) => {
    const matchCategory =
      activeCategory.value === 'all' || ch.category === activeCategory.value
    const matchSearch = !q || ch.name.toLowerCase().includes(q)
    return matchCategory && matchSearch
  })
})

onMounted(async () => {
  try {
    await loadPlaylist()
  } catch (e) {
    listError.value = '加载频道失败：' + e.message
  } finally {
    listLoading.value = false
  }
})

function playChannel(channel) {
  currentChannel.value = channel
}
</script>
