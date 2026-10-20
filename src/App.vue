<template>
  <div class="app">
    <header class="header">
      <h1>中国电视台</h1>
    </header>

    <div class="main">
      <!-- 播放器 -->
      <section class="player-section">
        <div v-if="loading" class="status">加载中...</div>
        <div v-else-if="error" class="status">{{ error }}</div>
        <div v-else-if="currentChannel" class="player-container">
          <Player :url="currentChannel.url" :key="currentChannel.url" />
        </div>
        <div v-else class="status">请选择频道</div>
      </section>

      <!-- 频道列表 -->
      <section v-if="!loading && !error" class="channel-section">
        <div class="channel-list">
          <div
            v-for="channel in channels"
            :key="channel.name + channel.url"
            class="channel-item"
            :class="{ active: currentChannel?.url === channel.url }"
            @click="playChannel(channel)"
          >
            {{ channel.name }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Player from './components/Player.vue'

const channels = ref([])
const currentChannel = ref(null)
const loading = ref(true)
const error = ref('')

const M3U_URL = 'https://raw.githubusercontent.com/cs3306/IPTV-Sources/main/data/output/iptv_collection.m3u'

function parseM3U(content) {
  const lines = content.split('\n')
  const result = []
  let currentName = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,([^,]+)$/)
      currentName = nameMatch ? nameMatch[1].trim() : '未知频道'
    } else if (trimmed && !trimmed.startsWith('#')) {
      if (currentName && trimmed.includes('.m3u8')) {
        result.push({ name: currentName, url: trimmed })
      }
      currentName = ''
    }
  }
  return result
}

onMounted(async () => {
  try {
    const res = await fetch(M3U_URL)
    if (!res.ok) throw new Error('加载失败')
    const text = await res.text()
    channels.value = parseM3U(text).slice(0, 80)
    if (channels.value.length > 0) {
      currentChannel.value = channels.value[0]
    }
  } catch (e) {
    error.value = '加载频道失败：' + e.message
  } finally {
    loading.value = false
  }
})

function playChannel(channel) {
  currentChannel.value = channel
}
</script>
