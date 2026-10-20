<template>
  <video ref="videoRef" controls autoplay muted playsinline></video>
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

const videoRef = ref(null)
let hls = null

function destroyPlayer() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

function initPlayer() {
  destroyPlayer()
  const video = videoRef.value
  if (!video || !props.url) return

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    })
    hls.loadSource(props.url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('HLS Error:', data)
      }
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = props.url
    video.play().catch(() => {})
  }
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
