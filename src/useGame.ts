import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef } from 'vue'
import { CFG, DAY_H, autopilotControls, costEUR, createState, fmtTime, insights, runHeadless, startingControls, stepSim, summarize } from './sim'
import type { Controls, Result } from './sim'

export type Phase = 'intro' | 'running' | 'paused' | 'done'

const MS_PER_TICK = 120 // 1200 ticks per day -> one day takes ~2.4 min at 1x
const BEST_KEY = 'grid-balancer-best'

function forecastText(kind: string, active: boolean, inH: number): string {
  const h = inH < 1.2 ? 'about an hour' : `${Math.max(2, Math.round(inH))} hours`
  if (kind === 'cloud') return active ? '☁️ Cloudy now: less solar' : `☁️ Clouds in ${h}: less solar`
  if (kind === 'lull') return active ? '🌫️ Calm spell now: less wind' : `🌫️ Calm spell in ${h}: less wind`
  return active ? '💨 Gusty now: extra wind' : `💨 Gusts in ${h}: extra wind`
}

function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function loadBest(): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v))
  } catch {
    /* storage can be unavailable (private mode); the game works without it */
  }
}

export function useGame() {
  const seed = ref(dailySeed())
  const sim = shallowRef(createState(seed.value))
  const version = ref(0)
  const phase = ref<Phase>('intro')
  const speed = ref(1)
  const locked = ref(false) // true while an overlay (the tour) is open: Space must not start/pause
  const controls = reactive<Controls>(startingControls(sim.value))
  const result = shallowRef<Result | null>(null)
  const autopilot = shallowRef<Result | null>(null)
  const notes = ref<string[]>([])
  const best = ref<number | null>(loadBest())
  const newBest = ref(false)

  let raf = 0
  let last = 0
  let acc = 0

  function finish() {
    phase.value = 'done'
    const r = summarize(sim.value)
    result.value = r
    autopilot.value = summarize(runHeadless(seed.value, (s) => autopilotControls(s)))
    notes.value = insights(sim.value)
    newBest.value = best.value === null || r.score > best.value
    if (newBest.value) {
      best.value = r.score
      saveBest(r.score)
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    if (phase.value !== 'running') {
      last = now
      return
    }
    acc += Math.min(100, now - last) * speed.value
    last = now
    let n = 0
    while (acc >= MS_PER_TICK && n < 8) {
      stepSim(sim.value, controls)
      acc -= MS_PER_TICK
      n++
      if (sim.value.t >= DAY_H - 1e-6) {
        finish()
        break
      }
    }
    if (n > 0) {
      version.value++
      triggerRef(sim)
    }
  }

  function start() {
    acc = 0
    phase.value = 'running'
  }
  function pause() {
    if (phase.value === 'running') phase.value = 'paused'
  }
  function resume() {
    if (phase.value === 'paused') {
      acc = 0
      phase.value = 'running'
    }
  }
  function toggle() {
    if (phase.value === 'running') pause()
    else if (phase.value === 'paused') resume()
    else if (phase.value === 'intro') start()
  }

  /** Restart. `newWeather` rolls a fresh random day, otherwise the same day is replayed. */
  function restart(newWeather: boolean) {
    if (newWeather) seed.value = Math.floor(Math.random() * 1_000_000_000)
    sim.value = createState(seed.value)
    Object.assign(controls, startingControls(sim.value))
    result.value = null
    autopilot.value = null
    notes.value = []
    newBest.value = false
    version.value++
    start()
  }

  function onVisibility() {
    if (document.hidden) pause()
  }
  function onKey(e: KeyboardEvent) {
    if (e.code === 'Space' && e.target === document.body && !locked.value) {
      e.preventDefault()
      toggle()
    }
  }

  onMounted(() => {
    raf = requestAnimationFrame((t) => {
      last = t
      frame(t)
    })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('keydown', onKey)
  })

  // ---------- derived, display-ready values ----------

  const clock = computed(() => fmtTime(sim.value.t))
  const progress = computed(() => Math.min(1, sim.value.t / DAY_H))

  const live = computed(() => {
    const s = sim.value
    const T = s.totals
    return {
      soc: s.soc,
      socPct: (s.soc / CFG.batteryMWh) * 100,
      dev: s.dev,
      hz: 50 + s.dev,
      gas: s.gas,
      factory: s.factory,
      solar: s.solarNow,
      wind: s.windNow,
      gasMWh: T.gasMWh,
      co2: T.co2,
      cost: costEUR(T),
      production: Math.min(1, T.facMWh / CFG.factoryTargetMWh),
      facMWh: T.facMWh,
      stability: s.t > 0.05 ? T.inBandH / s.t : 1,
    }
  })

  const forecast = computed(() => {
    const s = sim.value
    return s.weather.events
      .filter((e) => s.t >= e.start - 2.5 && s.t < e.end)
      .map((e) => ({
        label: e.label,
        kind: e.kind,
        active: s.t >= e.start,
        text: forecastText(e.kind, s.t >= e.start, e.start - s.t),
      }))
  })

  const recentLog = computed(() => {
    const L = sim.value.log
    return L.slice(-4).reverse()
  })

  return {
    seed,
    sim,
    version,
    phase,
    speed,
    locked,
    controls,
    result,
    autopilot,
    notes,
    best,
    newBest,
    clock,
    progress,
    live,
    forecast,
    recentLog,
    start,
    pause,
    resume,
    toggle,
    restart,
  }
}
