import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Ambience } from './ambience'
import { ambient } from './sim'
import type { SimState } from './sim'
import { daylight } from './sky'

const KEY = 'grid-balancer-sound'

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off'
  } catch {
    return false
  }
}

/**
 * Plays the weather soundscape while the game is running and not muted.
 * Audio only starts after the player's first click or key press (browser rule).
 */
export function useAmbience(getSim: () => SimState, isRunning: () => boolean) {
  const muted = ref(readMuted())
  const amb = new Ambience()
  let timer = 0

  function unlock() {
    amb.unlock()
  }
  function push() {
    const s = getSim()
    const a = ambient(s.weather, s.t)
    amb.update({ wind: a.wind, clear: a.clear, day: daylight(s.t), on: isRunning() && !muted.value })
  }
  function onVisibility() {
    amb.setVisible(!document.hidden)
  }
  function toggle() {
    muted.value = !muted.value
    unlock()
    push()
  }

  watch(muted, (m) => {
    try {
      localStorage.setItem(KEY, m ? 'off' : 'on')
    } catch {
      /* storage can be unavailable; the toggle still works for this visit */
    }
  })

  onMounted(() => {
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', onVisibility)
    timer = window.setInterval(push, 200)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(timer)
    amb.dispose()
  })

  return { muted, toggle }
}
