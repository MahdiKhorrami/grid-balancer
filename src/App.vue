<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PowerChart from './components/PowerChart.vue'
import BalanceScale from './components/BalanceScale.vue'
import SliderControl from './components/SliderControl.vue'
import ResultCard from './components/ResultCard.vue'
import Tour from './components/Tour.vue'
import SceneBackdrop from './components/SceneBackdrop.vue'
import { useGame } from './useGame'
import { useAmbience } from './useAmbience'
import { CFG } from './sim'

const g = useGame()
const sound = useAmbience(
  () => g.sim.value,
  () => g.phase.value === 'running',
)

// The tour opens first. Nothing moves until the player presses "Start the day!".
const tour = ref(true)
const firstTour = ref(true)
watch(tour, (open) => (g.locked.value = open), { immediate: true })

function playFromTour() {
  tour.value = false
  if (g.phase.value === 'intro') g.start()
  else g.resume()
}
function openHelp() {
  g.pause()
  firstTour.value = false
  tour.value = true
}
function closeHelp() {
  tour.value = false
}

const sample = computed(() => {
  void g.version.value
  const h = g.sim.value.history
  return h.length ? h[h.length - 1] : null
})

const factoryReadout = computed(() => `${g.controls.factory.toFixed(0)} MW`)
const batteryReadout = computed(() => {
  const b = g.controls.battery
  if (Math.abs(b) < 0.25) return 'Idle'
  return b > 0 ? `Using ${b.toFixed(0)}` : `Saving ${(-b).toFixed(0)}`
})
const gasReadout = computed(() => (g.controls.gas < 0.25 ? 'Off' : `${g.controls.gas.toFixed(0)} MW`))

const primaryLabel = computed(() =>
  g.phase.value === 'running' ? 'Pause' : g.phase.value === 'paused' ? 'Resume' : 'Start',
)
const speeds = [
  { v: 0.5, label: '½×' },
  { v: 1, label: '1×' },
  { v: 2, label: '2×' },
]

const bubble = computed(() => g.recentLog.value[0] ?? null)
const dayEmoji = computed(() => {
  const t = g.sim.value.t
  return t < 6 || t >= 20 ? '🌙' : t < 8 ? '🌅' : t < 17 ? '☀️' : '🌇'
})
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="logo" aria-hidden="true">⚡</span>
        <h1>Grid Balancer</h1>
      </div>

      <div class="clock" aria-label="Time of day">
        <span class="time"><span aria-hidden="true">{{ dayEmoji }}</span> {{ g.clock.value }}</span>
        <div class="bar" role="progressbar" :aria-valuenow="Math.round(g.progress.value * 100)" aria-valuemin="0" aria-valuemax="100">
          <i :style="{ width: g.progress.value * 100 + '%' }" />
        </div>
      </div>

      <div class="tools">
        <div class="seg" role="group" aria-label="Game speed">
          <button v-for="s in speeds" :key="s.v" :class="{ on: g.speed.value === s.v }" @click="g.speed.value = s.v">{{ s.label }}</button>
        </div>
        <button class="btn round" aria-label="How to play" @click="openHelp">?</button>
        <button class="btn primary" :disabled="g.phase.value === 'done'" @click="g.toggle()">{{ primaryLabel }}</button>
        <button v-if="g.phase.value !== 'intro'" class="btn round" aria-label="Restart the day" title="Restart" @click="g.restart(false)">↻</button>
      </div>
    </header>

    <main class="layout">
      <section class="left">
        <div class="weather" aria-live="polite">
          <span v-if="g.forecast.value.length === 0" class="wchip calm">☀️ Calm weather for now</span>
          <span v-for="f in g.forecast.value" :key="f.label" :class="['wchip', f.kind, { active: f.active }]">{{ f.text }}</span>
        </div>

        <div class="card scalecard">
          <SceneBackdrop :sim="g.sim.value" />
          <BalanceScale :sample="sample" :dev="g.live.value.dev" />
          <button
            class="btn round sound"
            :aria-label="sound.muted.value ? 'Turn sound on' : 'Turn sound off'"
            :title="sound.muted.value ? 'Sound off' : 'Sound on'"
            @click="sound.toggle()"
          >
            {{ sound.muted.value ? '🔇' : '🔊' }}
          </button>
          <p v-if="bubble" :key="bubble.t" :class="['bubble', bubble.kind]"><span aria-hidden="true">💬</span> {{ bubble.text }}</p>
        </div>

        <div class="card timeline">
          <PowerChart :sim="g.sim.value" :version="g.version.value" compact />
        </div>
      </section>

      <aside class="right">
        <section class="card controls" aria-label="Controls">
          <SliderControl
            v-model="g.controls.factory"
            label="Factory"
            icon="🏭"
            color="var(--factory)"
            :min="CFG.factoryMinMW"
            :max="CFG.factoryMaxMW"
            :step="1"
            :actual="g.live.value.factory"
            :readout="factoryReadout"
            caption="Works hard or rests. Needs enough done by midnight."
          />
          <SliderControl
            v-model="g.controls.battery"
            label="Battery"
            icon="🔋"
            color="var(--battery)"
            :min="-CFG.batteryMW"
            :max="CFG.batteryMW"
            :step="1"
            bipolar
            :readout="batteryReadout"
            caption="Left: save power. Right: use it."
          />
          <SliderControl
            v-model="g.controls.gas"
            label="Gas"
            icon="🔥"
            color="var(--gas)"
            :min="0"
            :max="CFG.gasMaxMW"
            :step="1"
            :actual="g.live.value.gas"
            :readout="gasReadout"
            caption="Backup power. Dirty, and slow to warm up."
          />
        </section>

        <section class="card goals" aria-label="Goals">
          <div class="goal">
            <span class="gi" aria-hidden="true">⚖️</span>
            <div class="gb">
              <div class="gh"><b>Balanced</b><span>{{ Math.round(g.live.value.stability * 100) }}%</span></div>
              <div class="meter"><i class="m-ok" :style="{ width: g.live.value.stability * 100 + '%' }" /></div>
            </div>
          </div>
          <div class="goal">
            <span class="gi" aria-hidden="true">🏭</span>
            <div class="gb">
              <div class="gh"><b>Factory goal</b><span>{{ Math.round(g.live.value.production * 100) }}%</span></div>
              <div class="meter"><i class="m-fac" :style="{ width: g.live.value.production * 100 + '%' }" /></div>
            </div>
          </div>
          <div class="goal">
            <span class="gi" aria-hidden="true">🔋</span>
            <div class="gb">
              <div class="gh"><b>Battery</b><span>{{ Math.round(g.live.value.socPct) }}%</span></div>
              <div class="meter"><i :class="['m-bat', { low: g.live.value.socPct < 12 }]" :style="{ width: g.live.value.socPct + '%' }" /></div>
            </div>
          </div>
          <p class="gas">🔥 Gas used: <b>{{ g.live.value.gasMWh.toFixed(0) }} MWh</b> <span>(less is better)</span></p>
        </section>
      </aside>
    </main>

    <Tour v-if="tour" :first="firstTour" @play="playFromTour" @close="closeHelp" />

    <ResultCard
      v-if="g.phase.value === 'done' && g.result.value"
      :result="g.result.value"
      :autopilot="g.autopilot.value"
      :best="g.best.value"
      :new-best="g.newBest.value"
      :notes="g.notes.value"
      @again="g.restart(false)"
      @new-day="g.restart(true)"
    />
  </div>
</template>
