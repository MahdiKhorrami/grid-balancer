<script setup lang="ts">
import { computed } from 'vue'
import type { Sample } from '../sim'

const props = defineProps<{ sample: Sample | null; dev: number }>()

const CX = 300
const CY = 92
const L = 190 // half beam length
const PX_PER_MW = 1.9
const BOTTOM = 136 // bucket floor, relative to the hook

const angle = computed(() => Math.max(-20, Math.min(20, props.dev * 32))) // + = too much supply
const rad = computed(() => (angle.value * Math.PI) / 180)
const left = computed(() => ({ x: CX - L * Math.cos(rad.value), y: CY + L * Math.sin(rad.value) }))
const right = computed(() => ({ x: CX + L * Math.cos(rad.value), y: CY - L * Math.sin(rad.value) }))

interface Block {
  key: string
  mw: number
  color: string
  icon: string
}

function stack(parts: Block[]) {
  let y = BOTTOM
  return parts
    .filter((b) => b.mw > 0.3)
    .map((b) => {
      const h = b.mw * PX_PER_MW
      y -= h
      return { ...b, y, h }
    })
}

const made = computed(() => {
  const p = props.sample
  if (!p) return []
  return stack([
    { key: 'solar', mw: p.solar, color: 'var(--solar)', icon: '☀️' },
    { key: 'wind', mw: p.wind, color: 'var(--wind)', icon: '💨' },
    { key: 'gas', mw: p.gas, color: 'var(--gas)', icon: '🔥' },
    { key: 'bat', mw: p.batDis, color: 'var(--battery)', icon: '🔋' },
  ])
})
const used = computed(() => {
  const p = props.sample
  if (!p) return []
  return stack([
    { key: 'park', mw: p.park, color: '#94a3b8', icon: '🏘️' },
    { key: 'fac', mw: p.factory, color: 'var(--factory)', icon: '🏭' },
    { key: 'chg', mw: p.batChg, color: 'var(--battery)', icon: '🔋' },
  ])
})
const madeTotal = computed(() => made.value.reduce((a, b) => a + b.mw, 0))
const usedTotal = computed(() => used.value.reduce((a, b) => a + b.mw, 0))

const mood = computed(() => {
  const a = Math.abs(props.dev)
  if (a <= 0.2) return { face: '😊', text: 'Perfectly balanced!', cls: 'ok' }
  const text = props.dev > 0 ? 'Too much power!' : 'Not enough power!'
  return a <= 0.5 ? { face: '😬', text, cls: 'warn' } : { face: '😱', text, cls: 'bad' }
})
</script>

<template>
  <div class="scale">
    <svg viewBox="0 0 600 350" role="img" :aria-label="`Power made ${madeTotal.toFixed(0)} megawatts, power used ${usedTotal.toFixed(0)} megawatts. ${mood.text}`">
      <defs>
        <clipPath id="bucket"><rect x="-60" y="28" width="120" height="110" rx="6" /></clipPath>
      </defs>

      <!-- stand -->
      <path d="M270 330 L300 96 L330 330 Z" class="stand" />
      <rect x="236" y="326" width="128" height="16" rx="8" class="stand" />

      <!-- beam -->
      <g class="beam" :style="{ transform: `rotate(${-angle}deg)`, transformOrigin: `${CX}px ${CY}px` }">
        <rect :x="CX - L - 10" :y="CY - 8" :width="2 * L + 20" height="16" rx="8" class="beamrect" />
      </g>
      <circle :cx="CX" :cy="CY" r="15" class="hub" />
      <text :x="CX" :y="CY - 30" text-anchor="middle" class="face">{{ mood.face }}</text>

      <!-- left pan: power made -->
      <g class="pan" :style="{ transform: `translate(${left.x}px, ${left.y}px)` }">
        <line x1="0" y1="0" x2="0" y2="28" class="rope" />
        <path d="M-68 28 H68 L54 134 Q53 142 45 142 H-45 Q-53 142 -54 134 Z" class="bucket" />
        <g clip-path="url(#bucket)">
          <g v-for="b in made" :key="b.key">
            <rect x="-52" :y="b.y" width="104" :height="b.h" rx="5" :style="{ fill: b.color }" class="blk" />
            <text v-if="b.h > 20" x="0" :y="b.y + b.h / 2 + 7" text-anchor="middle" class="blk-icon">{{ b.icon }}</text>
          </g>
        </g>
        <text x="0" y="172" text-anchor="middle" class="pan-title">Power made</text>
        <text x="0" y="198" text-anchor="middle" class="pan-num">{{ madeTotal.toFixed(0) }} MW</text>
      </g>

      <!-- right pan: power used -->
      <g class="pan" :style="{ transform: `translate(${right.x}px, ${right.y}px)` }">
        <line x1="0" y1="0" x2="0" y2="28" class="rope" />
        <path d="M-68 28 H68 L54 134 Q53 142 45 142 H-45 Q-53 142 -54 134 Z" class="bucket" />
        <g clip-path="url(#bucket)">
          <g v-for="b in used" :key="b.key">
            <rect x="-52" :y="b.y" width="104" :height="b.h" rx="5" :style="{ fill: b.color }" class="blk" />
            <text v-if="b.h > 20" x="0" :y="b.y + b.h / 2 + 7" text-anchor="middle" class="blk-icon">{{ b.icon }}</text>
          </g>
        </g>
        <text x="0" y="172" text-anchor="middle" class="pan-title">Power used</text>
        <text x="0" y="198" text-anchor="middle" class="pan-num">{{ usedTotal.toFixed(0) }} MW</text>
      </g>
    </svg>
    <p :class="['verdict', mood.cls]">{{ mood.text }}</p>
  </div>
</template>

<style scoped>
.scale {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  height: 100%;
}
svg {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: visible;
}
.stand {
  fill: #ffd37a;
  stroke: var(--outline);
  stroke-width: 4;
  stroke-linejoin: round;
}
.beamrect {
  fill: var(--solar);
  stroke: var(--outline);
  stroke-width: 4;
}
.beam {
  transition: transform 0.18s ease-out;
}
.hub {
  fill: #fff;
  stroke: var(--outline);
  stroke-width: 4;
}
.face {
  font-size: 38px;
}
.pan {
  transition: transform 0.18s ease-out;
}
.rope {
  stroke: var(--outline);
  stroke-width: 4;
  stroke-linecap: round;
}
.bucket {
  fill: #fff;
  stroke: var(--outline);
  stroke-width: 4;
  stroke-linejoin: round;
}
.blk {
  stroke: var(--outline);
  stroke-width: 2.5;
}
.blk-icon {
  font-size: 16px;
}
.pan-title {
  fill: var(--muted);
  font: 800 13px var(--sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  fill: var(--ink);
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 6px;
  stroke-linejoin: round;
}
.pan-num {
  fill: var(--ink);
  font: 900 24px var(--sans);
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 7px;
  stroke-linejoin: round;
}
.verdict {
  margin: 0;
  padding: 4px 18px;
  border-radius: 99px;
  border: 3px solid var(--outline);
  font-weight: 900;
  font-size: 1.15rem;
  box-shadow: 0 3px 0 var(--outline);
}
.verdict.ok {
  background: #bbf7d0;
}
.verdict.warn {
  background: #fde68a;
}
.verdict.bad {
  background: #fecaca;
}
@media (prefers-reduced-motion: reduce) {
  .beam,
  .pan {
    transition: none;
  }
}
</style>
