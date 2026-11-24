<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  icon: string
  min: number
  max: number
  step: number
  modelValue: number
  color: string
  readout: string
  caption?: string
  /** The value the equipment has actually reached (slow actuators lag the setpoint). */
  actual?: number
  /** Fill the track from the centre (for the battery: charge <-> discharge). */
  bipolar?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const pct = (v: number) => ((v - props.min) / (props.max - props.min)) * 100

const trackBg = computed(() => {
  const p = pct(props.modelValue)
  if (props.bipolar) {
    const lo = Math.min(p, 50)
    const hi = Math.max(p, 50)
    return `linear-gradient(to right, var(--track) 0 ${lo}%, var(--accent) ${lo}% ${hi}%, var(--track) ${hi}% 100%)`
  }
  return `linear-gradient(to right, var(--accent) 0 ${p}%, var(--track) ${p}% 100%)`
})

// the thumb is 38px wide, so the usable range is inset by 19px on both sides
const actualLeft = computed(() =>
  props.actual === undefined ? '' : `calc(19px + (100% - 38px) * ${pct(props.actual) / 100})`,
)

function onInput(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="slider" :style="{ '--accent': color, '--track-bg': trackBg }">
    <div class="head">
      <span class="label"><span class="icon" aria-hidden="true">{{ icon }}</span>{{ label }}</span>
      <span class="value">{{ readout }}</span>
    </div>
    <div class="wrap">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :aria-label="label"
        @input="onInput"
      />
      <span v-if="actual !== undefined" class="actual" :style="{ left: actualLeft }" title="What it is really doing right now" />
    </div>
    <p v-if="caption" class="caption">{{ caption }}</p>
    <slot />
  </div>
</template>

<style scoped>
.slider {
  display: grid;
  gap: 4px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 900;
  font-size: 1.05rem;
}
.icon {
  font-size: 1.4rem;
  line-height: 1;
}
.value {
  font: 900 1.05rem var(--sans);
  font-variant-numeric: tabular-nums;
  background: var(--accent);
  border: 3px solid var(--outline);
  border-radius: 99px;
  padding: 1px 12px;
}
.wrap {
  position: relative;
  display: flex;
  align-items: center;
  height: 42px;
}
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 42px;
  margin: 0;
  background: transparent;
  cursor: grab;
}
input[type='range']:active {
  cursor: grabbing;
}
input[type='range']::-webkit-slider-runnable-track {
  box-sizing: border-box;
  height: 22px;
  border-radius: 99px;
  border: 3px solid var(--outline);
  background: var(--track-bg);
}
input[type='range']::-moz-range-track {
  box-sizing: border-box;
  height: 22px;
  border-radius: 99px;
  border: 3px solid var(--outline);
  background: var(--track-bg);
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 38px;
  height: 38px;
  margin-top: -8px;
  border-radius: 50%;
  background: #fff;
  border: 4px solid var(--outline);
  box-shadow: 0 4px 0 var(--outline);
  transition: transform 0.12s ease-out;
}
input[type='range']::-moz-range-thumb {
  box-sizing: border-box;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fff;
  border: 4px solid var(--outline);
  box-shadow: 0 4px 0 var(--outline);
  transition: transform 0.12s ease-out;
}
input[type='range']:active::-webkit-slider-thumb {
  transform: scale(1.12) translateY(-2px);
}
input[type='range']:active::-moz-range-thumb {
  transform: scale(1.12) translateY(-2px);
}
input[type='range']:focus-visible {
  outline: none;
}
input[type='range']:focus-visible::-webkit-slider-thumb {
  background: var(--accent);
}
.actual {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 30px;
  margin-left: -3px;
  transform: translateY(-50%);
  background: var(--outline);
  border: 2px solid #fff;
  border-radius: 4px;
  pointer-events: none;
}
.caption {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  line-height: 1.3;
}
@media (prefers-reduced-motion: reduce) {
  input[type='range']::-webkit-slider-thumb,
  input[type='range']::-moz-range-thumb {
    transition: none;
  }
}
</style>
