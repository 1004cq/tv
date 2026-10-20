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

const props = defineProps({
  url: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['status-change'])

const videoRef = ref(null)
const status = ref('loading')
const errorMessage = ref('播放失败，请稍后重试')
let hls = null

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
  const video = videoRef.value
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
}

function onFatalError(message = '播放失败，请稍后重试') {
  setStatus('error', message)
  destroyPlayer()
}

function initPlayer() {
  destroyPlayer()
  const video = videoRef.value
  if (!video || !props.url) return

  setStatus('loading')

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    })
    hls.loadSource(props.url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus('playing')
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        onFatalError('网络错误，无法加载直播流')
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        onFatalError('媒体错误，无法播放该频道')
      } else {
        onFatalError('播放失败，请稍后重试')
      }
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    const onError = () => {
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoaded)
      onFatalError('播放失败，请稍后重试')
    }
    const onLoaded = () => {
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoaded)
      setStatus('playing')
      video.play().catch(() => {})
    }
    video.addEventListener('error', onError)
    video.addEventListener('loadedmetadata', onLoaded)
    video.src = props.url
  } else {
    onFatalError('当前浏览器不支持 HLS 播放')
  }
}

function retry() {
  initPlayer()
}

onMounted(() => {
  initPlayer()
})

watch(() => props.url, () => {
  initPlayer()
})

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
}

.error-text {
  font-size: 15px;
  color: #f0f0f0;
  line-height: 1.5;
}

.retry-btn {
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
