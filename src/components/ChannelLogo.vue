<template>
  <span class="channel-logo" :class="{ placeholder: !src }">
    <img
      v-if="src"
      :src="src"
      :alt="name"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="onError"
    />
    <span v-else class="logo-fallback" aria-hidden="true">{{ fallbackText }}</span>
  </span>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { logoCandidates, LOGO_BASE } from '../utils/channelLogo.js'

const props = defineProps({
  name: {
    type: String,
    required: true
  }
})

const tryIndex = ref(0)
const candidates = computed(() => logoCandidates(props.name))

const src = computed(() => {
  const key = candidates.value[tryIndex.value]
  if (!key) return ''
  return LOGO_BASE + encodeURIComponent(`${key}.png`)
})

const fallbackText = computed(() => {
  const n = (props.name || '?').trim()
  const m = n.match(/CCTV[-\s]?(\d+)/i)
  if (m) return m[1]
  return n.slice(0, 1) || '?'
})

function onError() {
  if (tryIndex.value < candidates.value.length - 1) {
    tryIndex.value += 1
  } else {
    tryIndex.value = candidates.value.length
  }
}

watch(
  () => props.name,
  () => {
    tryIndex.value = 0
  }
)
</script>

<style scoped>
.channel-logo {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 2px;
  overflow: hidden;
  background: #222;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.channel-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #111;
  padding: 1px;
}

.channel-logo.placeholder {
  background: #2a2a2a;
}

.logo-fallback {
  font-size: 11px;
  font-weight: 700;
  color: #888;
  line-height: 1;
  user-select: none;
}
</style>
