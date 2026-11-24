<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DAY_H } from '../sim'
import type { Sample, SimState } from '../sim'

// version is bumped every tick by the game loop; the sim object itself is mutated in place.
const props = defineProps<{ sim: SimState; version: number; compact?: boolean }>()
const minH = props.compact ? 70 : 220

// The chart fills whatever space it is given and lays itself out for that real pixel size.
const plot = ref<HTMLElement | null>(null)
const W = ref(900)
const Hpx = ref(380)
let ro: ResizeObserver | undefined
onMounted(() => {
  const el = plot.value
  if (!el) return
  W.value = Math.max(300, Math.round(el.clientWidth))
  Hpx.value = Math.max(minH, Math.round(el.clientHeight))
  ro = new ResizeObserver(([entry]) => {
    W.value = Math.max(300, Math.round(entry.contentRect.width))
    Hpx.value = Math.max(minH, Math.round(entry.contentRect.height))
  })
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const narrow = computed(() => W.value < 560)
const PL = 38
const PR = 10
const PT = 10
const FH = computed(() => (props.compact ? 0 : Hpx.value < 320 ? 46 : 58))
const PH = computed(() => Math.max(50, Hpx.value - PT - (props.compact ? 0 : 30 + FH.value) - 22))
const FT = computed(() => PT + PH.value + 30)
const PW = computed(() => W.value - PL - PR)
const YMAX = 56

const x = (t: number) => PL + (t / DAY_H) * PW.value
const y = (v: number) => PT + PH.value * (1 - Math.min(Math.max(v, 0), YMAX) / YMAX)
const yf = (d: number) => FT.value + FH.value * (0.5 - Math.max(-1, Math.min(1, d)) / 2)

function area(hs: Sample[], lo: (p: Sample) => number, hi: (p: Sample) => number): string {
  if (hs.length < 2) return ''
  let d = ''
  for (let i = 0; i < hs.length; i++) d += `${i ? 'L' : 'M'}${x(hs[i].t).toFixed(1)} ${y(hi(hs[i])).toFixed(1)}`
  for (let i = hs.length - 1; i >= 0; i--) d += `L${x(hs[i].t).toFixed(1)} ${y(lo(hs[i])).toFixed(1)}`
  return d + 'Z'
}

function trace(hs: Sample[], f: (p: Sample) => number, ys: (v: number) => number): string {
  let d = ''
  for (let i = 0; i < hs.length; i++) d += `${i ? 'L' : 'M'}${x(hs[i].t).toFixed(1)} ${ys(f(hs[i])).toFixed(1)}`
  return d
}

const model = computed(() => {
  void props.version // re-evaluate on every tick
  const s = props.sim
  const hs = s.history
  const layers = [
    { key: 'solar', color: 'var(--solar)', d: area(hs, () => 0, (p) => p.solar) },
    { key: 'wind', color: 'var(--wind)', d: area(hs, (p) => p.solar, (p) => p.solar + p.wind) },
    { key: 'gas', color: 'var(--gas)', d: area(hs, (p) => p.solar + p.wind, (p) => p.solar + p.wind + p.gas) },
    {
      key: 'battery',
      color: 'var(--battery)',
      d: area(hs, (p) => p.solar + p.wind + p.gas, (p) => p.solar + p.wind + p.gas + p.batDis),
    },
  ]
  const events = s.weather.events
    .filter((e) => s.t >= e.start - 2.5)
    .map((e) => ({
      kind: e.kind,
      x0: x(e.start),
      w: x(Math.min(e.end, DAY_H)) - x(e.start),
      future: s.t < e.start,
      label: s.t < e.start ? `Forecast: ${e.label}` : e.label,
    }))
  const last = hs[hs.length - 1]
  return {
    layers,
    events,
    demand: hs.length > 1 ? trace(hs, (p) => p.park + p.factory + p.batChg, y) : '',
    freq: hs.length > 1 ? trace(hs, (p) => p.dev, yf) : '',
    cursor: x(Math.min(s.t, DAY_H)),
    dot: last ? { x: x(last.t), y: yf(last.dev), off: Math.abs(last.dev) > 0.2 } : null,
  }
})

const gridY = computed(() => (props.compact ? [30] : [0, 20, 40]))
const gridX = computed(() => (narrow.value ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]))
const bandTop = computed(() => yf(0.2))
const bandH = computed(() => yf(-0.2) - yf(0.2))
</script>

<template>
  <div class="chart">
    <ul v-if="!compact" class="legend">
      <li><i class="sw" style="background: var(--solar)" />Solar</li>
      <li><i class="sw" style="background: var(--wind)" />Wind</li>
      <li><i class="sw" style="background: var(--gas)" />Gas</li>
      <li><i class="sw" style="background: var(--battery)" />Battery</li>
      <li class="sep"><i class="ln" />What the site uses</li>
    </ul>
    <div ref="plot" :class="['plot', { compact }]">
      <svg
        :viewBox="`0 0 ${W} ${Hpx}`"
        role="img"
        aria-label="Live chart of power supply by source against site demand, with the grid frequency below"
      >
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" stroke-width="2" />
          </pattern>
          <clipPath id="plot"><rect :x="PL" :y="PT" :width="PW" :height="PH" /></clipPath>
          <clipPath id="fplot"><rect :x="PL" :y="FT" :width="PW" :height="FH" /></clipPath>
        </defs>

        <g class="grid">
          <template v-for="g in gridY" :key="`y${g}`">
            <line :x1="PL" :x2="W - PR" :y1="y(g)" :y2="y(g)" />
            <text :x="PL - 8" :y="y(g) + 4" text-anchor="end">{{ g }}</text>
          </template>
          <text :x="PL - 8" :y="PT + 2" text-anchor="end" class="unit">MW</text>
        </g>

        <g clip-path="url(#plot)">
          <template v-for="(e, i) in model.events" :key="i">
            <rect :x="e.x0" :y="PT" :width="e.w" :height="PH" :class="['band', e.kind]" />
            <rect v-if="e.future" :x="e.x0" :y="PT" :width="e.w" :height="PH" :class="['band-hatch', e.kind]" fill="url(#hatch)" />
            <text :x="e.x0 + 6" :y="PT + 14" class="band-label">{{ e.label }}</text>
          </template>
        </g>

        <g clip-path="url(#plot)">
          <path v-for="l in model.layers" :key="l.key" :d="l.d" :style="{ fill: l.color }" fill-opacity="0.9" />
          <path :d="model.demand" class="demand" />
        </g>

        <template v-if="!compact">
          <text :x="PL" :y="FT - 10" class="strip-title">Grid frequency (keep the line in the green)</text>
          <rect :x="PL" :y="bandTop" :width="PW" :height="bandH" class="band-ok" />
          <g class="grid">
            <line :x1="PL" :x2="W - PR" :y1="yf(0)" :y2="yf(0)" />
            <text :x="PL - 8" :y="yf(0) + 4" text-anchor="end">50</text>
          </g>
          <g clip-path="url(#fplot)">
            <path :d="model.freq" class="freq" />
          </g>
          <circle v-if="model.dot" :cx="model.dot.x" :cy="model.dot.y" r="4.5" :class="['freq-dot', { off: model.dot.off }]" />
        </template>

        <g class="grid">
          <text v-for="g in gridX" :key="`x${g}`" :x="x(g)" :y="Hpx - 6" text-anchor="middle">
            {{ String(g).padStart(2, '0') }}:00
          </text>
        </g>
        <line :x1="model.cursor" :x2="model.cursor" :y1="PT" :y2="compact ? PT + PH : FT + FH" class="cursor" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
  color: var(--muted);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
.ln {
  width: 16px;
  height: 0;
  border-top: 2px solid var(--ink);
  display: inline-block;
}
.plot {
  position: relative;
  flex: 1;
  min-height: 220px;
}
.plot.compact {
  min-height: 70px;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.grid line {
  stroke: var(--line);
  stroke-width: 1;
}
.grid text {
  fill: var(--muted);
  font: 11px var(--mono);
}
.grid .unit {
  font-size: 10px;
}
.band {
  opacity: 0.1;
}
.band.cloud {
  fill: var(--solar);
}
.band.lull,
.band.gust {
  fill: var(--wind);
}
.band-hatch {
  opacity: 0.13;
}
.band-hatch.cloud {
  color: var(--solar);
}
.band-hatch.lull,
.band-hatch.gust {
  color: var(--wind);
}
.band-label {
  fill: var(--ink);
  opacity: 0.8;
  font: 600 11px var(--sans);
}
.demand {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2.4;
  stroke-linejoin: round;
}
.strip-title {
  fill: var(--muted);
  font: 600 10px var(--sans);
  letter-spacing: 0.05em;
}
.band-ok {
  fill: var(--ok);
  opacity: 0.14;
}
.freq {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1.8;
  stroke-linejoin: round;
}
.freq-dot {
  fill: var(--ok);
  stroke: var(--panel);
  stroke-width: 2;
}
.freq-dot.off {
  fill: var(--gas);
}
.cursor {
  stroke: var(--ink);
  stroke-width: 1;
  opacity: 0.35;
}
</style>
