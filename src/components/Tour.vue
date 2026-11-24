<script setup lang="ts">
import { computed, ref } from 'vue'

defineProps<{ first: boolean }>()
const emit = defineEmits<{ play: []; close: [] }>()

interface Row {
  icon: string
  name: string
  text: string
  color?: string
}
interface Step {
  title: string
  lead: string
  rows?: Row[]
  big?: string
}

const steps: Step[] = [
  {
    title: 'Keep the scale level',
    lead: 'A little town and a factory run on their own power plant. Power made has to match power used, all day long. If the scale tips, the grid gets shaky.',
    big: '🔋☀️💨  ⚖️  🏭🏘️',
  },
  {
    title: 'Power made (left side)',
    lead: 'Four things can fill the left pan:',
    rows: [
      { icon: '☀️', name: 'Solar', text: 'Free, but only when the sun is out.', color: 'var(--solar)' },
      { icon: '💨', name: 'Wind', text: 'Free, but it comes and goes.', color: 'var(--wind)' },
      { icon: '🔋', name: 'Battery', text: 'Saves power for later. Can run empty!', color: 'var(--battery)' },
      { icon: '🔥', name: 'Gas', text: 'Always there, but dirty, costly and slow to start.', color: 'var(--gas)' },
    ],
  },
  {
    title: 'Power used (right side)',
    lead: 'Three things empty the right pan:',
    rows: [
      { icon: '🏘️', name: 'Town', text: 'Always needs power. You cannot change it.', color: '#94a3b8' },
      { icon: '🏭', name: 'Factory', text: 'Your choice! It needs enough work done by midnight.', color: 'var(--factory)' },
      { icon: '🔋', name: 'Battery charging', text: 'Soaks up extra power when there is too much.', color: 'var(--battery)' },
    ],
  },
  {
    title: 'Watch the weather',
    lead: 'Clouds cut the sun. A calm spell cuts the wind. The banner on top warns you a few hours ahead, and the timeline at the bottom shows the whole day. Turn your sound on: you can hear the wind too.',
    rows: [
      { icon: '☁️', name: 'Clouds', text: 'Less solar for a few hours.', color: 'var(--solar)' },
      { icon: '🌫️', name: 'Calm spell', text: 'Less wind for a few hours.', color: 'var(--wind)' },
      { icon: '💨', name: 'Gusts', text: 'More wind. Use it or lose it!', color: 'var(--wind)' },
    ],
  },
  {
    title: 'Your three sliders',
    lead: 'Move them any time. Charge the battery when power is cheap and free, use it when the weather turns, and start gas early only if you must.',
    rows: [
      { icon: '🏭', name: 'Factory', text: 'How hard the factory works.', color: 'var(--factory)' },
      { icon: '🔋', name: 'Battery', text: 'Left: save power. Right: use it.', color: 'var(--battery)' },
      { icon: '🔥', name: 'Gas', text: 'Backup power. Takes a while to warm up.', color: 'var(--gas)' },
    ],
  },
]

const i = ref(0)
const step = computed(() => steps[i.value])
const last = computed(() => i.value === steps.length - 1)

function next() {
  if (last.value) emit('play')
  else i.value++
}
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" aria-label="How to play">
    <div class="tour">
      <p class="count">How to play · {{ i + 1 }} of {{ steps.length }}</p>
      <h2>{{ step.title }}</h2>
      <p class="lead">{{ step.lead }}</p>

      <p v-if="step.big" class="big" aria-hidden="true">{{ step.big }}</p>

      <ul v-if="step.rows" class="rows">
        <li v-for="r in step.rows" :key="r.name">
          <span class="chip" :style="{ background: r.color }" aria-hidden="true">{{ r.icon }}</span>
          <span class="txt"><b>{{ r.name }}</b><br />{{ r.text }}</span>
        </li>
      </ul>

      <div class="dots" aria-hidden="true">
        <i v-for="n in steps.length" :key="n" :class="{ on: n - 1 === i }" />
      </div>

      <div class="actions">
        <button v-if="i > 0" class="btn" @click="i--">Back</button>
        <button v-else-if="!first" class="btn" @click="emit('close')">Close</button>
        <button v-else class="btn ghost" @click="emit('play')">Skip tour</button>
        <button class="btn primary big" @click="next">{{ last ? (first ? 'Start the day!' : 'Got it!') : 'Next' }}</button>
      </div>
      <p v-if="last && first" class="fine">The clock only starts when you press the button.</p>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 14px;
  background: rgb(31 42 68 / 0.55);
  backdrop-filter: blur(3px);
}
.tour {
  width: min(520px, 100%);
  max-height: calc(100dvh - 28px);
  overflow-y: auto;
  display: grid;
  gap: 12px;
  padding: 22px;
  background: #fff;
  border: 3px solid var(--outline);
  border-radius: 26px;
  box-shadow: 0 8px 0 var(--outline);
  animation: pop 0.25s ease-out;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
}
.count {
  margin: 0;
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
h2 {
  margin: 0;
  font-size: 1.7rem;
  line-height: 1.1;
}
.lead {
  margin: 0;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink);
}
.big {
  margin: 0;
  text-align: center;
  font-size: 2.6rem;
  letter-spacing: 6px;
  padding: 10px 0;
  background: var(--sky);
  border: 3px solid var(--outline);
  border-radius: 18px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.rows li {
  display: flex;
  align-items: center;
  gap: 12px;
}
.chip {
  flex: none;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  font-size: 1.5rem;
  border: 3px solid var(--outline);
  border-radius: 14px;
}
.txt {
  font-size: 0.92rem;
  line-height: 1.3;
  font-weight: 600;
  color: var(--muted);
}
.txt b {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 900;
}
.dots {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.dots i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--track);
  border: 2px solid var(--outline);
}
.dots i.on {
  background: var(--solar);
  transform: scale(1.25);
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.fine {
  margin: 0;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}
.btn.ghost {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--muted);
}
@media (max-width: 520px), (max-height: 700px) {
  .tour {
    padding: 16px;
    gap: 9px;
  }
  h2 {
    font-size: 1.4rem;
  }
  .big {
    font-size: 2rem;
  }
  .chip {
    width: 40px;
    height: 40px;
    font-size: 1.25rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tour {
    animation: none;
  }
}
</style>
