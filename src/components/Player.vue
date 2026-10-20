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
  border-radius: inherit;
  overflow: hidden;
}

.player-wrap video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}

.player-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background:
    radial-gradient(500px 280px at 50% 40%, rgba(232, 93, 76, 0.12), transparent 65%),
    rgba(5, 7, 11, 0.82);
  color: var(--text-muted, #8b96a8);
  padding: 24px;
  text-align: center;
  z-index: 2;
  pointer-events: none;
  animation: fade-in 0.25s ease both;
}

.player-overlay p {
  font-size: 14px;
  letter-spacing: 0.02em;
}

.error-text {
  max-width: 280px;
  font-size: 15px;
  color: #f0a8a0;
  line-height: 1.55;
}

.retry-btn {
  pointer-events: auto;
  appearance: none;
  border: 1px solid rgba(232, 93, 76, 0.45);
  background: rgba(232, 93, 76, 0.16);
  color: #ffd2cb;
  border-radius: 10px;
  padding: 11px 26px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
}

.retry-btn:hover {
  background: rgba(232, 93, 76, 0.28);
  border-color: rgba(232, 93, 76, 0.7);
}

.retry-btn:active {
  transform: scale(0.98);
}

.retry-btn:focus-visible {
  outline: 2px solid rgba(232, 93, 76, 0.7);
  outline-offset: 2px;
}

.spinner {
  width: 34px;
  height: 34px;
  border: 2.5px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--accent, #e85d4c);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-overlay,
  .spinner,
  .retry-btn {
    animation: none !important;
    transition: none !important;
  }
}
</style>
