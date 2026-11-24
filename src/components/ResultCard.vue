<script setup lang="ts">
import { computed } from 'vue'
import type { Result } from '../sim'

const props = defineProps<{
  result: Result
  autopilot: Result | null
  best: number | null
  newBest: boolean
  notes: string[]
}>()

defineEmits<{ again: []; newDay: [] }>()

const stars = computed(() => (props.result.score >= 85 ? 3 : props.result.score >= 65 ? 2 : props.result.score >= 45 ? 1 : 0))

const title = computed(() => {
  switch (stars.value) {
    case 3:
      return 'Grid hero!'
    case 2:
      return 'Nice work!'
    case 1:
      return 'Lights are on!'
    default:
      return 'Lights flickered…'
  }
})

const robot = computed(() => {
  const a = props.autopilot
  if (!a) return ''
  const d = props.result.score - a.score
  if (d > 2) return `You beat the robot operator (${a.score})!`
  if (d >= -2) return `You tied the robot operator (${a.score}).`
  return `The robot operator scored ${a.score}. Can you beat it?`
})

const chips = computed(() => [
  { icon: '⚖️', label: 'Balanced', value: `${Math.round(props.result.stability * 100)}%`, good: props.result.stability >= 0.9 },
  { icon: '🏭', label: 'Factory goal', value: `${Math.round(props.result.production * 100)}%`, good: props.result.production >= 0.98 },
  { icon: '🔥', label: 'Gas burned', value: `${props.result.gasMWh.toFixed(0)} MWh`, good: props.result.gasMWh < 25 },
])

// up to three plain sentences about what happened
const tips = computed(() => {
  const n = props.notes
  if (n.length < 2) return n
  return [n[n.length - 1], ...n.slice(0, -1)].slice(0, 3) // grid steadiness first
})
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Day complete">
    <div class="card result">
      <p class="eyebrow">Day complete</p>
      <h2>{{ title }}</h2>

      <p class="stars" :aria-label="`${stars} of 3 stars`">
        <span v-for="i in 3" :key="i" :class="['star', { on: i <= stars }]" :style="{ animationDelay: i * 0.18 + 's' }">★</span>
      </p>

      <p class="score"><b>{{ result.score }}</b> points</p>
      <p v-if="newBest" class="best">New personal best!</p>
      <p v-else-if="best !== null" class="muted">Your best: {{ best }}</p>

      <ul class="chips">
        <li v-for="c in chips" :key="c.label" :class="{ good: c.good }">
          <span class="ci" aria-hidden="true">{{ c.icon }}</span>
          <b>{{ c.value }}</b>
          <span class="cl">{{ c.label }}</span>
        </li>
      </ul>

      <p v-if="robot" class="robot"><span aria-hidden="true">🤖</span> {{ robot }}</p>

      <div class="tips">
        <p v-for="(n, i) in tips" :key="i"><span aria-hidden="true">💡</span> {{ n }}</p>
      </div>

      <div class="actions">
        <button class="btn primary big" @click="$emit('again')">Try this day again</button>
        <button class="btn big" @click="$emit('newDay')">New weather</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 14px;
  background: rgb(31 42 68 / 0.55);
  backdrop-filter: blur(3px);
}
.card.result {
  width: min(480px, 100%);
  max-height: calc(100dvh - 28px);
  overflow-y: auto;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 20px 22px 22px;
  text-align: center;
  background: #fff;
  border: 3px solid var(--outline);
  border-radius: 26px;
  box-shadow: 0 8px 0 var(--outline);
  animation: rise 0.28s ease-out;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
}
h2 {
  margin: 0;
  font-size: 2rem;
  line-height: 1.05;
}
.stars {
  margin: 4px 0 0;
  display: flex;
  gap: 6px;
}
.star {
  font-size: 4rem;
  line-height: 1;
  color: var(--track);
  -webkit-text-stroke: 3px var(--outline);
  paint-order: stroke fill;
}
.star.on {
  color: var(--solar);
  animation: starpop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
@keyframes starpop {
  from {
    transform: scale(0.2) rotate(-40deg);
    opacity: 0;
  }
}
.score {
  margin: 0;
  font-weight: 800;
  color: var(--muted);
}
.score b {
  font-size: 2.2rem;
  color: var(--ink);
  font-weight: 900;
}
.best {
  margin: 0;
  padding: 2px 12px;
  background: #bbf7d0;
  border: 3px solid var(--outline);
  border-radius: 99px;
  font-weight: 900;
  font-size: 0.9rem;
}
.muted {
  margin: 0;
  font-weight: 700;
  font-size: 0.9rem;
}
.chips {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.chips li {
  display: grid;
  gap: 1px;
  justify-items: center;
  padding: 8px 4px;
  background: #ffe3dc;
  border: 3px solid var(--outline);
  border-radius: 16px;
}
.chips li.good {
  background: #d4f8e4;
}
.ci {
  font-size: 1.4rem;
  line-height: 1.1;
}
.chips b {
  font-size: 1.1rem;
  font-weight: 900;
}
.cl {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--muted);
}
.robot {
  margin: 2px 0 0;
  font-weight: 900;
}
.tips {
  width: 100%;
  display: grid;
  gap: 6px;
  text-align: left;
  padding: 10px 12px;
  background: #fff7d6;
  border: 3px solid var(--outline);
  border-radius: 16px;
}
.tips p {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.35;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}
@media (max-width: 520px), (max-height: 740px) {
  .card.result {
    padding: 14px 14px 16px;
    gap: 6px;
  }
  h2 {
    font-size: 1.6rem;
  }
  .star {
    font-size: 3rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .card.result,
  .star.on {
    animation: none;
  }
}
</style>
