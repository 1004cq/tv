<template>
  <div class="player-wrap">
    <video ref="videoRef" controls autoplay muted playsinline></video>

    <div v-if="status === 'loading'" class="player-overlay">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="status === 'error'" class="player-overlay">
      <p class="error-text">{{ errorMessage }}</p>
      <button type="button" class="retry-btn" @click="retry">重试</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import Hls from 'hls.js'
import { toProxyUrl } from '../utils/streamProxy.js'

const props = defineProps({
  url: {
    type: String,
    required: true
  },
  /** 备用源，主源失败时依次尝试 */
  backups: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['status-change'])

const videoRef = ref(null)
const status = ref('loading')
const errorMessage = ref('播放失败，请稍后重试')
let hls = null
let urlIndex = 0
let networkRetries = 0

function allUrls() {
  const list = [props.url, ...(props.backups || [])].filter(Boolean)
  return [...new Set(list)]
}

function setStatus(next, message = '') {
  status.value = next
  if (message) errorMessage.value = message
  emit('status-change', next)
}

function destroyPlayer() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

function fail(message = '播放失败，请稍后重试') {
  destroyPlayer()
  setStatus('error', message)
}

function tryNextSource(reason) {
  const urls = allUrls()
  if (urlIndex < urls.length - 1) {
    urlIndex += 1
    networkRetries = 0
    initPlayer()
    return
  }
  fail(reason || '播放失败，请稍后重试')
}

function initPlayer() {
  destroyPlayer()
  const video = videoRef.value
  const urls = allUrls()
  const rawUrl = urls[urlIndex]
  if (!video || !rawUrl) return

  const playUrl = toProxyUrl(rawUrl)
  setStatus('loading')

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      // 直播源偶发抖动时多给几次机会
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 3
    })
    hls.loadSource(playUrl)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      networkRetries = 0
      setStatus('playing')
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (networkRetries < 2) {
          networkRetries += 1
          hls.startLoad()
          return
        }
        tryNextSource('网络错误，无法加载直播流')
        return
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try {
          hls.recoverMediaError()
        } catch {
          tryNextSource('媒体错误，无法播放该频道')
        }
        return
      }

      tryNextSource('播放失败，请稍后重试')
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    const onError = () => {
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoaded)
      tryNextSource('播放失败，请稍后重试')
    }
    const onLoaded = () => {
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoaded)
      setStatus('playing')
      video.play().catch(() => {})
    }
    video.addEventListener('error', onError)
    video.addEventListener('loadedmetadata', onLoaded)
    video.src = playUrl
  } else {
    fail('当前浏览器不支持 HLS 播放')
  }
}

function retry() {
  urlIndex = 0
  networkRetries = 0
  initPlayer()
}

onMounted(() => {
  initPlayer()
})

watch(
  () => [props.url, (props.backups || []).join('|')],
  () => {
    urlIndex = 0
    networkRetries = 0
    initPlayer()
  }
)

onUnmounted(() => {
  destroyPlayer()
})
</script>

<style scoped>
.player-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
}

.player-wrap video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.player-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(0, 0, 0, 0.72);
  color: #ddd;
  padding: 20px;
  text-align: center;
  z-index: 2;
  pointer-events: none;
}

.error-text {
  font-size: 15px;
  color: #f0f0f0;
  line-height: 1.5;
}

.retry-btn {
  pointer-events: auto;
  appearance: none;
  border: 1px solid #444;
  background: #1c1c1c;
  color: #fff;
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.retry-btn:hover,
.retry-btn:active {
  background: #2a2a2a;
  border-color: #ff3b30;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #333;
  border-top-color: #ff3b30;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
